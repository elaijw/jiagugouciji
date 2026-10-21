# -*- coding: utf-8 -*-
"""线上核验：确认推上去的东西**在线上真的生效、页面真的还能用**。

分两层，缺一层都不够：

1. **内容层**——本地文件与线上同路径文件逐字节比大小。
   为什么不能只看提交 sha：GitHub Pages 是异步构建的，提交成功后还有
   1~2 分钟构建窗口，期间线上仍是旧文件。只看 sha 就宣布上线，
   用户刷新到的还是老版本。
2. **功能层**——真浏览器逐个打开线上八个页面，看应用有没有真的挂起来、
   控制台有没有抛异常。

功能层为什么用 CDP 而不用 `--dump-dom`：
  原先用 `edge --headless --dump-dom --virtual-time-budget=N`，**不稳**。
  同样的八个页面跑两轮，失败的页面还不一样（一轮空 3 个、一轮空 5 个）——
  有图要下载的页面会拖住虚拟时钟，输出直接是空的。更糟的是空 DOM 里
  搜"报错"字样当然搜不到，于是**空跑也算通过**。
  现在改成 CDP：一个浏览器、逐页导航、轮询"应用真的挂起来了"再判定，
  每页收集自己的控制台异常。判据是"挂起来才算过"，不是"没搜到错就算过"。

用法：
    python dev/_live_check.py                # 内容层关键文件 + 功能层八页
    python dev/_live_check.py --content      # 只做内容层（快）
    python dev/_live_check.py --pages        # 只做功能层
    python dev/_live_check.py --all          # 内容层查仓库全部文件
    python dev/_live_check.py --wait         # 内容没生效就轮询，最多等 10 分钟
    python dev/_live_check.py --needle "js/modes/boss-raid.js=POOL_SIZE"

**关于 `--all`**：它要把整站（约 30MB、227 个文件）拉一遍，在本机代理下实测
12 分钟才走完 16 个，还夹着 502 与读超时——那些是**网络**错误，不是内容不一致，
但它们会把结果淹掉，所以不适合当日常手段。

要证明"远端每个文件都和本地一样"，**比 blob sha 就够了，不用下载内容**：

    GH_TOKEN=... python dev/_push_api.py --dry

输出「没有需要推的东西」= 远端树的每个 blob 都与本地逐字节相同（227 个全覆盖，
精确）。GitHub Pages 直接服务同一棵树，所以内容层其实只需要**抽几个文件**确认
Pages 那一层确实在发新字节（默认那 8 个关键文件就是干这个的）。
"""
import argparse
import json
import os
import subprocess
import sys
import time
import urllib.request

import requests

EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
NODE = r"C:\Users\32058\.workbuddy\binaries\node\versions\22.22.2-6\node.exe"
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(REPO, "_check")
BASE = "https://elaijw.github.io/jiagugouciji/"

SKIP_DIRS = {"_check", "_bak", "_edgeprof", "_docpages", "__pycache__", ".git"}
# 和 dev/_push_api.py 保持一致：这两个不参与推送，自然也不该拿来做线上比对。
# deploy.ps1 与远端只差行尾符；根目录 _cdp_*.js 是跑验证时的临时探针。
SKIP_FILES = {"deploy.ps1"}
HTTP_H = {"Cache-Control": "no-cache", "Pragma": "no-cache",
          "User-Agent": "Mozilla/5.0 (compatible; live-check)"}

# 改动最频繁、最值得盯的几个
KEY_FILES = [
    "index.html",
    "js/core/_data.js",
    "js/core/levels.json",
    "js/core/atlas.js",
    "js/core/shell.js",
    "js/modes/boss-raid.js",
    "css/modes.css",
    "css/ui.css",
]

