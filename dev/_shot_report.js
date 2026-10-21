// 给报告页拍整页图，自己起自己收，只杀自己的 PID 树
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const URL_ARG = process.argv[2];
const OUT = process.argv[3];
const W = parseInt(process.argv[4] || '1000', 10);
const PORT = 9700 + (process.pid % 200);
const PROFILE = path.join(os.tmpdir(), 'zq_shot_' + process.pid);

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
  // 先开空白页再导航：启动参数直接带 #hash 时路由偶发落到首页
  await send('Page.navigate', { url: URL_ARG });
  const waitMs = parseInt(process.argv[7] || '2200', 10);
  await sleep(waitMs);
  // 可选：拍之前执行一段 JS（验"要触发才出现"的状态；本脚本不模拟 reduce，
  // 所以是唯一能拍到动效中间帧的入口）
  const EXEC = process.argv[8];
  if (EXEC) {
    await send('Runtime.evaluate', { expression: EXEC, returnByValue: true });
    await sleep(parseInt(process.argv[9] || '900', 10));
  }
  const m = await send('Page.getLayoutMetrics');
  const fullH = Math.ceil((m.cssContentSize || {}).height || 1400);
  const y = parseInt(process.argv[5] || '0', 10);
  const hWant = parseInt(process.argv[6] || '0', 10);
  const h = hWant > 0 ? Math.min(hWant, fullH - y) : Math.min(fullH, 12000);
  const shot = await send('Page.captureScreenshot', {
    format: 'png', captureBeyondViewport: true,
    clip: { x: 0, y: y, width: W, height: h, scale: 1 },
  });
  fs.writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
  console.log('OK ' + OUT + ' y=' + y + ' h=' + h + ' full=' + fullH);
  try { await send('Browser.close'); } catch (e) {}
  ws.close();
  try { child.kill(); } catch (e) {}
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (e) { /* 临时目录被占用就留给系统清 */ }
  process.exit(0);
})();
