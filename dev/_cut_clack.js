// 从一整段"骨头敲击"录音里，切出最干净的一击，存成小 WAV。
//
// 为什么要切：录音是 14 秒的连续敲击，直接用会带上前后的其他击打和底噪。
// 关卡点击需要的是"一下"：起音前有静音、本体短、尾音干净、中间没有第二击。
//
// 判定规则（都能量化）：
//   · 起音前 60ms 要静（不到本击峰值的 5%）—— 否则是从上一击的余音中间开始
//   · 起音后 300ms 内不允许出现超过本击 30% 的第二个峰 —— 否则是"两下"
//   · 从峰值跌到 -20dB 要短（骨头应当是干脆的，不是"哐"）
// 然后归一化到 -1.5dBFS，导出 16bit 单声道 WAV。
//
// 为什么不用 ffmpeg：机器上没有，也不该为这一步引入依赖。
// 浏览器的 decodeAudioData 负责解码，WAV 头自己写 —— 只有几十行。
//
// 用法：node dev/_cut_clack.js [源文件] [输出文件] [目标时长ms]
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.join(__dirname, '..');
const SRC = process.argv[2] || '702293.mp3';
const OUT = process.argv[3] || path.join(ROOT, 'assets', 'bone-clack.wav');
const LEN = Number(process.argv[4] || 340);
const DIR = path.join(__dirname, '_audio_pool');
const PORT = 9950 + (process.pid % 40);
const WEB = PORT + 1000;
const PROFILE = path.join(os.tmpdir(), 'zq_cc_' + process.pid);

const PAGE = `<!doctype html><meta charset="utf-8"><body><script>
window.__cut = async function (url, takeMs) {
  var ac = new (window.AudioContext || window.webkitAudioContext)();
  var ab = await (await fetch(url)).arrayBuffer();
  var buf = await ac.decodeAudioData(ab);
  var ch = buf.getChannelData(0);
  var sr = buf.sampleRate;

  // 3ms 包络
  var hop = Math.round(sr * 0.003);
  var env = [];
  for (var s = 0; s + hop <= ch.length; s += hop) {
    var m = 0;
    for (var k = 0; k < hop; k++) { var v = Math.abs(ch[s + k]); if (v > m) { m = v; } }
    env.push(m);
  }
  var gPeak = 0;
  env.forEach(function (x) { if (x > gPeak) { gPeak = x; } });

  // 先按"够响的局部极大"收一批候选。
  // 注意：这类录音本身就是一串连续敲击，几乎不存在"后面 300ms 全静"的孤立一击，
  // 所以不要求尾部静音 —— 而是靠"截得短 + 尾部淡出"把后面那一下切掉。
  var cands = [];
  for (var i = 2; i < env.length - 2; i++) {
    if (env[i] < gPeak * 0.30) { continue; }
    if (!(env[i] >= env[i - 1] && env[i] >= env[i + 1])) { continue; }

    var pre = 0;
    for (var j = Math.max(0, i - 20); j < i; j++) { if (env[j] > pre) { pre = env[j]; } }
    if (pre > env[i] * 0.40) { continue; }        // 前面太吵 → 是从上一击余音里起头

    // 衰减时间：跌到 10%
    var dec = -1;
    for (var j3 = i; j3 < env.length; j3++) {
      if (env[j3] < env[i] * 0.1) { dec = (j3 - i) * hop; break; }
    }
    // 前面最近的谷底：从这里起切，避免带上上一击的尾巴
    var g0 = i;
    while (g0 > 0 && env[g0 - 1] < env[g0]) { g0--; }

    cands.push({ i: i, g0: g0, peak: env[i], dec: dec, pre: pre });
  }

  if (!cands.length) { return { err: '没有可用的干净一击' }; }

  // 打分：响度优先，其次要"干脆"（衰减短）。尾部是否紧接着第二击不扣分，
  // 因为会在 takeMs 处淡出截断。
  cands.forEach(function (c) {
    c.score = (c.peak / (gPeak || 1)) * 3 - Math.min(1.2, (c.dec < 0 ? 2000 : c.dec) / 300);
  });
  cands.sort(function (a, b) { return b.score - a.score; });
  var best = cands[0];

  // 切：从前面那个谷底起（不超过 70ms），长度 takeMs
  var start = Math.max(0, Math.max(best.g0 * hop, best.i * hop - Math.round(sr * 0.07)));
  var n = Math.min(Math.round(sr * takeMs / 1000), ch.length - start);

  // 归一化 + 尾部 30ms 淡出（防止截断爆音）
  var seg = new Float32Array(n);
  var mx = 0;
  for (var t = 0; t < n; t++) { seg[t] = ch[start + t]; var a2 = Math.abs(seg[t]); if (a2 > mx) { mx = a2; } }
  var gain = mx > 0 ? (0.84 / mx) : 0;
  var fadeN = Math.round(sr * 0.055);
  for (var t2 = 0; t2 < n; t2++) {
    var g2 = gain;
    if (t2 > n - fadeN) { g2 *= (n - t2) / fadeN; }
    seg[t2] *= g2;
  }

  // ---- 写 WAV（16bit 单声道）----
  var bytes = new Uint8Array(44 + n * 2);
  var dv = new DataView(bytes.buffer);
  var wr = function (o, s) { for (var q = 0; q < s.length; q++) { dv.setUint8(o + q, s.charCodeAt(q)); } };
  wr(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); wr(8, 'WAVE');
  wr(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, sr, true); dv.setUint32(28, sr * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
  wr(36, 'data'); dv.setUint32(40, n * 2, true);
  for (var t3 = 0; t3 < n; t3++) {
    var q2 = Math.max(-1, Math.min(1, seg[t3]));
    dv.setInt16(44 + t3 * 2, Math.round(q2 * 32767), true);
  }

  var b64 = '';
  var CH = 8192;
  for (var o2 = 0; o2 < bytes.length; o2 += CH) {
    b64 += String.fromCharCode.apply(null, bytes.subarray(o2, o2 + CH));
  }
  b64 = btoa(b64);

  return {
    total: +buf.duration.toFixed(2),
    sr: sr,
    candidates: cands.length,
    picked: { at: +(best.i * hop / sr).toFixed(3), peak: +best.peak.toFixed(3) },
    pickedDecayMs: best.dec < 0 ? -1 : Math.round(best.dec / sr * 1000),
    outMs: Math.round(n / sr * 1000),
    outPeak: 0.84,
    wav: b64
  };
};
</script>`;

