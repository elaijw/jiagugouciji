// 找出"是有面的容器，但圆角为 0"的元素。
// 判定：自身有不透明背景 / 有边框 / 有背景图 + 尺寸不小于 40x32。
// 用法：node dev/_radius_audit.js <url> "#/,#/atlas" [等待ms]
// 收尾一律走 CDP 的 Browser.close，避免留下自己起的浏览器进程。
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const URL_ARG = process.argv[2];
const ROUTES = (process.argv[3] || '#/').split(',');
const WAIT = parseInt(process.argv[4] || '2600', 10);
const PORT = 9400 + (process.pid % 120);
const PROFILE = path.join(os.tmpdir(), 'zq_rad_' + process.pid);

const PROBE = `(function(){
  var seen = {};
  var all = document.querySelectorAll('body *');
  for (var i = 0; i < all.length; i++) {
    var e = all[i];
    if (e.closest('svg')) continue;
    var r = e.getBoundingClientRect();
    if (r.width < 40 || r.height < 32) continue;
    var s = getComputedStyle(e);
    if (s.display === 'inline' || s.visibility === 'hidden' || s.opacity === '0') continue;
    var m = s.backgroundColor.match(/rgba?\\(([^)]+)\\)/);
    var alpha = 1;
    if (m) { var p = m[1].split(','); if (p.length > 3) alpha = parseFloat(p[3]); }
    var hasBg = (m && alpha > 0.08) || s.backgroundImage !== 'none';
    var hasBorder = parseFloat(s.borderTopWidth) > 0 && s.borderTopStyle !== 'none';
    if (!hasBg && !hasBorder) continue;
    if (s.borderTopLeftRadius && s.borderTopLeftRadius !== '0px') continue;
    var key = e.tagName.toLowerCase() + (e.className && e.className.toString
      ? '.' + e.className.toString().trim().split(/\\s+/).join('.') : '');
    if (!seen[key]) seen[key] = 0;
    seen[key]++;
  }
  return JSON.stringify(seen);
})()`;

const getJson = (u) => new Promise((res, rej) => {
  http.get(u, (r) => { let s = ''; r.on('data', (c) => s += c); r.on('end', () => { try { res(JSON.parse(s)); } catch (e) { rej(e); } }); }).on('error', rej);
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.rmSync(PROFILE, { recursive: true, force: true });
  const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-sandbox',
    '--hide-scrollbars', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + PROFILE, '--window-size=1366,768', 'about:blank'], { stdio: 'ignore' });

  let page = null;
  for (let i = 0; i < 60; i++) {
    await sleep(400);
    try {
      const l = await getJson('http://127.0.0.1:' + PORT + '/json/list');
      page = (l || []).find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) break;
    } catch (e) {}
  }
  if (!page) { try { child.kill(); } catch (e) {} console.log('ERR 无法连接'); process.exit(1); }

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  const send = (m, p) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); });
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
  });
  await new Promise((r) => ws.addEventListener('open', r));

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });

  const acc = {};
  for (const rt of ROUTES) {
    await send('Page.navigate', { url: URL_ARG + rt });
    await sleep(WAIT);
    const r = await send('Runtime.evaluate', { expression: PROBE, returnByValue: true });
    let j = {};
    try { j = JSON.parse(r.result.value); } catch (e) {}
    Object.keys(j).forEach((k) => {
      if (!acc[k]) acc[k] = { n: 0, routes: [] };
      acc[k].n += j[k];
      if (acc[k].routes.indexOf(rt) < 0) acc[k].routes.push(rt);
    });
  }

  Object.keys(acc).sort((a, b) => acc[b].n - acc[a].n).forEach((k) => {
    console.log(String(acc[k].n).padStart(4) + '  ' + k + '   @' + acc[k].routes.join(','));
  });

  try { await send('Browser.close'); } catch (e) {}
  ws.close();
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (e) {}
  process.exit(0);
})();
