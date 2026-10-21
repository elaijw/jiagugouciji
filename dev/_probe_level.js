// 声音层"音量核验"：听不到，就只能量。
//
// 思路：
//   加载前把 AudioNode.prototype.connect 打一个补丁 —— 任何接向 destination
//   的连接都先绕过一个 AnalyserNode，于是能采到用户真正听到的那一路信号
//   （在限幅器之后，所以量到的就是耳朵听到的）。
//
//   采样不能靠 CDP 往返（40ms 一次会漏掉 75ms 的瞬态），也不能"先起 promise
//   再点"（那时 ctx 还没建，analyser 不存在）—— 所以改成**页内常驻录制器**：
//   一上电就开始等 __ZQ_ANA，出现后每 16ms 累积一次峰值/RMS，探针只负责
//   在点击前 reset、之后读取。时序上没有任何缝隙。
//
// 用法：node dev/_probe_level.js [url] [选择器]
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const URL_ARG = process.argv[2] ||
  'file:///C:/Users/32058/WorkBuddy/2026-10-15-12-50-44/repo_extract/jiagugouciji-main/index.html#/modes';
const SEL = process.argv[3] || '.lv';
const PORT = 9600 + (process.pid % 200);
const PROFILE = path.join(os.tmpdir(), 'zq_lvl_' + process.pid);

const getJson = (u) => new Promise((res, rej) => {
  http.get(u, (r) => { let s = ''; r.on('data', (c) => s += c); r.on('end', () => { try { res(JSON.parse(s)); } catch (e) { rej(e); } }).on('error', rej); }).on('error', rej);
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PATCH = `
(function () {
  var AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  var proto = (window.AudioNode || Object.getPrototypeOf(AC.prototype)).prototype;
  var orig = proto.connect;
  /* 注意：必须用 apply 原样转发实参个数。
     connect 有两个 WebIDL 重载 —— connect(AudioNode, out, in) 与
     connect(AudioParam, out)。把实参补齐成 3 个再转发，会让"接 AudioParam"
     那种调用匹配不到重载，抛 TypeError —— 而 drone() 里恰好有
     lg.connect(g.gain)。用 arguments 整体转发就没这个问题。 */
  proto.connect = function (target) {
    try {
      var c = this.context;
      var args = Array.prototype.slice.call(arguments);
      if (target && c && target === c.destination && !target.__isAna) {
        if (!c.__ana) {
          var an = c.createAnalyser();
          an.fftSize = 2048;
          an.__isAna = true;
          orig.call(an, c.destination);
          c.__ana = an;
          window.__ZQ_ANA = an;
        }
        args[0] = c.__ana;
      }
      return orig.apply(this, args);
    } catch (e) {
      (window.__ZQ_ERR = window.__ZQ_ERR || []).push('connect:' + (e && e.message));
      throw e;
    }
  };

  /* 常驻录制器：峰值、RMS 累加、采样点数、以及"峰值出现的时刻" */
  var R = window.__ZQ_REC = { peak: 0, rmsSum: 0, n: 0, live: false, t0: 0, at: -1 };
  var buf = null, seen = 0;
  function tick() {
    var an = window.__ZQ_ANA;
    if (an) {
      if (!R.live) { R.live = true; R.t0 = performance.now(); }
      if (!buf || buf.length !== an.fftSize) { buf = new Float32Array(an.fftSize); }
      an.getFloatTimeDomainData(buf);
      var sum = 0;
      for (var i = 0; i < buf.length; i++) {
        var v = buf[i], a = v < 0 ? -v : v;
        if (a > R.peak) { R.peak = a; R.at = Math.round(performance.now() - R.t0); }
        sum += v * v;
      }
      R.rmsSum += sum; R.n += buf.length;
    }
    setTimeout(tick, 16);
  }
  setTimeout(tick, 0);

  /* 频谱：用来证明"低音层真的有音高"，不是糊成一片低频轰鸣。
     采 ms 毫秒，对 dB 值取平均，找局部峰，按响度排前几个。 */
  window.__ZQ_SPEC = function (ms) {
    return new Promise(function (res) {
      var an = window.__ZQ_ANA;
      if (!an) { res({ err: 'no ana' }); return; }
      var fb = new Float32Array(an.frequencyBinCount);
      var acc = new Float32Array(an.frequencyBinCount);
      var n = 0, end = performance.now() + ms;
      (function t2() {
        an.getFloatFrequencyData(fb);
        for (var i = 0; i < fb.length; i++) { if (fb[i] > -140) { acc[i] += fb[i]; } }
        n++;
        if (performance.now() < end) { setTimeout(t2, 40); }
        else {
          for (var i = 0; i < acc.length; i++) { acc[i] = acc[i] / n; }
          var out = [];
          for (var i = 3; i < acc.length - 3; i++) {
            if (acc[i] > acc[i - 1] && acc[i] > acc[i + 1] && acc[i] > -96) {
              out.push({ hz: Math.round(i * an.context.sampleRate / an.fftSize), db: Math.round(acc[i]) });
            }
          }
          out.sort(function (a, b) { return b.db - a.db; });
          res(out.slice(0, 8));
        }
      })();
    });
  };
})();
`;

const RESET = 'window.__ZQ_REC.peak=0;window.__ZQ_REC.rmsSum=0;window.__ZQ_REC.n=0;window.__ZQ_REC.at=-1;"ok"';
const READ = `(function(){var R=window.__ZQ_REC;return {live:R.live,peak:+R.peak.toFixed(4),
  rms:R.n?+Math.sqrt(R.rmsSum/R.n).toFixed(4):0,at:R.at};})()`;

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
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
  });
  await new Promise((r) => ws.addEventListener('open', r));

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: PATCH });
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: URL_ARG });
  await sleep(2200);

  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    return r && r.result ? r.result.value : undefined;
  };

  console.log('BEFORE ' + JSON.stringify(await ev('App.sound._state()')));
  await ev(RESET);

  const box = await ev("(function(){var e=document.querySelector(" + JSON.stringify(SEL) + ");if(!e)return null;e.scrollIntoView({block:'center'});var b=e.getBoundingClientRect();return {x:Math.round(b.left+b.width/2),y:Math.round(b.top+b.height/2)};})()");

  if (box) {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1, buttons: 1 });
    await sleep(30);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1, buttons: 0 });
  }
  await sleep(700);
  console.log('PLUCK ' + JSON.stringify(await ev(READ)));
  console.log('STATE1 ' + JSON.stringify(await ev('App.sound._state()')));

  // 音乐：先等淡入走完（1.6s）+ 首音排上（2.6s），再清一次，量 6 秒。
  // 6 秒足够覆盖一个完整音（磬 4.6s）加上间隔，能看出"有没有底噪层"。
  await sleep(5000);
  await ev(RESET);
  const specP = ev('window.__ZQ_SPEC(2600)');
  await sleep(6000);
  console.log('MUSIC ' + JSON.stringify(await ev(READ)));
  console.log('SPEC  ' + JSON.stringify(await specP));
  console.log('STATE2 ' + JSON.stringify(await ev('App.sound._state()')));

  const logs = await ev('(window.__ZQ_ERR||[]).join(" | ")');
  console.log('LOGS ' + (logs || ''));

  try { await send('Browser.close'); } catch (e) {}
  ws.close();
  try { child.kill(); } catch (e) {}
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (e) {}
  process.exit(0);
})();