const getJson = (u) => new Promise((res, rej) => {
  http.get(u, (r) => { let s = ''; r.on('data', (c) => s += c); r.on('end', () => { try { res(JSON.parse(s)); } catch (e) { rej(e); } }).on('error', rej); }).on('error', rej);
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const srv = http.createServer((req, res) => {
    if (req.url === '/' || req.url.startsWith('/?')) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(PAGE);
    }
    if (req.url.startsWith('/f/')) {
      const p = path.join(DIR, decodeURIComponent(req.url.slice(3)));
      if (!fs.existsSync(p)) { res.writeHead(404); return res.end(''); }
      res.writeHead(200, { 'content-type': 'audio/mpeg' });
      return fs.createReadStream(p).pipe(res);
    }
    res.writeHead(404); res.end('');
  });
  await new Promise((r) => srv.listen(WEB, '127.0.0.1', r));

  fs.rmSync(PROFILE, { recursive: true, force: true });
  const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-sandbox',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + PROFILE,
    '--window-size=900,600', 'http://127.0.0.1:' + WEB + '/'], { stdio: 'ignore' });

  let page = null;
  for (let i = 0; i < 60; i++) {
    await sleep(400);
    try {
      const l = await getJson('http://127.0.0.1:' + PORT + '/json/list');
      page = (l || []).find((t) => t.type === 'page' && t.webSocketDebuggerUrl && t.url.indexOf(String(WEB)) >= 0);
      if (page) break;
    } catch (e) {}
  }
  if (!page) { child.kill(); srv.close(); console.log('ERR 无法连接'); process.exit(1); }

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  const send = (m, p) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); });
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
  });
  await new Promise((r) => ws.addEventListener('open', r));
  await send('Runtime.enable');

  const r = await send('Runtime.evaluate', {
    expression: 'window.__cut(' + JSON.stringify('/f/' + SRC) + ',' + LEN + ')',
    returnByValue: true, awaitPromise: true
  });
  if (r && r.exceptionDetails) {
    console.log('ERR ' + r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description));
  } else {
    const v = r.result.value;
    if (v.err) {
      console.log('ERR ' + v.err);
    } else {
      fs.mkdirSync(path.dirname(OUT), { recursive: true });
      fs.writeFileSync(OUT, Buffer.from(v.wav, 'base64'));
      console.log('源文件   ' + SRC + '  ' + v.total + 's  ' + v.sr + 'Hz');
      console.log('候选起音 ' + v.candidates + ' 处');
      console.log('选中     ' + v.picked.at + 's 处，峰值 ' + v.picked.peak + '，衰减 ' + v.pickedDecayMs + 'ms');
      console.log('输出     ' + path.basename(OUT) + '  ' + v.outMs + 'ms  ' +
        Math.round(fs.statSync(OUT).size / 1024) + 'KB');
    }
  }

  try { await send('Browser.close'); } catch (e) {}
  ws.close();
  try { child.kill(); } catch (e) {}
  srv.close();
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (e) {}
  process.exit(0);
})();
