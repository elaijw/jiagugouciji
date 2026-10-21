// 音频素材的客观比对：解码 → 量化指标 → 频谱图 PNG。
//
// 为什么需要费这个劲：挑选音频时没法"听一遍"。但音色里可判定的部分
// 其实都能量出来 ——
//   骨板一击：起音陡（峰值到 -20dB 的衰减时间短）、频谱亮（质心 1.5k 以上）、
//             前后有静音（能干净裁切）
//   背景音乐：能量分布稳定（能循环）、低频有底（有"厚度"）、不是一片噪声
// 频谱图再补上"形状"这一层：一击是一条竖直亮带（快衰减），
// 持续音乐是若干条水平线（有音高），噪声是一整块糊。
//
// 为什么不用 python：没有 mp3 解码器、也没有 ffmpeg。
// 浏览器的 decodeAudioData 是现成的，但 file:// 下 fetch 被 CORS 拦，
// 所以在探针进程里起一个本地 http 服务，让页面和素材同源。
//
// 用法：node dev/_analyze_audio.js [目录]
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const DIR = process.argv[2] || path.join(__dirname, '_audio_pool');
const PORT = 9910 + (process.pid % 90);
const WEB = PORT + 1000;
const PROFILE = path.join(os.tmpdir(), 'zq_an_' + process.pid);

const TYPES = { '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.m4a': 'audio/mp4' };

