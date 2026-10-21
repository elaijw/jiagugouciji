// 验"刻字"是否真的跑起来了（不拍图，只取 DOM 状态与报错）
// 用法：node dev/_carve_probe.js <url> [等待ms]
// 判据：
//   done   = 已经刻过的字形数（应为视口内那部分，且随滚动增长）
//   stuck  = 仍留着内联 dashoffset 的笔画数（收尾后应为 0 或接近 0）
//   hidden = 笔画被藏起来但 3 秒兜底都没放出来的字形（应为 0，否则就是丢内容）
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const URL_ARG = process.argv[2];
const WAIT = parseInt(process.argv[3] || '3200', 10);
const PORT = 9600 + (process.pid % 200);
const PROFILE = path.join(os.tmpdir(), 'zq_carve_' + process.pid);

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
    await sleep(400);
    try {
      const l = await getJson('http://127.0.0.1:' + PORT + '/json/list');
      page = (l || []).find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) break;
    } catch (e) {}
  }
  if (!page) { child.kill(); console.log('ERR 无法连接'); process.exit(1); }

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pending = new Map(); const errors = [];
  const send = (m, p) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); });
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') {
      errors.push((m.params.exceptionDetails || {}).text || 'exception');
    }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      errors.push((m.params.args || []).map((a) => a.value || a.description || '').join(' '));
    }
  });
  await new Promise((r) => ws.addEventListener('open', r));

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  // 关键：不模拟 reduced-motion，让动效真的跑
  await send('Emulation.setEmulatedMedia', { features: [] });

  await send('Page.navigate', { url: URL_ARG });
  await sleep(WAIT);

  const probe = `(function(){
    var g = [].slice.call(document.querySelectorAll('.ac-glyph, .as-glyph'));
    var paths = [].slice.call(document.querySelectorAll('.ac-glyph path, .as-glyph path'));
    var stuck = paths.filter(function(p){ return p.style.strokeDashoffset !== ''; });
    var hidden = g.filter(function(s){
      return !s.__obDone && s.querySelector('path[style*="stroke-dashoffset"]');
    });
    var inView = g.filter(function(s){
      var r = s.getBoundingClientRect();
      return r.top < innerHeight && r.bottom > 0;
    });
    return JSON.stringify({
      total: g.length,
      inView: inView.length,
      done: g.filter(function(s){ return !!s.__obDone; }).length,
      stuck: stuck.length,
      hidden: hidden.length,
      animating: document.getAnimations ? document.getAnimations().length : -1
    });
  })()`;

  const r = await send('Runtime.evaluate', { expression: probe, returnByValue: true });
  console.log('PROBE:' + (r && r.result && r.result.value));

  /* 滚下去一屏，验证"进了视口才刻"确实生效（而不是全靠 3 秒兜底全放） */
  await send('Runtime.evaluate', { expression: 'window.scrollTo(0, 1400);', returnByValue: true });
  await sleep(1100);
  const r2 = await send('Runtime.evaluate', { expression: probe, returnByValue: true });
  console.log('PROBE2:' + (r2 && r2.result && r2.result.value));

  console.log('ERRORS:' + JSON.stringify(errors.slice(0, 5)));

  try { await send('Browser.close'); } catch (e) {}
  ws.close();
  try { child.kill(); } catch (e) {}
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (e) {}
  process.exit(0);
})();
