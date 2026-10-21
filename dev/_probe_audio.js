// 已废弃：声音层改成真实音频文件后，_state() 的字段变了。
// 现在用 dev/_probe_sound.js（同一个意思，判据更硬：看 bgm.currentTime 有没有前进）。
// 声音层核验：真点一下关卡卡（走 CDP 的 Input 通道，算"用户手势"），
// 然后看 AudioContext 是否真的 running、骨板声有没有发出去、音乐有没有起来。
// 用法：node dev/_probe_audio.js [url] [宽]
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const URL_ARG = process.argv[2] ||
  'file:///C:/Users/32058/WorkBuddy/2026-10-15-12-50-44/repo_extract/jiagugouciji-main/index.html#/modes';
const W = parseInt(process.argv[3] || '1366', 10);
const SEL = process.argv[4] || '.lv';
const PORT = 9500 + (process.pid % 200);
const PROFILE = path.join(os.tmpdir(), 'zq_audio_' + process.pid);

const getJson = (u) => new Promise((res, rej) => {
  http.get(u, (r) => { let s = ''; r.on('data', (c) => s += c); r.on('end', () => { try { res(JSON.parse(s)); } catch (e) { rej(e); } }).on('error', rej); }).on('error', rej);
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.rmSync(PROFILE, { recursive: true, force: true });
  const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-sandbox',
    '--hide-scrollbars', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + PROFILE, '--window-size=' + W + ',900',
    '--autoplay-policy=user-gesture-required', 'about:blank'], { stdio: 'ignore' });

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
  let id = 0; const pending = new Map(); const logs = [];
  const send = (m, p) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); });
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') {
      logs.push('EXC ' + (m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description || m.params.exceptionDetails.text));
    }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      logs.push('ERR ' + m.params.args.map(a => a.value || a.description || '').join(' '));
    }
  });
  await new Promise((r) => ws.addEventListener('open', r));

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: URL_ARG });
  await sleep(2200);

  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    return r && r.result ? r.result.value : undefined;
  };

  console.log('BEFORE ' + JSON.stringify(await ev('App.sound && App.sound._state()')));

  // 真点第一张关卡卡
  const box = await ev("(function(){var e=document.querySelector(" + JSON.stringify(SEL) + ");if(!e)return null;e.scrollIntoView({block:'center'});var b=e.getBoundingClientRect();return {x:Math.round(b.left+b.width/2),y:Math.round(b.top+b.height/2)};})()");
  if (!box) { console.log('ERR 找不到 ' + SEL); }
  else {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1, buttons: 1 });
    await sleep(40);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1, buttons: 0 });
    await sleep(400);
  }

  console.log('AFTER1 ' + JSON.stringify(await ev('App.sound._state()')));
  await sleep(3200);   // 等第一个音（music 起手 2600ms 后）
  console.log('AFTER2 ' + JSON.stringify(await ev('App.sound._state()')));

  // 顶栏开关：关掉
  const btn = await ev("(function(){var e=document.querySelector('.top-snd');if(!e)return null;var b=e.getBoundingClientRect();return {x:Math.round(b.left+b.width/2),y:Math.round(b.top+b.height/2),off:e.classList.contains('is-off'),name:e.getAttribute('aria-label')};})()");
  console.log('BTN ' + JSON.stringify(btn));
  if (btn) {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: btn.x, y: btn.y, button: 'left', clickCount: 1, buttons: 1 });
    await sleep(30);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: btn.x, y: btn.y, button: 'left', clickCount: 1, buttons: 0 });
    await sleep(700);
    console.log('OFF ' + JSON.stringify(await ev('App.sound._state()')));
    console.log('BTN2 ' + JSON.stringify(await ev("(function(){var e=document.querySelector('.top-snd');return {off:e.classList.contains('is-off'),name:e.getAttribute('aria-label')};})()")));
    console.log('STORED ' + JSON.stringify(await ev("localStorage.getItem('ziqu.sound')")));
  }

  console.log('LOGS ' + JSON.stringify(logs.slice(0, 8)));

  try { await send('Browser.close'); } catch (e) {}
  ws.close();
  try { child.kill(); } catch (e) {}
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (e) {}
  process.exit(0);
})();