# (显示名, 导航用的 hash, 应用规范化后可能落在的路由)
# 为什么要给"可接受集合"而不是直接比 hash：首页导航到 hash 为空，但路由会把它
# 规范化成 #/home。写死比 "" 会让首页永远判失败——那是探针的错，不是站点的错。
PAGES = [
    ("主页", "", ["", "#/home"]),
    ("开始游戏", "#/modes", ["#/modes"]),
    ("汉字图鉴", "#/atlas", ["#/atlas"]),
    ("玩法说明", "#/howto", ["#/howto"]),
    ("设置", "#/settings", ["#/settings"]),
    ("甲骨构字", "#/play/bone-build", ["#/play/bone-build"]),
    ("殷商王邑", "#/play/wangyi-map", ["#/play/wangyi-map"]),
    ("构件讨伐", "#/play/boss-raid", ["#/play/boss-raid"]),
]

CDP = r'''
const ws = new WebSocket(process.argv[2]);
let id = 0; const pending = new Map();
const send = (m, p) => new Promise(r => { const i = ++id; pending.set(i, r);
  ws.send(JSON.stringify({id: i, method: m, params: p || {}})); });
let cerrs = [];
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails || {};
    const t = (d.exception && d.exception.description) || d.text || 'exception';
    cerrs.push(('异常: ' + t).replace(/[ \n\r\t]+/g, ' ').slice(0, 140));
  } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    const t = (m.params.args || []).map(a => a.value || a.description || '').join(' ');
    cerrs.push(('console.error: ' + t).replace(/[ \n\r\t]+/g, ' ').slice(0, 140));
  }
});
const ev = async (expr) => {
  const a = await send('Runtime.evaluate', {expression: expr, returnByValue: true});
  if (a.exceptionDetails) {
    const d = a.exceptionDetails;
    return 'ERR:' + ((d.exception && d.exception.description) || d.text);
  }
  return a.result && a.result.value;
};
const wait = (ms) => new Promise(r => setTimeout(r, ms));
async function waitFor(expr, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await ev(expr) === true) return true; await wait(250); }
  return false;
}
ws.addEventListener('open', async () => {
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride',
    {width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false});
  const pages = JSON.parse(process.argv[3]);
  const base = process.argv[4];
  const perPage = +(process.argv[5] || 60000);
  const out = [];
  /* 先预热一次。冷缓存下第一页要拉 index + _data.js(285KB) + 两个 css(230KB)，
     实测偶发超过 40 秒——那是"慢"，不是"坏"，但会被记成"没挂起来"。
     先导航一次把静态资源落进缓存，后面八页就都在同一条件下比。 */
  await send('Page.navigate', {url: base});
  await waitFor("!!document.querySelector('#sceneRoot') && " +
    "document.querySelector('#sceneRoot').children.length>0", perPage);
  for (const [name, hash, accept] of pages) {
    cerrs = [];
    const t0 = Date.now();
    await send('Page.navigate', {url: base + hash});
    /* 就绪判据：真的落在 github.io 上、路由落在预期集合里、**且**挂载点里有
       子节点。三者缺一不可——只看"挂载点有子节点"会在上一页的 DOM 上假绿。 */
    const routeExpr = "(" + accept.map(a => "location.hash===" +
      JSON.stringify(a)).join(" || ") + ")";
    const ok = await waitFor("location.host.indexOf('github.io')>=0 && " +
      routeExpr + " && !!document.querySelector('#sceneRoot') && " +
      "document.querySelector('#sceneRoot').children.length>0", perPage);
    const ms = Date.now() - t0;
    await wait(1200);
    const st = await ev("JSON.stringify((function(){var r=document.querySelector('#sceneRoot');" +
      "var s=document.querySelector('.scene');" +
      "return {hash:location.hash, host:location.host," +
      "rootKids:r?r.children.length:-1," +
      "scene:s?('scene'+((s.className||'').replace('scene',''))):'-'};})())");
    /* 失败时把"到底哪一条没满足"带回来。只说"没挂起来"是猜不出原因的：
       可能是没导航成功、可能路由没落对、也可能真没挂载。 */
    let diag = '';
    if (!ok) {
      diag = await ev("JSON.stringify({href:location.href, host:location.host," +
        "hash:location.hash, ready:document.readyState," +
        "hasRoot:!!document.querySelector('#sceneRoot')," +
        "rootKids:(function(){var r=document.querySelector('#sceneRoot');" +
        "return r?r.children.length:-1;})()," +
        "bodyLen:(document.body?document.body.innerHTML.length:-1)})");
    }
    out.push({name: name, ok: ok, st: st, errs: cerrs.slice(0, 3),
              diag: diag, ms: ms});
  }
  console.log('PAGES:' + JSON.stringify(out));
  try { await send('Browser.close'); } catch (e) {}
  ws.close(); process.exit(0);
});
'''


