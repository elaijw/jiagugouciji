// 量「多久才看得见内容」：从导航开始，轮询某个选择器何时出现
// 自己起自己收，只关自己的浏览器
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const URL_ARG = process.argv[2];
const SEL = process.argv[3] || '.bo-tier';
const MIN_N = parseInt(process.argv[4] || '1', 10);
const PORT = 9800 + (process.pid % 150);
const PROFILE = path.join(os.tmpdir(), 'zq_ready_' + process.pid);

const getJson = (u) => new Promise((res, rej) => {
  http.get(u, (r) => { let s = ''; r.on('data', (c) => s += c); r.on('end', () => { try { res(JSON.parse(s)); } catch (e) { rej(e); } }); }).on('error', rej);
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.rmSync(PROFILE, { recursive: true, force: true });
  const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-sandbox',
    '--hide-scrollbars', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + PROFILE, '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });

  let page = null;
  for (let i = 0; i < 60; i++) {
    await sleep(300);
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
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  const t0 = Date.now();
  await send('Page.navigate', { url: URL_ARG });

  const evalv = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    return r && r.result ? r.result.value : null;
  };

  let hit = -1;
  for (let i = 0; i < 240; i++) {
    await sleep(250);
    const n = await evalv('document.querySelectorAll(' + JSON.stringify(SEL) + ').length');
    if (n !== null && n >= MIN_N) { hit = Date.now() - t0; break; }
  }
  const paint = await evalv('(function(){var p=performance.getEntriesByType("paint");var o={};p.forEach(function(e){o[e.name]=Math.round(e.startTime)});return o})()');
  const nodes = await evalv('document.querySelectorAll("*").length');
  console.log(JSON.stringify({ url: URL_ARG, sel: SEL, firstSeenMs: hit, paint, nodes }));
  try { await send('Browser.close'); } catch (e) {}
  ws.close();
  try { child.kill(); } catch (e) {}
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (e) {}
  process.exit(0);
})();