const PAGE = `<!doctype html><meta charset="utf-8"><body><script>
/* ---- 一个最小 radix-2 FFT，用来算频谱质心与频段能量 ---- */
function fft(re, im) {
  var n = re.length;
  for (var i = 1, j = 0; i < n; i++) {
    var bit = n >> 1;
    for (; j & bit; bit >>= 1) { j ^= bit; }
    j ^= bit;
    if (i < j) {
      var t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (var len = 2; len <= n; len <<= 1) {
    var ang = -2 * Math.PI / len;
    var wr = Math.cos(ang), wi = Math.sin(ang);
    for (var i2 = 0; i2 < n; i2 += len) {
      var cr = 1, ci = 0;
      for (var k = 0; k < len / 2; k++) {
        var ur = re[i2 + k], ui = im[i2 + k];
        var jr = re[i2 + k + len / 2], ji = im[i2 + k + len / 2];
        var vr = jr * cr - ji * ci, vi = jr * ci + ji * cr;
        re[i2 + k] = ur + vr; im[i2 + k] = ui + vi;
        re[i2 + k + len / 2] = ur - vr; im[i2 + k + len / 2] = ui - vi;
        var ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}

window.__analyze = async function (url) {
  var ac = new (window.AudioContext || window.webkitAudioContext)();
  var res = await fetch(url);
  var ab = await res.arrayBuffer();
  var buf = await ac.decodeAudioData(ab);

  var ch = buf.getChannelData(0);
  var sr = buf.sampleRate;
  var dur = buf.duration;

  // ---- 峰值 / RMS / 包络 ----
  var peak = 0, peakAt = 0, sum = 0;
  for (var i = 0; i < ch.length; i++) {
    var a = ch[i] < 0 ? -ch[i] : ch[i];
    if (a > peak) { peak = a; peakAt = i; }
    sum += ch[i] * ch[i];
  }
  var rms = Math.sqrt(sum / ch.length);

  var hop = Math.max(1, Math.floor(sr * 0.01));
  var env = [];
  for (var s = 0; s < ch.length; s += hop) {
    var m = 0, n = Math.min(hop, ch.length - s);
    for (var k = 0; k < n; k++) { var v = Math.abs(ch[s + k]); if (v > m) { m = v; } }
    env.push(m);
  }
  // 衰减：从峰值帧起，跌到峰值 10%（-20dB）用了多久
  var pkFrame = Math.floor(peakAt / hop);
  var decayMs = -1;
  for (var f = pkFrame; f < env.length; f++) {
    if (env[f] < peak * 0.1) { decayMs = (f - pkFrame) * hop / sr * 1000; break; }
  }
  // 首尾静音（能不能干净裁切 / 能否循环）
  var thr = peak * 0.02;
  var headMs = 0, tailMs = 0;
  for (var f2 = 0; f2 < env.length; f2++) { if (env[f2] > thr) { headMs = f2 * hop / sr * 1000; break; } }
  for (var f3 = env.length - 1; f3 >= 0; f3--) { if (env[f3] > thr) { tailMs = (env.length - 1 - f3) * hop / sr * 1000; break; } }

  // 能量稳定性：100ms 帧 RMS 的变异系数（越小越"平"，越容易循环）
  var H = Math.floor(sr * 0.1), frames = [];
  for (var p = 0; p + H <= ch.length; p += H) {
    var ss = 0;
    for (var q = 0; q < H; q++) { ss += ch[p + q] * ch[p + q]; }
    frames.push(Math.sqrt(ss / H));
  }
  var fMean = 0, fMax = 0;
  frames.forEach(function (x) { fMean += x; if (x > fMax) { fMax = x; } });
  fMean /= frames.length || 1;
  var fVar = 0;
  frames.forEach(function (x) { fVar += (x - fMean) * (x - fMean); });
  var cv = fMean ? Math.sqrt(fVar / frames.length) / fMean : 0;

  // ---- 频谱：质心 + 频段占比 ----
  // N 取 2048：频率分辨率 21.5Hz（能看清 100Hz 以下的低音），
  // 时间窗 46ms（能分辨骨板那种几十毫秒的击打）。
  var N = 2048;
  var win = new Float32Array(N);
  for (var w = 0; w < N; w++) { win[w] = 0.5 - 0.5 * Math.cos(2 * Math.PI * w / (N - 1)); }
  var cols = Math.min(900, Math.max(240, Math.round(dur * 90)));
  var cSum = 0, cW = 0, band = { lo: 0, mid: 0, hi: 0 }, tot = 0, spec = [];
  for (var fi = 0; fi < cols; fi++) {
    var off = Math.floor(fi * Math.max(0, ch.length - N) / Math.max(1, cols - 1)) || 0;
    var re = new Float32Array(N), im = new Float32Array(N);
    for (var z = 0; z < N; z++) { re[z] = (ch[off + z] || 0) * win[z]; }
    fft(re, im);
    var row = new Float32Array(N / 2);
    for (var b = 1; b < N / 2; b++) {
      var mag = Math.sqrt(re[b] * re[b] + im[b] * im[b]);
      row[b] = mag;
      var hz = b * sr / N;
      cSum += hz * mag; cW += mag; tot += mag;
      if (hz < 200) { band.lo += mag; } else if (hz < 2000) { band.mid += mag; } else { band.hi += mag; }
    }
    spec.push(row);
  }
  var centroid = cW ? cSum / cW : 0;

  // ---- 频谱图 PNG ----
  var W = cols;
  var Hh = 300;
  /* 变量名别叫 cv —— cv 已经是变异系数，同名会把数字覆盖成画布 */
  var cvs = document.createElement('canvas');
  cvs.width = W; cvs.height = Hh;
  var g = cvs.getContext('2d');
  g.fillStyle = '#08070a'; g.fillRect(0, 0, W, Hh);
  // 对数频率轴 40Hz..16kHz
  var fMin = 40, fMax = 16000;
  var maxMag = 0;
  spec.forEach(function (r) { for (var i = 1; i < r.length; i++) { if (r[i] > maxMag) { maxMag = r[i]; } } });
  var img = g.createImageData(W, Hh);
  var px = img.data;
  for (var x = 0; x < W; x++) {
    var row = spec[x];
    for (var y = 0; y < Hh; y++) {
      var frac = 1 - y / Hh;
      var hz = fMin * Math.pow(fMax / fMin, frac);
      var bi = Math.round(hz * N / sr);
      var v = row[bi] || 0;
      var db = 20 * Math.log10(v / (maxMag || 1) + 1e-9);
      var t = Math.max(0, Math.min(1, (db + 62) / 62));
      // 黑 → 暗红 → 橙 → 浅黄 → 白（t 的幂次拉开中间调）
      var R = Math.round(255 * Math.pow(t, 0.75));
      var G = Math.round(255 * Math.pow(t, 1.7));
      var B = Math.round(255 * Math.pow(t, 3.6));
      var o = (y * W + x) * 4;
      px[o] = R; px[o + 1] = G; px[o + 2] = B; px[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  g.fillStyle = 'rgba(255,255,255,.55)';
  g.font = '11px monospace';
  [100, 500, 2000, 6000].forEach(function (hz) {
    var frac = Math.log(hz / fMin) / Math.log(fMax / fMin);
    var y = Math.round((1 - frac) * Hh);
    g.fillRect(0, y, W, 1);
    g.fillText(hz + 'Hz', 3, y - 3);
  });

  return {
    dur: +dur.toFixed(2),
    sr: sr,
    chans: buf.numberOfChannels,
    peak: +peak.toFixed(3),
    rms: +rms.toFixed(4),
    headMs: Math.round(headMs),
    tailMs: Math.round(tailMs),
    decayMs: Math.round(decayMs),
    cv: +cv.toFixed(2),
    centroid: Math.round(centroid),
    lo: +(band.lo / (tot || 1)).toFixed(2),
    mid: +(band.mid / (tot || 1)).toFixed(2),
    hi: +(band.hi / (tot || 1)).toFixed(2),
    png: cvs.toDataURL('image/png')
  };
};
</script>`;