def tracked_files():
    out = []
    for dp, dns, fns in os.walk(REPO):
        dns[:] = [d for d in dns if d not in SKIP_DIRS]
        for fn in fns:
            if fn.endswith(".pyc"):
                continue
            rel = os.path.relpath(os.path.join(dp, fn), REPO).replace("\\", "/")
            if rel in SKIP_FILES:
                continue
            if "/" not in rel and fn.startswith("_cdp") and fn.endswith(".js"):
                continue
            out.append(rel)
    return sorted(out)


def content_pass(paths, needles):
    """本地与线上逐字节比大小。GitHub Pages 直接吐原始字节，不做转换。"""
    bad = []
    print("  %-32s %11s %11s  %s" % ("文件", "本地字节", "线上字节", "结果"))
    for rel in paths:
        local_p = os.path.join(REPO, rel.replace("/", os.sep))
        if not os.path.exists(local_p):
            print("  %-32s %11s %11s  %s" % (rel, "-", "-", "本地没有这个文件"))
            bad.append(rel)
            continue
        size = os.path.getsize(local_p)
        try:
            r = requests.get(BASE + rel, headers=HTTP_H, timeout=120)
        except Exception as e:
            print("  %-32s %11d %11s  %s" % (rel, size, "-", "取不到：%s" % e))
            bad.append(rel)
            continue
        live = len(r.content)
        if r.status_code != 200:
            verdict = "HTTP %s" % r.status_code
            bad.append(rel)
        elif live != size:
            verdict = "！不一致（线上还是旧版）"
            bad.append(rel)
        else:
            verdict = "一致"
        print("  %-32s %11d %11d  %s" % (rel, size, live, verdict))

    for rel, needle in needles:
        try:
            hit = needle in requests.get(BASE + rel, headers=HTTP_H, timeout=120).text
        except Exception:
            hit = False
        print("  断言 %-26s 含「%s」：%s" % (rel, needle, "是" if hit else "否"))
        if not hit:
            bad.append(rel + "=" + needle)
    return bad


