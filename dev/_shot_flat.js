// 全站整页截图（"静帧"模式）
// 与 _shot_report.js 的唯一区别：导航前先模拟 prefers-reduced-motion: reduce，
// 让 motion.js 完全不挂隐藏态，于是整页内容在截图中都是可见的。
// 这一点很关键——_shot_report.js 拍整页时，视口外的 .mo-rv 仍是 opacity:0，
// 拍出来是一大片空白，容易误判成"页面坏了"。
//
// 用法：node dev/_shot_flat.js <url> <out.png> [宽] [y] [高] [等待ms]
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const URL_ARG = process.argv[2];
const OUT = process.argv[3];
const W = parseInt(process.argv[4] || '1440', 10);
const PORT = 9400 + (process.pid % 200);
const PROFILE = path.join(os.tmpdir(), 'zq_flat_' + process.pid);

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
  const DSF = parseFloat(process.argv[9] || '1');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: 1400, deviceScaleFactor: DSF, mobile: false });
  // 关键：让 motion.js 读到 reduce=true，从而不挂 .js-motion 隐藏态
  await send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }]
  });
  await send('Page.navigate', { url: URL_ARG });
  await sleep(parseInt(process.argv[7] || '1800', 10));

  /* 可选：拍之前先点一下某个元素（用于验"切档/展开"之后的样子） */
  const CLICK = process.argv[11];
  if (CLICK) {
    await send('Runtime.evaluate', {
      expression: `(function(){var e=document.querySelector(${JSON.stringify(CLICK)});if(!e)return 'miss';e.click();return 'ok';})()`,
      returnByValue: true
    });
    await sleep(700);
  }

  /* 可选：拍之前执行一段 JS（用于验奖励弹层这类"要触发才出现"的状态） */
  const EXEC = process.argv[12];
  if (EXEC) {
    await send('Runtime.evaluate', { expression: EXEC, returnByValue: true });
    await sleep(900);
  }

  /* 可选：把指针真正移到某个元素上（用于验 :hover —— JS 派发的 mouseover
     事件不会触发 CSS :hover，那是浏览器内部状态，只能走 CDP 的 Input 通道） */
  const HOV = process.argv[13];
  if (HOV) {
    const r = await send('Runtime.evaluate', {
      expression: `(function(){var e=document.querySelector(${JSON.stringify(HOV)});if(!e)return null;e.scrollIntoView({block:'center'});var b=e.getBoundingClientRect();return {x:b.left+b.width/2,y:b.top+b.height/2};})()`,
      returnByValue: true
    });
    const pt = r && r.result && r.result.value;
    if (pt) {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pt.x, y: pt.y, buttons: 0 });
      await sleep(800);  // 等 transition 走完（.34s）
    } else {
      console.log('WARN 悬停选择器没命中：' + HOV);
    }
  }

  const m = await send('Page.getLayoutMetrics');
  const fullH = Math.ceil((m.cssContentSize || {}).height || 1400);
  let y = parseInt(process.argv[5] || '0', 10);
  let hWant = parseInt(process.argv[6] || '0', 10);
  let clipW = W;

  /* 可选：传选择器，直接框住某个元素拍（用于局部放大看质感） */
  const SEL = process.argv[8];
  if (SEL) {
    const r = await send('Runtime.evaluate', {
      expression: `(function(){var e=document.querySelector(${JSON.stringify(SEL)});if(!e)return null;var b=e.getBoundingClientRect();return {x:b.left+scrollX,y:b.top+scrollY,w:b.width,h:b.height};})()`,
      returnByValue: true
    });
    const box = r && r.result && r.result.value;
    if (box) {
      y = Math.max(0, Math.round(box.y) - 10);
      hWant = Math.round(box.h) + 20;
      clipW = Math.min(W, Math.round(box.w) + 20);
    } else {
      console.log('WARN 选择器没命中：' + SEL);
    }
  }

  const h = hWant > 0 ? Math.min(hWant, fullH - y) : Math.min(fullH, 12000);
  const shot = await send('Page.captureScreenshot', {
    format: 'png', captureBeyondViewport: true,
    clip: { x: parseFloat(process.argv[10] || '0'), y: y, width: clipW, height: h, scale: DSF },
  });
  fs.writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
  console.log('OK ' + OUT + ' y=' + y + ' h=' + h + ' full=' + fullH);

  try { await send('Browser.close'); } catch (e) {}
  ws.close();
  try { child.kill(); } catch (e) {}
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (e) {}
  process.exit(0);
})();
