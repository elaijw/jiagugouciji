// 验证 file:// 下本地音频到底能不能出声 —— 这是"放音乐文件"方案的前提。
//
// 要回答三件事：
//   ① <audio src="./x.mp3"> 在 file:// 下能否加载、能否播放（currentTime 前进）
//   ② createMediaElementSource 接进 Web Audio 图后，会不会因为"跨源"被静音
//      （file:// 是 opaque origin，这是真实风险，很多方案就是死在这一步）
//   ③ 能不能不用 Web Audio，直接用 audio.volume 控制音量外放
//
// 用法：node dev/_probe_filemedia.js <音频文件相对路径>
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const FILE = process.argv[2] || 'assets/_probe_tone.wav';
const ROOT = 'C:/Users/32058/WorkBuddy/2026-10-15-12-50-44/repo_extract/jiagugouciji-main';
const PORT = 9800 + (process.pid % 150);
const PROFILE = path.join(os.tmpdir(), 'zq_fm_' + process.pid);
/* 探针 HTML 落在 dev/ 下，所以 src 不能写相对路径（会解析到 dev/assets/）。
   直接用绝对 file URL。 */
const SRC = 'file:///' + ROOT.replace(/\\/g, '/') + '/' + FILE;

const getJson = (u) => new Promise((res, rej) => {
  http.get(u, (r) => { let s = ''; r.on('data', (c) => s += c); r.on('end', () => { try { res(JSON.parse(s)); } catch (e) { rej(e); } }).on('error', rej); }).on('error', rej);
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 页面里：建一个 audio 元素，分别测「裸放」和「接 Web Audio 后」的输出电平。
// 电平测试沿用 connect 补丁 —— 注意用 apply 原样转发实参个数（connect 有双重重载）。
const PAGE = `<!doctype html><meta charset="utf-8"><body>
<script>
window.__R = { steps: [] };
function log(k, v) { window.__R.steps.push(k + '=' + JSON.stringify(v)); }

var src = ${JSON.stringify(SRC)};
var a = document.createElement('audio');
a.src = src;
a.loop = true;
a.volume = 1;
document.body.appendChild(a);

a.addEventListener('error', function () {
  log('error', a.error ? (a.error.code + ':' + a.error.message) : 'unknown');
});

a.addEventListener('canplay', function () { log('canplay', a.duration); });
a.addEventListener('loadedmetadata', function () { log('meta', { d: +a.duration.toFixed(2) }); });

// ① 裸放：play() 之后 currentTime 是否前进
var t0 = 0;
a.play().then(function () {
  log('play', 'ok');
  t0 = a.currentTime;
  setTimeout(function () {
    log('advance', +(a.currentTime - t0).toFixed(2));
    step2();
  }, 1200);
}).catch(function (e) { log('playfail', String(e && e.message)); step2(); });

// ② 接 Web Audio：createMediaElementSource 是否被静音
function step2() {
  try {
    var AC = window.AudioContext || window.webkitAudioContext;
    var c = new AC();
    var an = c.createAnalyser();
    an.fftSize = 2048;
    an.connect(c.destination);
    var ms = c.createMediaElementSource(a);
    log('mediaSource', 'created');
    ms.connect(an);
    c.resume();
    var buf = new Float32Array(an.fftSize);
    var peak = 0, n = 0;
    var tm = setInterval(function () {
      an.getFloatTimeDomainData(buf);
      for (var i = 0; i < buf.length; i++) { var v = Math.abs(buf[i]); if (v > peak) peak = v; }
      if (++n > 40) {
        clearInterval(tm);
        log('webaudio_peak', +peak.toFixed(4));
        log('ctx_state', c.state);
        log('ct_after', +a.currentTime.toFixed(2));
        window.__R.done = true;
      }
    }, 25);
  } catch (e) {
    log('mediaSource_fail', String(e && e.message));
    window.__R.done = true;
  }
}
</script>`;

(async () => {
  fs.rmSync(PROFILE, { recursive: true, force: true });
  const htmlPath = path.join(ROOT, 'dev', '_probe_filemedia.html');
  fs.writeFileSync(htmlPath, PAGE, 'utf8');
  if (!fs.existsSync(path.join(ROOT, FILE))) {
    console.log('MISS 找不到音频文件: ' + FILE);
    console.log('提示：先用 dev/_mk_tone.py 生成一个测试音');
  }

  const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-sandbox',
    '--autoplay-policy=no-user-gesture-required',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + PROFILE,
    '--window-size=1200,800', 'about:blank'], { stdio: 'ignore' });

  let page = null;
  for (let i = 0; i < 60; i++) {
    await sleep(400);
    try {
      const l = await getJson('http://127.0.0.1:' + PORT + '/json/list');
      page = (l || []).find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) break;
    } catch (e) {}
  }
  if (!page) { child.kill(); console.log('ERR 无法连接'); process.exit(1); }

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  const send = (m, p) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); });
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
  });
  await new Promise((r) => ws.addEventListener('open', r));
  await send('Page.enable'); await send('Runtime.enable');

  const logs = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.method === 'Runtime.consoleAPICalled') {
      logs.push((m.params.args || []).map((x) => x.value).join(' '));
    }
  });

  await send('Page.navigate', { url: 'file:///' + htmlPath.replace(/\\/g, '/') });
  await sleep(1200);
  await send('Runtime.evaluate', { expression: 'document.querySelector("audio").play().catch(function(){});' });
  await sleep(4500);

  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    return r && r.result ? r.result.value : undefined;
  };
  const steps = await ev('window.__R.steps.join(" | ")');
  console.log('STEPS ' + steps);

  try { fs.rmSync(htmlPath, { force: true }); } catch (e) {}
  try { await send('Browser.close'); } catch (e) {}
  ws.close();
  try { child.kill(); } catch (e) {}
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (e) {}
  process.exit(0);
})();
