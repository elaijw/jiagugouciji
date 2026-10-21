// 量某个文本节点在不同视口宽度下的行数与字号（找出「孤字换行」）
// 用法: node dev/_line_probe.js <url> <selector> <w1,w2,...>
// 自己起自己收，只关自己的浏览器
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const URL_ARG = process.argv[2];
const SEL = process.argv[3];
const WIDTHS = (process.argv[4] || '1440').split(',').map(Number);
const PORT = 9600 + (process.pid % 150);
const PROFILE = path.join(os.tmpdir(), 'zq_line_' + process.pid);

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
  await send('Page.navigate', { url: URL_ARG });
  await sleep(2600);

  const evalv = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    return r && r.result ? r.result.value : null;
  };

  const expr = `(function(){
    var el = document.querySelector(${JSON.stringify(SEL)});
    if (!el) return null;
    var cs = getComputedStyle(el);
    var rg = document.createRange();
    rg.selectNodeContents(el);
    var rects = Array.prototype.slice.call(rg.getClientRects());
    var lines = [];
    rects.forEach(function(r){
      if (!lines.length) { lines.push({top: r.top, bottom: r.bottom}); return; }
      var last = lines[lines.length-1];
      if (Math.abs(r.top - last.top) < 4) { last.bottom = Math.max(last.bottom, r.bottom); }
      else lines.push({top: r.top, bottom: r.bottom});
    });
    var txt = (el.textContent || '').replace(/\\s+/g,'');
    return { text: txt, chars: txt.length, fontSize: cs.fontSize,
             w: Math.round(el.getBoundingClientRect().width),
             lines: lines.length,
             lineText: lines.map(function(){ return ''; }).length };
  })()`;

  const out = [];
  for (const w of WIDTHS) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: w < 700 });
    await sleep(700);
    const r = await evalv(expr);
    out.push({ w: w, r: r });
  }
  // 逐行切字：用每行的 rect 反推这一行放了几个字
  for (const o of out) {
    console.log(JSON.stringify(o));
  }
  try { await send('Browser.close'); } catch (e) {}
  ws.close();
  try { child.kill(); } catch (e) {}
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (e) {}
  process.exit(0);
})();