def pages_pass(per_page=60):
    """CDP 逐页导航，确认应用真的挂起来了。见文件头"为什么不用 --dump-dom"。"""
    os.makedirs(OUT, exist_ok=True)
    ns = os.path.join(OUT, "_cdp_pages.js")
    with open(ns, "w", encoding="utf-8") as f:
        f.write(CDP)

    port = 9300 + (os.getpid() % 400)
    prof = os.path.join(OUT, "pagesprof-%d" % os.getpid())
    subprocess.run(["cmd", "/c", "rd", "/s", "/q", prof], capture_output=True)
    child = subprocess.Popen([EDGE, "--headless=new", "--disable-gpu", "--no-sandbox",
                              "--remote-debugging-port=%d" % port,
                              "--user-data-dir=" + prof,
                              "--window-size=1280,1000", "about:blank"],
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    targets, pages = None, []
    for _ in range(70):
        time.sleep(0.4)
        try:
            targets = json.load(urllib.request.urlopen(
                "http://127.0.0.1:%d/json/list" % port, timeout=10))
            if any(t.get("type") == "page" and t.get("webSocketDebuggerUrl") for t in targets):
                break
        except Exception:
            pass
    pages = [t for t in (targets or [])
             if t.get("type") == "page" and t.get("webSocketDebuggerUrl")]
    if not pages:
        child.kill()
        print("  ！没拿到可调试的 page target，功能层没测到")
        return len(PAGES)

    timeout = per_page * (len(PAGES) + 1) + 120
    try:
        r = subprocess.run([NODE, ns, pages[0]["webSocketDebuggerUrl"],
                            json.dumps(PAGES, ensure_ascii=False), BASE,
                            str(per_page * 1000)],
                           capture_output=True, text=True, encoding="utf-8",
                           errors="replace", timeout=timeout)
    except subprocess.TimeoutExpired:
        child.kill()
        print("  ！整轮超时（%ds），功能层没测到" % timeout)
        return len(PAGES)
    child.kill()

    rows = None
    for line in (r.stdout or "").splitlines():
        if line.startswith("PAGES:"):
            try:
                rows = json.loads(line[6:])
            except Exception:
                rows = None
    if rows is None:
        print("  ！探针没有交回结果。stderr：%s" % (r.stderr or "")[-400:])
        return len(PAGES)

    bad = 0
    for row in rows:
        st = row.get("st")
        st = json.loads(st) if isinstance(st, str) and st.startswith("{") else {}
        errs = row.get("errs") or []
        if not row.get("ok"):
            bad += 1
            print("  %-10s 没通过。诊断：%s" % (row["name"], row.get("diag") or st))
            continue
        if errs:
            bad += 1
            print("  %-10s dom 就绪  场景 %-26s 控制台有异常：%s"
                  % (row["name"], st.get("scene"), errs[:2]))
            continue
        print("  %-10s 挂载 %2s 个顶层节点  场景 %-26s 控制台干净  %5ss"
              % (row["name"], st.get("rootKids"), st.get("scene"),
                 round((row.get("ms") or 0) / 1000.0, 1)))
    print("  功能层：%s" % ("八页全部正常" if bad == 0 else "%d 页未通过" % bad))
    return bad


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("paths", nargs="*")
    ap.add_argument("--all", action="store_true", help="内容层查仓库全部文件")
    ap.add_argument("--content", action="store_true", help="只做内容层")
    ap.add_argument("--pages", action="store_true", help="只做功能层")
    ap.add_argument("--needle", action="append", default=[],
                    help="额外断言，格式 路径=字符串（可多次）")
    ap.add_argument("--wait", action="store_true", help="内容没生效就轮询，最多 10 分钟")
    ap.add_argument("--page-timeout", type=int, default=45, help="单页就绪等待秒数")
    a = ap.parse_args()

    both = not a.content and not a.pages
    paths = a.paths or (tracked_files() if a.all else KEY_FILES)
    needles = []
    for spec in a.needle:
        rel, _, s = spec.partition("=")
        needles.append((rel, s))

    print("线上站点：%s\n" % BASE)
    rc = 0

    if both or a.content:
        print("① 内容层：本地 vs 线上（%d 个文件）" % len(paths))
        deadline = time.time() + 600 if a.wait else time.time()
        attempt = 0
        while True:
            attempt += 1
            if attempt > 1:
                print("第 %d 次核对…" % attempt)
            bad = content_pass(paths, needles)
            if not bad:
                print("  内容层：线上与本地完全一致\n")
                break
            if time.time() >= deadline:
                print("  内容层：未生效 %d 处：%s" % (len(bad), bad[:8]))
                print("  等久了还不一致，去仓库 Actions / Pages 看构建有没有报错。\n")
                rc = 1
                break
            print("  还差 %d 处，等 20 秒再探（Pages 构建中）…\n" % len(bad))
            time.sleep(20)

    if both or a.pages:
        print("② 功能层：真浏览器逐个打开线上页面（CDP 就绪轮询）")
        rc = max(rc, 1 if pages_pass(a.page_timeout) else 0)
        print()

    print("结论：%s" % ("线上核验通过" if rc == 0 else "线上核验未通过，见上面明细"))
    return rc


if __name__ == "__main__":
    sys.exit(main())