const getJson = (u) => new Promise((res, rej) => {
  http.get(u, (r) => { let s = ''; r.on('data', (c) => s += c); r.on('end', () => { try { res(JSON.parse(s)); } catch (e) { rej(e); } }).on('error', rej); }).on('error', rej);
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const files = fs.readdirSync(DIR).filter((f) => TYPES[path.extname(f).toLowerCase()]);
  if (!files.length) { console.log('目录里没有音频：' + DIR); process.exit(1); }

  // 素材服务（与页面同源，页面才能 fetch 到 mp3）
  const srv = http.createServer((req, res) => {
    if (req.url === '/' || req.url.startsWith('/?')) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(PAGE);
    }
    if (req.url.startsWith('/f/')) {
      const name = decodeURIComponent(req.url.slice(3));
      const p = path.join(DIR, name);
      if (!fs.existsSync(p)) { res.writeHead(404); return res.end(''); }
      res.writeHead(200, { 'content-type': TYPES[path.extname(p).toLowerCase()] || 'application/octet-stream' });
      return fs.createReadStream(p).pipe(res);
    }
    res.writeHead(404); res.end('');
  });
  await new Promise((r) => srv.listen(WEB, '127.0.0.1', r));

  fs.rmSync(PROFILE, { recursive: true, force: true });
  const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-sandbox',
    '--autoplay-policy=no-user-gesture-required',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + PROFILE,
    '--window-size=1100,700', 'http://127.0.0.1:' + WEB + '/'], { stdio: 'ignore' });

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

  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r && r.exceptionDetails) { return { __err: r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || '') }; }
    return r && r.result ? r.result.value : undefined;
  };

  console.log('文件'.padEnd(20) + '时长'.padStart(6) + '声道'.padStart(5) +
    '峰'.padStart(6) + 'RMS'.padStart(7) + '首静'.padStart(6) + '尾静'.padStart(6) +
    '衰减'.padStart(7) + 'CV'.padStart(6) + '质心'.padStart(7) + '  低/中/高');
  console.log('-'.repeat(96));

  const out = [];
  for (const f of files) {
    const r = await ev('window.__analyze(' + JSON.stringify('/f/' + f) + ')');
    if (!r || r.__err) { console.log(f.padEnd(20) + ' ERR ' + (r && r.__err)); continue; }
    const pngPath = path.join(DIR, 'spec_' + f.replace(/\.[^.]+$/, '') + '.png');
    if (r.png) { fs.writeFileSync(pngPath, Buffer.from(r.png.split(',')[1], 'base64')); }
    out.push(Object.assign({ file: f }, r));
  }

  out.forEach((r) => {
    console.log(String(r.file).padEnd(20) + String(r.dur).padStart(6) + String(r.chans).padStart(5) +
      String(r.peak).padStart(6) + String(r.rms).padStart(7) +
      (r.headMs + 'ms').padStart(6) + (r.tailMs + 'ms').padStart(6) +
      (r.decayMs < 0 ? '—' : r.decayMs + 'ms').padStart(7) +
      String(r.cv).padStart(6) + String(r.centroid).padStart(7) +
      '  ' + r.lo + '/' + r.mid + '/' + r.hi);
  });
  console.log('');
  console.log('频谱图已写入 ' + DIR + '/spec_*.png');

  try { await send('Browser.close'); } catch (e) {}
  ws.close();
  try { child.kill(); } catch (e) {}
  srv.close();
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (e) {}
  process.exit(0);
})();
