// 从 assets/oracle-bone.jpg 里把「骨片」从深灰展柜背景中分割出来，
// 输出归一化(0~1)的轮廓多边形，供 CSS clip-path: url(#id) 使用。
//
// 判据：骨片是**暖亮**的（R 明显大于 B），展柜背景与台面是中性灰（R≈G≈B）。
// 所以用 warm = R - B 做分割，比用亮度可靠——照片下部台面也很亮，用亮度会把台面并进来。
//
// 用法：node dev/_slab_outline.js [点数]
// 输出：归一化坐标数组 + 直接可贴进 SVG 的 path d 串

const { spawn } = require('child_process');
const http = require('http');
const path = require('path'), os = require('os'), fs = require('fs');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.resolve(__dirname, '..');
const N = parseInt(process.argv[2] || '72', 10);
const PORT = 9411;
const profile = path.join(os.tmpdir(), 'zq_outline');
fs.rmSync(profile, { recursive: true, force: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));
function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let s = '';
      res.on('data', c => s += c);
      res.on('end', () => { try { resolve(JSON.parse(s)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

const EXTRACT = `
(function () {
  return new Promise(function (resolve) {
    var img = new Image();
    img.onload = function () {
      var W = 240, H = Math.round(240 * img.height / img.width);
      var cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      var ctx = cv.getContext('2d');
      ctx.drawImage(img, 0, 0, W, H);
      var d = ctx.getImageData(0, 0, W, H).data;

      // ---- 1. 暖度分割 ----
      var mask = new Uint8Array(W * H);
      for (var i = 0; i < W * H; i++) {
        var r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
        var warm = r - b;
        var lum = (r * 0.299 + g * 0.587 + b * 0.114);
        mask[i] = (warm >= 13 && lum >= 70) ? 1 : 0;
      }

      // ---- 2. 从中心做连通域填充，丢掉零星噪点 ----
      var seen = new Uint8Array(W * H);
      var start = -1;
      // 找中心附近第一个 mask=1 的点
      var cx = W >> 1, cy = H >> 1;
      for (var rad = 0; rad < Math.max(W, H) && start < 0; rad++) {
        for (var dy = -rad; dy <= rad && start < 0; dy++) {
          for (var dx = -rad; dx <= rad && start < 0; dx++) {
            var x = cx + dx, y = cy + dy;
            if (x < 0 || y < 0 || x >= W || y >= H) continue;
            if (mask[y * W + x]) start = y * W + x;
          }
        }
      }
      if (start < 0) { resolve({ error: '中心没有落在骨片上' }); return; }

      var stack = [start], filled = 0;
      seen[start] = 1;
      while (stack.length) {
        var p = stack.pop(); filled++;
        var px = p % W, py = (p / W) | 0;
        [[1,0],[-1,0],[0,1],[0,-1]].forEach(function (dd) {
          var nx = px + dd[0], ny = py + dd[1];
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) return;
          var q = ny * W + nx;
          if (mask[q] && !seen[q]) { seen[q] = 1; stack.push(q); }
        });
      }

      // ---- 3. Moore 邻域边界追踪 ----
      // 找最上最左的边界起点
      var sx = -1, sy = -1;
      outer: for (var yy = 0; yy < H; yy++) {
        for (var xx = 0; xx < W; xx++) {
          if (seen[yy * W + xx]) { sx = xx; sy = yy; break outer; }
        }
      }
      var dirs = [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
      var contour = [], cxp = sx, cyp = sy, dir = 7, guard = 0;
      do {
        contour.push([cxp, cyp]);
        var found = false;
        // 从当前方向的右后方开始顺时针找下一个边界点
        for (var k = 0; k < 8; k++) {
          var dd = (dir + 6 + k) % 8;
          var nx2 = cxp + dirs[dd][0], ny2 = cyp + dirs[dd][1];
          if (nx2 < 0 || ny2 < 0 || nx2 >= W || ny2 >= H) continue;
          if (seen[ny2 * W + nx2]) {
            cxp = nx2; cyp = ny2; dir = dd; found = true; break;
          }
        }
        if (!found) break;
        guard++;
      } while ((cxp !== sx || cyp !== sy) && guard < W * H * 4);

      // ---- 4. 按弧长均匀重采样到 N 个点 ----
      var seg = [], total = 0;
      for (var j = 0; j < contour.length; j++) {
        var a = contour[j], b2 = contour[(j + 1) % contour.length];
        var len = Math.hypot(b2[0] - a[0], b2[1] - a[1]);
        seg.push({ a: a, b: b2, len: len });
        total += len;
      }
      var step = total / N, out = [], walked = 0, si = 0, acc = 0;
      for (var t = 0; t < N; t++) {
        var target = t * step;
        while (si < seg.length - 1 && acc + seg[si].len < target) { acc += seg[si].len; si++; }
        var s2 = seg[si], k2 = s2.len ? (target - acc) / s2.len : 0;
        var px2 = s2.a[0] + (s2.b[0] - s2.a[0]) * k2;
        var py2 = s2.a[1] + (s2.b[1] - s2.a[1]) * k2;
        out.push([px2 / W, py2 / H]);
      }

      // ---- 5. 轻平滑，去掉单像素抖动 ----
      var sm = out.map(function (p, i) {
        var p0 = out[(i - 1 + N) % N], p2 = out[(i + 1) % N];
        return [(p0[0] + p[0] * 2 + p2[0]) / 4, (p0[1] + p[1] * 2 + p2[1]) / 4];
      });

      var xs = sm.map(function (p) { return p[0]; });
      var ys = sm.map(function (p) { return p[1]; });

      resolve({
        W: W, H: H, imgW: img.width, imgH: img.height,
        filledPct: +(filled / (W * H) * 100).toFixed(1),
        contourLen: contour.length,
        bbox: [Math.min.apply(null, xs), Math.min.apply(null, ys),
               Math.max.apply(null, xs), Math.max.apply(null, ys)],
        pts: sm
      });
    };
    img.onerror = function () { resolve({ error: '图片加载失败' }); };
    img.src = 'assets/oracle-bone.jpg';
  });
})()
`;

(async () => {
  const child = spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--no-sandbox',
    '--allow-file-access-from-files',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + profile,
    '--window-size=1200,900',
    'file:///' + ROOT.replace(/\\/g, '/') + '/index.html',
  ], { stdio: 'ignore' });

  let targets = null;
  for (let i = 0; i < 60; i++) {
    await sleep(400);
    try {
      targets = await getJson('http://127.0.0.1:' + PORT + '/json/list');
      if (targets && targets.some(t => t.type === 'page' && t.webSocketDebuggerUrl)) break;
    } catch (e) {}
  }
  const page = (targets || []).find(t => t.type === 'page' && t.webSocketDebuggerUrl);
  if (!page) { console.log('拿不到调试目标'); child.kill(); process.exit(1); }

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const send = (method, params) => new Promise(res => {
    const myId = ++id;
    pending.set(myId, res);
    ws.send(JSON.stringify({ id: myId, method, params: params || {} }));
  });
  ws.addEventListener('message', e => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result); pending.delete(msg.id); }
  });
  await new Promise(r => ws.addEventListener('open', r));
  await send('Page.enable');
  await send('Runtime.enable');
  await sleep(1500);

  const res = await send('Runtime.evaluate', {
    expression: EXTRACT, awaitPromise: true, returnByValue: true
  });

  const val = res && res.result && res.result.value;
  if (!val || val.error) {
    console.log('失败：' + (val && val.error || JSON.stringify(res).slice(0, 300)));
  } else {
    const f = n => n.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
    const d = val.pts.map((p, i) => (i ? 'L' : 'M') + f(p[0]) + ',' + f(p[1])).join(' ') + ' Z';
    console.log('图像 ' + val.imgW + 'x' + val.imgH + '　采样 ' + val.W + 'x' + val.H);
    console.log('骨片占画面 ' + val.filledPct + '%　原始边界点 ' + val.contourLen);
    console.log('包围盒 x[' + val.bbox[0].toFixed(3) + '~' + val.bbox[2].toFixed(3)
      + '] y[' + val.bbox[1].toFixed(3) + '~' + val.bbox[3].toFixed(3) + ']');
    console.log('\n--- objectBoundingBox path ---');
    console.log(d);
    console.log('\n--- 未归一化（照片像素）---');
    console.log(val.pts.map(p => Math.round(p[0] * val.imgW) + ',' + Math.round(p[1] * val.imgH)).join(' '));
  }

  await send('Browser.close').catch(() => {});
  try { ws.close(); } catch (e) {}
  await sleep(300);
  try { child.kill(); } catch (e) {}
  process.exit(0);
})();
