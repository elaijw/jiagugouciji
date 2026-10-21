// 参赛评审用的线上体检：一次浏览器、逐路由冷启动，量首屏字节、FCP/LCP/CLS、
// 资源构成、DOM 规模与无障碍缺口。只读，不改站点。
// 用法：node dev/_audit_comp.js [baseUrl] [--mobile]
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const RAW = process.argv[2] || 'https://elaijw38.github.io/jiagugouciji/';
// file:// 指向 index.html 时不能补斜杠；线上目录则补成目录形式
const BASE = /\.html$/i.test(RAW) ? RAW : RAW.replace(/\/?$/, '/');
const MOBILE = process.argv.includes('--mobile');
const PORT = 9500 + (process.pid % 300);
const PROFILE = path.join(os.tmpdir(), 'zq_audit_' + process.pid);

const ROUTES = [
  ['home', ''],
  ['modes', '#/modes'],
  ['atlas', '#/atlas'],
  ['howto', '#/howto'],
  ['settings', '#/settings'],
  ['bone-build', '#/play/bone-build'],
  ['wangyi-map', '#/play/wangyi-map'],
  ['boss-raid', '#/play/boss-raid'],
];

const DEV = MOBILE
  ? { width: 390, height: 844, deviceScaleFactor: 3, mobile: true }
  : { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false };

const INJECT = `
window.__vitals = { lcp: 0, cls: 0, lcpEl: '' };
try {
  new PerformanceObserver(function (l) {
    for (var e of l.getEntries()) {
      if (e.startTime > window.__vitals.lcp) {
        window.__vitals.lcp = e.startTime;
        var el = e.element;
        window.__vitals.lcpEl = el ? (el.tagName + (el.className ? '.' + String(el.className).split(' ')[0] : '')) : '';
      }
    }
  }).observe({ type: 'largest-contentful-paint', buffered: true });
} catch (e) {}
try {
  new PerformanceObserver(function (l) {
    for (var e of l.getEntries()) if (!e.hadRecentInput) window.__vitals.cls += e.value;
  }).observe({ type: 'layout-shift', buffered: true });
} catch (e) {}
`;

const PROBE = `(function () {
  var res = performance.getEntriesByType('resource');
  var by = {};
  var total = 0, enc = 0;
  res.forEach(function (e) {
    var t = e.initiatorType || 'other';
    var n = e.name.split('?')[0].split('/').pop();
    var ext = (n.match(/\\.(png|jpe?g|svg|webp|css|js|json|woff2?)$/i) || [0, 'other'])[1].toLowerCase();
    by[ext] = by[ext] || { n: 0, kb: 0 };
    by[ext].n++;
    by[ext].kb += (e.transferSize || 0) / 1024;
    total += (e.transferSize || 0);
    enc += (e.encodedBodySize || 0);
  });
  var nav = performance.getEntriesByType('navigation')[0] || {};
  var fcp = 0;
  performance.getEntriesByType('paint').forEach(function (p) {
    if (p.name === 'first-contentful-paint') fcp = p.startTime;
  });
  var imgs = [].slice.call(document.images);
  var noAlt = imgs.filter(function (i) { return !i.hasAttribute('alt'); }).length;
  var emptyAlt = imgs.filter(function (i) { return i.getAttribute('alt') === ''; }).length;
  var btns = [].slice.call(document.querySelectorAll('button, [role=button], a'));
  var nameless = btns.filter(function (b) {
    return !((b.textContent || '').trim() || b.getAttribute('aria-label') || b.getAttribute('title'));
  }).length;
  var small = 0, minFont = 99;
  [].slice.call(document.querySelectorAll('p,span,li,em,b,div')).forEach(function (el) {
    if (!el.textContent || !el.textContent.trim()) return;
    if (el.querySelector('p,span,div,li')) return;
    var cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    var r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    var fs = parseFloat(cs.fontSize) || 0;
    if (fs && fs < minFont) minFont = fs;
    if (fs && fs < 12) small++;
  });
  var h = document.querySelector('h1');
  return {
    url: location.href,
    title: document.title,
    dom: document.querySelectorAll('*').length,
    textLen: (document.body.innerText || '').length,
    h1: h ? (h.textContent || '').trim().slice(0, 40) : '',
    h2n: document.querySelectorAll('h2').length,
    imgs: imgs.length, imgNoAlt: noAlt, imgEmptyAlt: emptyAlt,
    btns: btns.length, namelessBtns: nameless,
    minFont: Math.round(minFont * 10) / 10, smallText: small,
    scrollable: document.documentElement.scrollHeight > innerHeight + 4,
    overflowX: document.documentElement.scrollWidth > innerWidth + 2,
    docH: document.documentElement.scrollHeight,
    vitals: window.__vitals || {},
    nav: {
      ttfb: Math.round(nav.responseStart || 0),
      dcl: Math.round(nav.domContentLoadedEventEnd || 0),
      load: Math.round(nav.loadEventEnd || 0),
    },
    fcp: Math.round(fcp),
    resCount: res.length,
    resKB: Math.round(total / 1024),
    encKB: Math.round(enc / 1024),
    byKB: Object.keys(by).map(function (k) {
      return { ext: k, n: by[k].n, kb: Math.round(by[k].kb) };
    }).sort(function (a, b) { return b.kb - a.kb; }),
    heaviest: res.map(function (e) {
      return { n: e.name.split('/').pop().split('?')[0], kb: Math.round((e.transferSize || 0) / 1024) };
    }).sort(function (a, b) { return b.kb - a.kb; }).slice(0, 6),
  };
})()`;

