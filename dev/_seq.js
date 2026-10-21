// 按真实速度连拍：用于判断"动画节奏"好坏，而不是只看时长数字。
// 与 _shot_flat.js 的区别：**不**模拟 prefers-reduced-motion（那会把动画直接置为终态），
// 所以拍到的就是访客真正看到的过程。
//
// 用法：node dev/_seq.js <url> <outPrefix> <宽> <t1,t2,t3...>（秒，逗号分隔）
// 例：node dev/_seq.js "file:///.../index.html" _check/seq 1440 0.4,1.2,2.2,3.4
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const URL_ARG = process.argv[2];
const PREFIX = process.argv[3];
const W = parseInt(process.argv[4] || '1440', 10);
const TIMES = String(process.argv[5] || '0.5,1.5,2.5').split(',').map(Number).sort((a, b) => a - b);
const PORT = 9600 + (process.pid % 150);
const PROFILE = path.join(os.tmpdir(), 'zq_seq_' + process.pid);

const getJson = (u) => new Promise((res, rej) => {
  http.get(u, (r) => { let s = ''; r.on('data', (c) => s += c); r.on('end', () => { try { res(JSON.parse(s)); } catch (e) { rej(e); } }); }).on('error', rej);
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.rmSync(PROFILE, { recursive: true, force: true });
  const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-sandbox',
    '--hide-scrollbars', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + PROFILE, '--window-size=' + W + ',1400', 'about:blank'], { stdio: 'ignore' });

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
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: 1400, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: URL_ARG });

  const t0 = Date.now();
  for (const t of TIMES) {
    const wait = t * 1000 - (Date.now() - t0);
    if (wait > 0) await sleep(wait);
    const shot = await send('Page.captureScreenshot', {
      format: 'png',
      clip: { x: 0, y: 0, width: W, height: Math.min(1400, parseInt(process.argv[6] || '820', 10)), scale: 1 },
    });
    const out = PREFIX + '_' + String(t).replace('.', 'p') + 's.png';
    fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
    console.log('OK ' + out + ' @' + ((Date.now() - t0) / 1000).toFixed(2) + 's');
  }

  try { await send('Browser.close'); } catch (e) {}
  ws.close();
  try { child.kill(); } catch (e) {}
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (e) {}
  process.exit(0);
})();
