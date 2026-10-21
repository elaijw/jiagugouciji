// 动效核验：**不**模拟 prefers-reduced-motion，连拍两张，中间隔一段时间。
// 用法：node dev/_shot_motion.js <url> <out前缀> [宽] [进入后等待ms] [两张间隔ms] [先点哪]
// 产出 <out前缀>_a.png / <out前缀>_b.png，再用 python 比像素差（见 _diff_motion.py）。
// 与 _shot_flat.js 的区别只有两点：①不注入 reduced-motion ②拍两张。
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const URL_ARG = process.argv[2];
const PREFIX = process.argv[3];
const W = parseInt(process.argv[4] || '1440', 10);
const SETTLE = parseInt(process.argv[5] || '2600', 10);
const GAP = parseInt(process.argv[6] || '900', 10);
const CLICK = process.argv[7] || '';
const H = parseInt(process.argv[8] || '1000', 10);   // 真实窗口高
const PORT = 9600 + (process.pid % 200);
const PROFILE = path.join(os.tmpdir(), 'zq_mot_' + process.pid);

const getJson = (u) => new Promise((res, rej) => {
  http.get(u, (r) => { let s = ''; r.on('data', (c) => s += c); r.on('end', () => { try { res(JSON.parse(s)); } catch (e) { rej(e); } }); }).on('error', rej);
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.rmSync(PROFILE, { recursive: true, force: true });
  const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-sandbox',
    '--hide-scrollbars', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + PROFILE, '--window-size=' + W + ',1100', 'about:blank'], { stdio: 'ignore' });

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

  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: URL_ARG });
  await sleep(SETTLE);

  if (CLICK) {
    // 选择器，或 js: 开头的表达式（用来点"第 n 个区域"这类靠选择器写不出的东西）
    const expr = CLICK.indexOf('js:') === 0 ? CLICK.slice(3)
      : `(function(){var e=document.querySelector(${JSON.stringify(CLICK)});if(!e)return 'miss';e.click();return 'ok';})()`;
    await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    await sleep(1200);
  }

  // 动效层的结构自检：数节点、看动画名、看是否挡住了点击
  const info = await send('Runtime.evaluate', {
    expression: `(function(){
      var m=document.querySelector('.wy2-motion');
      if(!m) return 'NO-MOTION';
      var cs=getComputedStyle(m);
      var drops=m.querySelectorAll('.m-drop').length;
      var glow=m.querySelector('.m-glow');
      return JSON.stringify({
        nodes:m.childNodes.length,
        drop:drops, ember:m.querySelectorAll('.m-ember').length,
        shim:m.querySelectorAll('.m-shimmer').length,
        rip:m.querySelectorAll('.m-ripple').length,
        mote:m.querySelectorAll('.m-mote').length,
        pe:cs.pointerEvents, w:m.getBoundingClientRect().width|0,
        glowAnim: glow? getComputedStyle(glow).animationName+' '+getComputedStyle(glow).animationDuration : '-'
      });
    })()`,
    returnByValue: true
  });
  console.log('INFO ' + (info && info.result && info.result.value));

  async function shot(file) {
    const m = await send('Page.getLayoutMetrics');
    const vh = Math.min(H, Math.ceil((m.cssContentSize || {}).height || 900));
    const s = await send('Page.captureScreenshot', {
      format: 'png', captureBeyondViewport: true,
      clip: { x: 0, y: 0, width: W, height: vh, scale: 1 }
    });
    fs.writeFileSync(file, Buffer.from(s.data, 'base64'));
    return vh;
  }
  const h = await shot(PREFIX + '_a.png');
  await sleep(GAP);
  await shot(PREFIX + '_b.png');
  console.log('OK ' + PREFIX + '_a.png / _b.png h=' + h);

  try { await send('Browser.close'); } catch (e) {}
  ws.close();
  try { child.kill(); } catch (e) {}
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (e) {}
  process.exit(0);
})();
