// 声音层核验（真实音频版）：一次真点击，看三件事
//   ① 背景音乐真的在走（bgm.currentTime 前进，volume 爬到目标值）
//   ② 骨板声真的播了（池子里某个 <audio> 的 currentTime > 0、volume > 0）
//   ③ 没有回退到合成层、没有加载错误
//
// 为什么不能量电平：<audio> 直接出声音箱，不经过 Web Audio，
// 拿不到 AnalyserNode（file:// 下 createMediaElementSource 会被静音）。
// 所以判据只能用"播放进度 + 音量 + 无 error"这三项，
// 外加素材自身的电平（分析过文件，见 dev/_analyze_audio.js）来推算实际响度。
//
// 用法：node dev/_probe_sound.js [url] [点击选择器]
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = 'C:/Users/32058/WorkBuddy/2026-10-15-12-50-44/repo_extract/jiagugouciji-main';
const URL_ARG = process.argv[2] || 'file:///' + ROOT + '/index.html#/modes';
const SEL = process.argv[3] || '.lv';
const PORT = 9680 + (process.pid % 100);
const PROFILE = path.join(os.tmpdir(), 'zq_snd_' + process.pid);

const getJson = (u) => new Promise((res, rej) => {
  http.get(u, (r) => { let s = ''; r.on('data', (c) => s += c); r.on('end', () => { try { res(JSON.parse(s)); } catch (e) { rej(e); } }).on('error', rej); }).on('error', rej);
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
  let id = 0; const pending = new Map();
  const send = (m, p) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); });
  const events = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
    if (m.method === 'Log.entryAdded') { events.push(m.params.entry.level + ':' + m.params.entry.text); }
    if (m.method === 'Runtime.exceptionThrown') {
      events.push('EXC:' + (m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description || m.params.exceptionDetails.text));
    }
  });
  await new Promise((r) => ws.addEventListener('open', r));

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: URL_ARG });
  await sleep(2400);

  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    return r && r.result ? r.result.value : (r && r.exceptionDetails ? 'EXC' : undefined);
  };

  console.log('IDLE  ' + JSON.stringify(await ev('App.sound._state()')));
  /* 手势之前不该有任何音频元素在播 */
  console.log('PRE   ' + JSON.stringify(await ev('document.querySelectorAll("audio").length')));

  const box = await ev("(function(){var e=document.querySelector(" + JSON.stringify(SEL) + ");if(!e)return null;e.scrollIntoView({block:'center'});var b=e.getBoundingClientRect();return {x:Math.round(b.left+b.width/2),y:Math.round(b.top+b.height/2)};})()");

  if (box) {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1, buttons: 1 });
    await sleep(30);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1, buttons: 0 });
  }
  await sleep(500);
  console.log('CLICK ' + JSON.stringify(await ev('App.sound._state()')));

  /* 等淡入走完（2.4s），再确认 currentTime 还在走 */
  await sleep(3200);
  const s1 = await ev('App.sound._state()');
  console.log('AFTER ' + JSON.stringify(s1));
  await sleep(1500);
  const s2 = await ev('App.sound._state()');
  console.log('LATER ' + JSON.stringify(s2));

  const adv = (s2 && s1) ? +(s2.t - s1.t).toFixed(2) : null;
  console.log('TΔ    ' + adv + 's  （1.5 秒里背景音乐前进的秒数，接近 1.5 才算真在播）');

  /* 顶栏开关 */
  const btn = await ev("(function(){var b=document.querySelector('.top-snd');if(!b)return null;var r=b.getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};})()");
  if (btn) {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: btn.x, y: btn.y, button: 'left', clickCount: 1, buttons: 1 });
    await sleep(30);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: btn.x, y: btn.y, button: 'left', clickCount: 1, buttons: 0 });
    await sleep(1200);
    console.log('OFF   ' + JSON.stringify(await ev('App.sound._state()')));
    console.log('STORED ' + JSON.stringify(await ev('App.store.get("sound", null)')));
  }

  console.log('EVENTS ' + JSON.stringify(events.slice(0, 6)));

  try { await send('Browser.close'); } catch (e) {}
  ws.close();
  try { child.kill(); } catch (e) {}
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (e) {}
  process.exit(0);
})();
