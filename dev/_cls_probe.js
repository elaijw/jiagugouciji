// 追 CLS 的来源：导航前注入 PerformanceObserver，记录每次 layout-shift 的
// 影响分值 + 具体是哪个元素动了（node 名 / class / 位移量）。
// 用法：node dev/_cls_probe.js <url> [等待ms] [路由hash]
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const URL_ARG = process.argv[2];
const WAIT = parseInt(process.argv[3] || '3500', 10);
const PORT = 9800 + (process.pid % 150);
const PROFILE = path.join(os.tmpdir(), 'zq_cls_' + process.pid);

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
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });

  // 注入早于任何页面脚本
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      window.__shifts = [];
      try {
        new PerformanceObserver(function(list){
          list.getEntries().forEach(function(e){
            if (!e.hadRecentInput) {
              window.__shifts.push({
                v: +e.value.toFixed(4),
                t: Math.round(e.startTime),
                src: (e.sources||[]).map(function(s){
                  var n = s.node;
                  return n ? (n.tagName || '?') + '.' + ((n.className && n.className.toString().slice(0,40)) || '') : 'null';
                }),
                box: (e.sources||[]).map(function(s){
                  var p = s.previousRect, c = s.currentRect;
                  return p && c ? [Math.round(p.y), '->', Math.round(c.y), 'h' + Math.round(p.height) + '/' + Math.round(c.height)].join('') : '';
                })
              });
            }
          });
        }).observe({ type: 'layout-shift', buffered: true });
      } catch (err) { window.__shifts = [{err: String(err)}]; }
    `
  });

  await send('Page.navigate', { url: URL_ARG });
  await sleep(WAIT);

  const r = await send('Runtime.evaluate', {
    expression: `JSON.stringify({
      cls: (window.__shifts||[]).reduce(function(a,b){return a+(b.v||0)},0),
      n: (window.__shifts||[]).length,
      top: (window.__shifts||[]).sort(function(a,b){return (b.v||0)-(a.v||0)}).slice(0,8)
    })`, returnByValue: true
  });
  console.log('CLS:' + (r && r.result && r.result.value));

  try { await send('Browser.close'); } catch (e) {}
  ws.close();
  try { child.kill(); } catch (e) {}
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (e) {}
  process.exit(0);
})();