const getJson = (url) => new Promise((resolve, reject) => {
  http.get(url, (res) => {
    let s = '';
    res.on('data', (c) => { s += c; });
    res.on('end', () => { try { resolve(JSON.parse(s)); } catch (e) { reject(e); } });
  }).on('error', reject);
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.rmSync(PROFILE, { recursive: true, force: true });
  const child = spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--no-sandbox',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + PROFILE,
    '--window-size=1366,900', 'about:blank',
  ], { stdio: 'ignore' });

  let page = null;
  for (let i = 0; i < 60; i++) {
    await sleep(400);
    try {
      const list = await getJson('http://127.0.0.1:' + PORT + '/json/list');
      page = (list || []).find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) break;
    } catch (e) { /* 等浏览器起来 */ }
  }
  if (!page) { child.kill(); console.log('ERR: 无法连接浏览器'); process.exit(1); }

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const send = (m, p) => new Promise((r) => {
    const i = ++id;
    pending.set(i, r);
    ws.send(JSON.stringify({ id: i, method: m, params: p || {} }));
  });
  const cerrs = {};
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails || {};
      (cerrs.__global = cerrs.__global || []).push((d.exception && d.exception.description) || d.text || '?');
    }
  });
  await new Promise((r) => ws.addEventListener('open', r));
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', DEV);
  await send('Page.addScriptToEvaluateOnNewDocument', { source: INJECT });

  const out = [];
  for (const [name, hash] of ROUTES) {
    cerrs.__global = [];
    // 哈希路由不会重新载入文档：先进 about:blank 把 performance 时间线清干净
    await send('Page.navigate', { url: 'about:blank' });
    await sleep(350);
    await send('Network.clearBrowserCache');
    await send('Network.setCacheDisabled', { cacheDisabled: true });
    await send('Page.navigate', { url: BASE + hash });
    let ready = false;
    for (let i = 0; i < 50; i++) {
      await sleep(300);
      const r = await send('Runtime.evaluate', { expression: 'document.readyState', returnByValue: true });
      if (r && r.result && r.result.value === 'complete') { ready = true; break; }
    }
    await sleep(1500);
    const r = await send('Runtime.evaluate', { expression: PROBE, returnByValue: true });
    const v = (r && r.result && r.result.value) || {};
    v.route = name;
    v.ready = ready;
    v.errs = (cerrs.__global || []).slice(0, 3);
    out.push(v);
  }

  console.log('AUDIT:' + JSON.stringify({
    base: BASE, viewport: DEV, mobile: MOBILE, rows: out,
  }));
  try { await send('Browser.close'); } catch (e) {}
  ws.close();
  // 只收自己起的这棵树（按 PID，不按进程名）
  try { child.kill(); } catch (e) {}
  fs.rmSync(PROFILE, { recursive: true, force: true });
  process.exit(0);
})();
