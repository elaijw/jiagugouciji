/* ============================================================
   甲骨奇谭 · 实体甲骨文字（world-glyph）
   ------------------------------------------------------------
   把 levels.json 里那 38 个字，做成真正有体积的三维物件，
   取代原先"贴了张字贴图的薄石板"。

   技术路线（不引外部依赖，file:// 直开也能跑）：
     1. 字形矢量来自 js/core/glyph-parts.json —— 每个字的每个构件是一条
        M/L 折线 + strokeWidth + transform。全部是真字形笔画，不是仿形。
     2. 折线抽稀 → 两侧各偏移半个笔宽 → 得到闭合多边形
     3. 用 three 自带的 ExtrudeGeometry 挤出成带倒角的实体笔画：
        侧面真有厚度，侧着看有轮廓，会投影 —— 是 sculpt，不是 billboard
     4. 载体（龟甲 / 骨片 / 肩胛骨 / 石刻 / 陶铜 / 构字装置）各不相同，
        每个字根据自己的分区与笔画数挑载体，不做"清一色发光立体字"

   产出：App.worldGlyph.buildItem({char, style, size}) -> { group, ... }
   ============================================================ */
(function (App) {
  'use strict';

  var T = null;
  function TH() { if (!T) { T = window.THREE; } return T; }

  /* ================= 1. 矢量解析 ================= */

  var pathCache = {};      /* char -> { pieces:[ [[x,y]..] ], hw }  归一化，跨度=1，居中 */

  function parsePolyline(d) {
    var nums = d.match(/-?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?/g);
    if (!nums) { return []; }
    var out = [];
    for (var i = 0; i + 1 < nums.length; i += 2) {
      out.push([parseFloat(nums[i]), parseFloat(nums[i + 1])]);
    }
    return out;
  }

  function parseTransform(s) {
    var t = { tx: 0, ty: 0, s: 1 };
    if (!s) { return t; }
    var m = /translate\(\s*(-?[0-9.]+)[\s,]+(-?[0-9.]+)\s*\)/.exec(s);
    if (m) { t.tx = parseFloat(m[1]); t.ty = parseFloat(m[2]); }
    m = /scale\(\s*(-?[0-9.]+)/.exec(s);
    if (m) { t.s = parseFloat(m[1]); }
    return t;
  }

  /* Douglas–Peucker：原始数据是一条直线采样 30 多个点，直接偏移会造出
     几十条几乎共线的边 —— 三角形白白涨一个数量级。抽一刀到 ~2 个点。 */
  function simplify(pts, eps) {
    var n = pts.length;
    if (n < 3) { return pts.slice(); }
    var keep = new Uint8Array(n);
    keep[0] = keep[n - 1] = 1;
    (function seg(a, b) {
      if (b <= a + 1) { return; }
      var ax = pts[a][0], ay = pts[a][1], bx = pts[b][0], by = pts[b][1];
      var dx = bx - ax, dy = by - ay;
      var len2 = dx * dx + dy * dy || 1;
      var best = -1, bi = -1;
      for (var i = a + 1; i < b; i++) {
        var px = pts[i][0] - ax, py = pts[i][1] - ay;
        var t = Math.max(0, Math.min(1, (px * dx + py * dy) / len2));
        var qx = px - dx * t, qy = py - dy * t;
        var dd = qx * qx + qy * qy;
        if (dd > best) { best = dd; bi = i; }
      }
      if (best > eps * eps) { keep[bi] = 1; seg(a, bi); seg(bi, b); }
    })(0, n - 1);
    var out = [];
    for (var i = 0; i < n; i++) { if (keep[i]) { out.push(pts[i]); } }
    return out;
  }

  /* 折线 → 闭合多边形：左右各偏移 hw，两端用半圆封口（骨刻用圆起笔） */
  function offsetStroke(pts, hw) {
    var n = pts.length, i;
    /* 闭合笔画：首尾几乎重合 —— 甲骨文里的圈（日、口、目、山的外廓）都是这类。
       对这类笔画，左右两条边各走一整圈，首尾直接对接，不能加圆帽，
       否则会在闭合处各鼓出半个圆头，变成"多了一笔"。 */
    var firstP = pts[0], lastP = pts[n - 1];
    if (n >= 4 && Math.hypot(firstP[0] - lastP[0], firstP[1] - lastP[1]) < hw * 1.4) {
      var L0 = [], R0 = [];
      for (i = 0; i < n - 1; i++) {
        var p0 = pts[i];
        var q0 = pts[(i - 1 + n - 1) % (n - 1)], r0 = pts[(i + 1) % (n - 1)];
        var dx = r0[0] - q0[0], dy = r0[1] - q0[1];
        var ln = Math.hypot(dx, dy) || 1;
        var nx = -dy / ln, ny = dx / ln;
        L0.push([p0[0] + nx * hw, p0[1] + ny * hw]);
        R0.push([p0[0] - nx * hw, p0[1] - ny * hw]);
      }
      return L0.concat(R0.reverse());
    }
    if (n === 1) {
      var c = [];
      for (i = 0; i < 10; i++) {
        var a = i / 10 * Math.PI * 2;
        c.push([pts[0][0] + Math.cos(a) * hw, pts[0][1] + Math.sin(a) * hw]);
      }
      return c;
    }
    var L = [], R = [];
    for (i = 0; i < n; i++) {
      var p = pts[i];
      var a0 = pts[Math.max(0, i - 1)], b0 = pts[Math.min(n - 1, i + 1)];
      var dx = b0[0] - a0[0], dy = b0[1] - a0[1];
      var len = Math.hypot(dx, dy) || 1;
      var nx = -dy / len, ny = dx / len;
      L.push([p[0] + nx * hw, p[1] + ny * hw]);
      R.push([p[0] - nx * hw, p[1] - ny * hw]);
    }
    /* 端点：切线方向 ≤······≥ 半圆 */
    function cap(endP, unit, from, to, out_) {
      for (var k = 1; k < 5; k++) {
        var th = (k / 5) * Math.PI;
        var ca = Math.cos(th), sa = Math.sin(th);
        var nx = -unit[1], ny = unit[0];
        out_.push([endP[0] + nx * hw * ca + unit[0] * hw * sa,
                   endP[1] + ny * hw * ca + unit[1] * hw * sa]);
      }
      return out_;
    }
    var te = [pts[n - 1][0] - pts[n - 2][0], pts[n - 1][1] - pts[n - 2][1]];
    var tl = Math.hypot(te[0], te[1]) || 1; te = [te[0] / tl, te[1] / tl];
    var ts = [pts[0][0] - pts[1][0], pts[0][1] - pts[1][1]];
    var sl = Math.hypot(ts[0], ts[1]) || 1; ts = [ts[0] / sl, ts[1] / sl];
    var out = L.slice();
    cap(pts[n - 1], te, 0, 0, out);
    for (i = n - 1; i >= 0; i--) { out.push(R[i]); }
    cap(pts[0], ts, 0, 0, out);
    return out;
  }

  /* 归一化后的笔画数据（跨度 1、居中于原点、单位里的半笔宽） */
  function strokesOf(ch) {
    if (pathCache[ch]) { return pathCache[ch]; }
    var rec = (App.glyphs && App.glyphs.parts) ? App.glyphs.parts[ch] : null;
    if (!rec || !rec.pieces || !rec.pieces.length) { return null; }
    var tf = parseTransform(rec.transform);
    var hwRaw = (rec.strokeWidth || 0.15) * tf.s * 0.5;
    var pieces = [], minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9, i, j;
    for (i = 0; i < rec.pieces.length; i++) {
      var raw = parsePolyline(rec.pieces[i].d);
      if (raw.length < 2) { continue; }
      var pts = [];
      for (j = 0; j < raw.length; j++) {
        var x = raw[j][0] * tf.s + tf.tx;
        var y = -(raw[j][1] * tf.s + tf.ty);      /* SVG y 朝下 → 数学习惯 y 朝上 */
        pts.push([x, y]);
        if (x < minx) { minx = x; } if (x > maxx) { maxx = x; }
        if (y < miny) { miny = y; } if (y > maxy) { maxy = y; }
      }
      pts = simplify(pts, Math.max(0.5, hwRaw * 0.45));
      if (pts.length >= 2) { pieces.push(pts); }
    }
    if (!pieces.length) { return null; }
    var w = maxx - minx, h = maxy - miny;
    var ext = Math.max(w, h) || 1;
    var cx = (minx + maxx) / 2, cy = (miny + maxy) / 2;
    var k = 1 / ext;
    for (i = 0; i < pieces.length; i++) {
      for (j = 0; j < pieces[i].length; j++) {
        pieces[i][j][0] = (pieces[i][j][0] - cx) * k;
        pieces[i][j][1] = (pieces[i][j][1] - cy) * k;
      }
    }
    /* 笔画宽度不能直接照搬矢量的线宽：矢量数据里的线宽是按"屏幕上看得见"定的，
       归一化之后只有 ~1%，落到 40 厘米的实物上就是 4 毫米的细线 —— 凑近才看得见。
       给它一个下限：至少占字高的 3%，刻痕才真正是"凿出来的沟"。 */
    var out = { pieces: pieces, hw: Math.max(hwRaw * k + 0.006, 0.032), count: pieces.length };
    pathCache[ch] = out;
    return out;
  }

  var polyCache = {};
  function polysOf(ch) {
    if (polyCache[ch]) { return polyCache[ch]; }
    var s = strokesOf(ch);
    if (!s) { return null; }
    var out = [];
    for (var i = 0; i < s.pieces.length; i++) {
      var poly = offsetStroke(s.pieces[i], s.hw);
      if (poly && poly.length >= 3) { out.push(poly); }
    }
    polyCache[ch] = out;
    return out;
  }

  function shapeOfPoly(poly) {
    var s = new T.Shape();
    s.moveTo(poly[0][0], poly[0][1]);
    for (var i = 1; i < poly.length; i++) { s.lineTo(poly[i][0], poly[i][1]); }
    s.closePath();
    return s;
  }

  function centroid(poly) {
    var x = 0, y = 0;
    for (var i = 0; i < poly.length; i++) { x += poly[i][0]; y += poly[i][1]; }
    return [x / poly.length, y / poly.length];
  }

  /* ================= 2. 几何合并 ================= */

  function mergeGeos(items) {
    var gs = [], total = 0, i, g;
    for (i = 0; i < items.length; i++) {
      g = items[i].g;
      g = g.index ? g.toNonIndexed() : g.clone();
      if (items[i].m) { g.applyMatrix4(items[i].m); }
      if (!g.attributes.normal) { g.computeVertexNormals(); }
      gs.push(g); total += g.attributes.position.count;
    }
    if (!total) { return null; }
    var pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), o = 0;
    for (i = 0; i < gs.length; i++) {
      g = gs[i];
      var n = g.attributes.position.count;
      pos.set(g.attributes.position.array.subarray(0, n * 3), o * 3);
      if (g.attributes.normal) { nor.set(g.attributes.normal.array.subarray(0, n * 3), o * 3); }
      o += n;
      g.dispose();
    }
    var out = new T.BufferGeometry();
    out.setAttribute('position', new T.BufferAttribute(pos, 3));
    out.setAttribute('normal', new T.BufferAttribute(nor, 3));
    return out;
  }

  function mat(x, y, z, rx, ry, rz, sx, sy, sz) {
    var m = new T.Matrix4();
    m.compose(new T.Vector3(x || 0, y || 0, z || 0),
      new T.Quaternion().setFromEuler(new T.Euler(rx || 0, ry || 0, rz || 0, 'YXZ')),
      new T.Vector3(sx == null ? 1 : sx, sy == null ? 1 : sy, sz == null ? 1 : sz));
    return m;
  }

  /* ================= 3. 共享材质 ================= */

  var SHARED = null;
  function M() {
    if (SHARED) { return SHARED; }
    TH();
    SHARED = {
      bone:    new T.MeshStandardMaterial({ color: 0xd8cea6, roughness: 0.70, metalness: 0.03 }),
      boneDk:  new T.MeshStandardMaterial({ color: 0x93835f, roughness: 0.86, metalness: 0.02 }),
      boneIn:  new T.MeshStandardMaterial({ color: 0xb9ac86, roughness: 0.80, metalness: 0.02 }),
      stone:   new T.MeshStandardMaterial({ color: 0x7d7466, roughness: 0.93, metalness: 0.03 }),
      stoneDk: new T.MeshStandardMaterial({ color: 0x544b40, roughness: 0.90, metalness: 0.04 }),
      bronze:  new T.MeshStandardMaterial({ color: 0x6f8163, roughness: 0.44, metalness: 0.60 }),
      bronzeDk: new T.MeshStandardMaterial({ color: 0x4a5a44, roughness: 0.52, metalness: 0.55 }),
      wood:    new T.MeshStandardMaterial({ color: 0x4a3524, roughness: 0.85, metalness: 0.03 }),
      ceramic: new T.MeshStandardMaterial({ color: 0xb08259, roughness: 0.78, metalness: 0.02,
                                            side: T.DoubleSide }),
      ceramicIn: new T.MeshStandardMaterial({ color: 0x8a6543, roughness: 0.82, metalness: 0.02,
                                            side: T.DoubleSide }),
      ink:     new T.MeshStandardMaterial({ color: 0x2b2419, roughness: 0.5, metalness: 0.06 })
    };
    return SHARED;
  }

  /* ================= 4. 载体：六种 ================= */
  /* 每个 builder 往 parts 里塞 {key, g, m}；约定：
       局部原点在底部中心（y=0 是地面）
       字的安装面：法线朝 +Z，中心在 (0, MOUNT_Y, MOUNT_Z)
     返回 { parts, mount:{y,z,size}, collider:{hx,hz,h} } */

  function rnd(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function roundedRect(w, h, r) {
    r = Math.min(r, w / 2 - 0.01, h / 2 - 0.01);
    var s = new T.Shape();
    var x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y);
    s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    return s;
  }

  function blobShape(rx, ry, n, wob, R) {
    var s = new T.Shape();
    var per = [], i;
    for (i = 0; i < n; i++) { per.push(1 + (R() - 0.5) * wob); }
    var pt = function (k) {
      var a = k / n * Math.PI * 2;
      var kk = per[((k % n) + n) % n];
      return [Math.cos(a) * rx * kk, Math.sin(a) * ry * kk];
    };
    var p = pt(0);
    s.moveTo(p[0], p[1]);
    for (i = 1; i < n; i++) { p = pt(i); s.lineTo(p[0], p[1]); }
    s.closePath();
    return s;
  }

  function drill(s, cx, cy, r) {
    var h = new T.Path();
    h.absarc(cx, cy, r, 0, Math.PI * 2, true);
    s.holes.push(h);
  }

  /* —— 龟腹甲：装在石托上的整块腹甲，边缘未修整 —— */
  function carrierPlastron(size, seed) {
    var parts = [], R = rnd(seed);
    var w = 0.86 * size * 1.9, h = 1.16 * size * 1.9;
    var s = roundedRect(w, h, 0.12);
    var D = 0.075, BT = 0.022;
    /* FY = 甲面中心的高度：石托之上。roundedRect 是以 y=0 为中心的，
       不抬上去整块甲会半埋进地里、字悬在甲顶上方（量出来的真 bug）。 */
    var FY = 0.42 + h / 2;
    var face = new T.ExtrudeGeometry(s, { depth: D, bevelEnabled: true,
      bevelThickness: BT, bevelSize: 0.026, bevelSegments: 1, steps: 1, curveSegments: 4 });
    parts.push({ key: 'bone', g: face, m: mat(0, FY, 0, 0, 0, 0) });
    /* 挤出 + 倒角之后，正面平板其实落在 z = depth + bevelThickness。
       甲缝要在它上面一点点，否则整套细节会被埋进甲里看不见。 */
    var TOPZ = D + BT;
    /* 背面的厚边框（比正面宽一圈，看着是"整块甲"） */
    var bs = roundedRect(w + 0.10, h + 0.10, 0.14);
    parts.push({ key: 'boneDk', g: new T.ExtrudeGeometry(bs, { depth: 0.05, bevelEnabled: false, steps: 1, curveSegments: 4 }),
      m: mat(0, FY, -0.055) });
    var seam = new T.BoxGeometry(1, 1, 1);
    for (var i = -1; i <= 1; i++) {
      parts.push({ key: 'boneDk', g: seam, m: mat(0, FY + i * h * 0.26, TOPZ + 0.004, 0, 0, 0, w * 0.92, 0.016, 0.02) });
    }
    parts.push({ key: 'boneDk', g: seam, m: mat(0, FY, TOPZ + 0.004, 0, 0, 0, 0.016, h * 0.94, 0.02) });
    /* 卜兆裂纹：卜过错裂纹是甲骨最要紧的证据 */
    parts.push({ key: 'ink', g: seam, m: mat(-w * 0.22, FY + h * 0.12, TOPZ + 0.006, 0, 0, 0.7, 0.012, h * 0.5, 0.018) });
    parts.push({ key: 'ink', g: seam, m: mat(w * 0.24, FY - h * 0.1, TOPZ + 0.006, 0, 0, -0.6, 0.012, h * 0.42, 0.018) });
    /* 石托：一块底座 + 左右两个卡座 */
    parts.push({ key: 'stoneDk', g: new T.BoxGeometry(w * 0.9, 0.22, 0.62), m: mat(0, 0.11, 0) });
    parts.push({ key: 'stone', g: new T.BoxGeometry(0.26, 0.44, 0.44), m: mat(-w * 0.34, 0.34, 0, 0, 0, 0.12) });
    parts.push({ key: 'stone', g: new T.BoxGeometry(0.26, 0.44, 0.44), m: mat(w * 0.34, 0.34, 0, 0, 0, -0.12) });
    return { parts: parts, mount: { y: FY, z: TOPZ, size: Math.min(w, h) * 0.52 },
      collider: { hx: w / 2 + 0.25, hz: 0.45, h: FY + h / 2 + 0.1 } };
  }

  /* —— 骨片：不规则薄片，斜插在土台上，边缘有钻孔 —— */
  function carrierBone(size, seed) {
    var parts = [], R = rnd(seed);
    var w = 0.62 * size * 1.9, h = 0.92 * size * 1.9;
    var s = blobShape(w / 2, h / 2, 11, 0.30, R);
    /* 钻孔：甲骨整治后会锉出小圆孔，是它最像"实物"的细节 */
    if (R() > 0.35) { drill(s, w * 0.24, -h * 0.30, 0.055); }
    if (R() > 0.6) { drill(s, -w * 0.26, -h * 0.34, 0.048); }
    var g = new T.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: true,
      bevelThickness: 0.016, bevelSize: 0.018, bevelSegments: 1, steps: 1 });
    var TOPZ = 0.05 + 0.016;
    parts.push({ key: 'bone', g: g, m: mat(0, h / 2 + 0.16, 0) });
    /* 裂纹 */
    var seam = new T.BoxGeometry(1, 1, 1);
    parts.push({ key: 'ink', g: seam, m: mat(-w * 0.1, h / 2 + 0.16, TOPZ - 0.004, 0, 0, 0.5, 0.010, h * 0.55, 0.016) });
    /* 土台 + 两块碎石压角 */
    parts.push({ key: 'stoneDk', g: new T.CylinderGeometry(0.52, 0.66, 0.34, 12), m: mat(0, 0.17, 0) });
    parts.push({ key: 'stone', g: new T.ConeGeometry(0.16, 0.24, 6), m: mat(0.34, 0.12, 0.22, 0.2, 0.6, 0) });
    parts.push({ key: 'stone', g: new T.ConeGeometry(0.13, 0.20, 6), m: mat(-0.32, 0.10, 0.18, -0.1, 1.2, 0.3) });
    return { parts: parts, mount: { y: h / 2 + 0.16, z: TOPZ - 0.004, size: Math.min(w, h) * 0.50 },
      /* 骨片不像石碑那么规规矩矩：斜着插在土台上，连座带碑一起歪一点 */
      tilt: { rx: -0.11, ry: 0.10, rz: 0.07 },
      collider: { hx: 0.7, hz: 0.7, h: 0.4 } };
  }

  /* —— 牛肩胛骨：扇形铲形骨，架在木架上晾着的样子 —— */
  function carrierScapula(size, seed) {
    var parts = [], R = rnd(seed);
    var W = 0.78 * size * 1.9, H = 1.10 * size * 1.9;
    var s = new T.Shape();
    /* 下窄上宽的扇形：柄在下、扇面在上，中间两处收腰 */
    s.moveTo(-0.11 * W, -0.5 * H);
    s.lineTo(0.11 * W, -0.5 * H);
    s.lineTo(0.19 * W, -0.16 * H);
    s.lineTo(0.30 * W, 0.02 * H);
    s.quadraticCurveTo(0.52 * W, 0.14 * H, 0.46 * W, 0.34 * H);
    s.quadraticCurveTo(0.30 * W, 0.54 * H, 0.10 * W, 0.5 * H);
    s.lineTo(-0.10 * W, 0.5 * H);
    s.quadraticCurveTo(-0.30 * W, 0.54 * H, -0.46 * W, 0.34 * H);
    s.quadraticCurveTo(-0.52 * W, 0.14 * H, -0.30 * W, 0.02 * H);
    s.lineTo(-0.19 * W, -0.16 * H);
    s.closePath();
    var g = new T.ExtrudeGeometry(s, { depth: 0.045, bevelEnabled: true,
      bevelThickness: 0.014, bevelSize: 0.016, bevelSegments: 1, steps: 1, curveSegments: 3 });
    parts.push({ key: 'boneIn', g: g, m: mat(0, H * 0.5 + 0.30, 0, 0, 0, 0.05) });
    /* 骨脊：肩胛冈，一条从前向后隆起的棱 */
    var seam = new T.BoxGeometry(1, 1, 1);
    parts.push({ key: 'boneDk', g: seam, m: mat(0, H * 0.5 + 0.30, -0.035, 0, 0, 0, 0.05, H * 0.42, 0.045) });
    /* 木架：两根斜柱 + 横梁 */
    parts.push({ key: 'wood', g: new T.CylinderGeometry(0.055, 0.07, 1.7, 6), m: mat(-0.42, 0.82, -0.20, 0, 0, 0.24) });
    parts.push({ key: 'wood', g: new T.CylinderGeometry(0.055, 0.07, 1.7, 6), m: mat(0.42, 0.82, -0.20, 0, 0, -0.24) });
    parts.push({ key: 'wood', g: new T.BoxGeometry(1.0, 0.09, 0.09), m: mat(0, 1.42, -0.24) });
    return { parts: parts, mount: { y: H * 0.56 + 0.30, z: 0.045 + 0.014, size: Math.min(W, H) * 0.52 },
      tilt: { rx: -0.10, ry: 0, rz: 0.05 },
      collider: { hx: 0.62, hz: 0.42, h: 1.6 } };
  }

  /* —— 石刻：整块立石，正面锉平磨光，字刻在这块平面上 ——
       原来做成"三块随机旋转的不规则多边形堆叠"，正面根本找不到一个平的面，
       字放上去一半埋在石头里一半悬空。改成分层方料 + 一块打磨过的正面板：
       侧面看还是有自然石料的参差，正面却是平的完整铭石。 */
  function carrierStele(size, seed) {
    var parts = [], R = rnd(seed);
    var H = 1.85 * size * 1.9, W = 0.72 * size * 1.9, D = 0.44 * size * 1.9;
    var layers = [[1.00, 0.40], [0.94, 0.26], [0.86, 0.22], [0.72, 0.12]];
    var y = 0, k;
    for (k = 0; k < layers.length; k++) {
      var f = layers[k][0], hh = H * layers[k][1];
      parts.push({ key: k % 2 ? 'stoneDk' : 'stone',
        g: new T.BoxGeometry(W * f, hh, D * f),
        m: mat(0, y + hh / 2, 0, (R() - 0.5) * 0.05, (R() - 0.5) * 0.09, (R() - 0.5) * 0.05) });
      y += hh;
    }
    /* 正面打磨板：压在参差的石料前面，把"面"做实 */
    var fw = W * 0.78, fh = H * 0.60;
    var fz = D / 2 + 0.02;
    parts.push({ key: 'stone', g: new T.BoxGeometry(fw, fh, 0.06),
      m: mat(0, H * 0.50, fz) });
    /* 边缘倒一点碎腬：几块小石贴在下缘，破掉箱体的规整 */
    for (k = 0; k < 4; k++) {
      parts.push({ key: 'stoneDk', g: new T.ConeGeometry(0.10 + R() * 0.10, 0.18, 5),
        m: mat((R() - 0.5) * W * 1.4, 0.09, D * 0.5 + R() * 0.2, 0.2, R() * 6, 0.2) });
    }
    /* 脚下碎石 */
    for (k = 0; k < 5; k++) {
      var a = R() * 6.28;
      parts.push({ key: 'stoneDk', g: new T.ConeGeometry(0.13 + R() * 0.11, 0.22, 5),
        m: mat(Math.cos(a) * W * 0.62, 0.10, Math.sin(a) * D * 0.8, 0.1, a, 0.1) });
    }
    return { parts: parts, mount: { y: H * 0.50, z: fz + 0.030, size: Math.min(fw, fh) * 0.80 },
      collider: { hx: W * 0.55, hz: D * 0.55, h: H } };
  }

  /* —— 陶片 / 青铜牌 ——
       陶片不能再用球缺：弧面没法让平面字贴服。改成"带断口的厚陶片"——
       正面是平的，外轮廓不规则、边缘有倒角，看着就是打碎的陶壁那一块。 */
  function carrierPot(size, seed, variant) {
    var parts = [], R = rnd(seed);
    if (variant % 2 === 0) {
      var w = 0.86 * size * 1.9, h = 0.84 * size * 1.9;
      var s = blobShape(w / 2, h / 2, 9, 0.22, R);
      var Dd = 0.075, BT = 0.022, TOPZ = Dd + BT;
      parts.push({ key: 'ceramic', g: new T.ExtrudeGeometry(s, { depth: Dd, bevelEnabled: true,
        bevelThickness: BT, bevelSize: 0.030, bevelSegments: 1, steps: 1 }),
        m: mat(0, h / 2 + 0.20, 0) });
      /* 背面粗糙的一层 */
      parts.push({ key: 'ceramicIn', g: new T.ExtrudeGeometry(blobShape(w / 2 * 0.94, h / 2 * 0.94, 8, 0.26, R),
        { depth: 0.03, bevelEnabled: false, steps: 1 }), m: mat(0, h / 2 + 0.20, -0.035) });
      /* 泥砖台 */
      parts.push({ key: 'stoneDk', g: new T.BoxGeometry(0.98, 0.26, 0.74), m: mat(0, 0.13, 0) });
      parts.push({ key: 'stoneDk', g: new T.BoxGeometry(0.34, 0.18, 0.34), m: mat(0, 0.35, -0.20, 0.1, 0.4, 0) });
      parts.push({ key: 'stone', g: new T.ConeGeometry(0.15, 0.22, 6), m: mat(0.40, 0.11, 0.24, 0.1, 0.7, 0) });
      return { parts: parts, mount: { y: h / 2 + 0.20, z: TOPZ + 0.002, size: Math.min(w, h) * 0.62 },
        tilt: { rx: -0.05, ry: 0.06, rz: 0.04 },
        collider: { hx: 0.6, hz: 0.5, h: 0.4 } };
    }
    /* 青铜牌：木架悬一块铜牌，牌四角有乳钉 */
    var w2 = 0.86 * size * 1.9, h2 = 0.78 * size * 1.9;
    parts.push({ key: 'bronze', g: new T.BoxGeometry(w2, h2, 0.05), m: mat(0, 1.28, 0, -0.10, 0, 0.02) });
    var boss = new T.SphereGeometry(0.045, 8, 6);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (q) {
      parts.push({ key: 'bronzeDk', g: boss,
        m: mat(q[0] * (w2 / 2 - 0.09), 1.28 + q[1] * (h2 / 2 - 0.09), 0.035, -0.10, 0, 0.02) });
    });
    parts.push({ key: 'wood', g: new T.CylinderGeometry(0.06, 0.075, 1.7, 6), m: mat(-0.66, 0.85, 0) });
    parts.push({ key: 'wood', g: new T.CylinderGeometry(0.06, 0.075, 1.7, 6), m: mat(0.66, 0.85, 0) });
    parts.push({ key: 'wood', g: new T.BoxGeometry(1.50, 0.10, 0.10), m: mat(0, 1.70, 0) });
    parts.push({ key: 'wood', g: new T.BoxGeometry(0.05, 0.34, 0.05), m: mat(-0.22, 1.53, 0) });
    parts.push({ key: 'wood', g: new T.BoxGeometry(0.05, 0.34, 0.05), m: mat(0.22, 1.53, 0) });
    return { parts: parts, mount: { y: 1.28, z: 0.028, size: Math.min(w2, h2) * 0.70 },
      tilt: { rx: -0.10, ry: 0, rz: 0.02 },
      collider: { hx: 0.74, hz: 0.3, h: 1.8 } };
  }

  /* —— 构字装置：青铜环 + 分散悬空的实体构件 —— */
  function carrierAssembly(size, seed) {
    var parts = [], R = rnd(seed);
    var rr = 0.52 * size * 1.9;
    parts.push({ key: 'stoneDk', g: new T.CylinderGeometry(rr * 1.5, rr * 1.7, 0.36, 14), m: mat(0, 0.18, 0) });
    parts.push({ key: 'bronze', g: new T.TorusGeometry(rr, 0.055, 8, 30), m: mat(0, 0.44, 0, Math.PI / 2, 0, 0) });
    parts.push({ key: 'bronzeDk', g: new T.TorusGeometry(rr * 0.72, 0.035, 6, 26), m: mat(0, 0.44, 0, Math.PI / 2, 0, 0) });
    for (var k = 0; k < 3; k++) {
      var a = k / 3 * 6.283 + 0.4;
      parts.push({ key: 'stone', g: new T.BoxGeometry(0.16, 0.5, 0.16),
        m: mat(Math.cos(a) * rr * 1.3, 0.5, Math.sin(a) * rr * 1.3, 0, a, 0.06) });
    }
    return { parts: parts, mount: { y: 0.44 + rr * 0.86, z: 0, size: rr * 1.28 },
      collider: { hx: rr * 1.6, hz: rr * 1.6, h: 0.5 } };
  }

  var CARRIERS = {
    plastron: carrierPlastron,
    bone: carrierBone,
    scapula: carrierScapula,
    stele: carrierStele,
    pot: carrierPot,
    assembly: carrierAssembly
  };

  /* ================= 5. 组装 ================= */

  function buildItem(opt) {
    TH();
    var o = opt || {};
    var ch = o.char;
    var style = o.style || 'stele';
    var size = o.size || 0.5;
    var seed = o.seed == null ? 12345 : o.seed;
    var polys = polysOf(ch);
    var carrierFn = CARRIERS[style] || carrierStele;
    var car = carrierFn(size, seed, seed % 7);

    var group = new T.Group();
    group.name = 'glyphitem-' + ch;
    /* 载体可以整体带一点倾角（骨片斜插、肩胛骨后仰）。
       倾角必须套在"字 + 载体"共同的外层上，否则字会浮在斜面板外面。 */
    var host = group;
    if (car.tilt) {
      host = new T.Group();
      host.rotation.set(car.tilt.rx || 0, car.tilt.ry || 0, car.tilt.rz || 0);
      group.add(host);
    }

    /* 载体：按材质合并，一件物品只留 2~3 个 draw call */
    var byMat = {};
    car.parts.forEach(function (p) { (byMat[p.key] || (byMat[p.key] = [])).push(p); });
    var MM = M();
    var meshes = [];
    Object.keys(byMat).forEach(function (k) {
      var geo = mergeGeos(byMat[k].map(function (p) { return { g: p.g, m: p.m }; }));
      if (!geo) { return; }
      var mesh = new T.Mesh(geo, MM[k] || MM.stone);
      mesh.castShadow = true; mesh.receiveShadow = true;
      host.add(mesh); meshes.push(mesh);
    });

    /* 字：实体笔画挤出 */
    var st = strokesOf(ch);
    var glyphGeo = null, glyphMat = null, strokeMeshes = [], pieces = [];
    if (polys && polys.length) {
      var gs = [];
      polys.forEach(function (poly) {
        /* 归一化单位下挤一次，最后统一乘 size。
           原来 depth 里乘了 size 又在外面 scale(size) —— 双重缩放，
           实际笔画深度只有 0.014 米，难怪侧着看像贴的。 */
        gs.push({ g: new T.ExtrudeGeometry(shapeOfPoly(poly), {
          depth: 0.075, bevelEnabled: true,
          bevelThickness: 0.020,
          bevelSize: Math.min(st.hw * 0.45, 0.018),
          bevelSegments: 1, steps: 1
        }) });
      });
      glyphGeo = mergeGeos(gs);
      if (glyphGeo) {
        glyphGeo.scale(size, size, size);
        glyphMat = new T.MeshStandardMaterial({
          color: style === 'bronze' || style === 'pot' ? 0xe0d3a8 : 0x3a2d1c,
          roughness: 0.62, metalness: 0.08,
          emissive: new T.Color(0xffbe72), emissiveIntensity: 0.0
        });
        var gm = new T.Mesh(glyphGeo, glyphMat);
        gm.position.set(0, car.mount.y, car.mount.z);
        gm.castShadow = true;
        gm.name = 'glyphstrokes';
        host.add(gm);
        strokeMeshes.push(gm);
        /* 碑背再刻一遍：字碑是绕区心排成一圈的，"面朝区心"意味着玩家从外圈
           走近时看到的大多是背面 —— 截图里就是两块光板。与其猜玩家从哪边来，
           不如两面都刻（真实的碑也常两面刻字），走近总有一面是正的。 */
        if (car.mount.z > 0.02 && style !== 'assembly') {
          var gmB = new T.Mesh(glyphGeo, glyphMat);
          gmB.position.set(0, car.mount.y, -car.mount.z);
          gmB.rotation.y = Math.PI;
          gmB.castShadow = true;
          gmB.name = 'glyphstrokes-back';
          host.add(gmB);
          strokeMeshes.push(gmB);
        }
      }
      /* 构字装置：按"构件"分块 —— 一个构件一个 mesh，
         能单独 hover、能单独被点回原位。分组依据是真字形笔画的空间聚类，
         不是随便剁成几块。 */
      if (style === 'assembly') {
        var groups = clusterPieces(ch, o.clusters || 2);
        groups.forEach(function (grp, gi) {
          var gs2 = [];
          grp.forEach(function (pi) {
            gs2.push({ g: new T.ExtrudeGeometry(shapeOfPoly(polys[pi]), {
              depth: 0.085, bevelEnabled: true,
              bevelThickness: 0.022,
              bevelSize: Math.min(st.hw * 0.45, 0.020), bevelSegments: 1, steps: 1
            }) });
          });
          var gg = mergeGeos(gs2);
          if (!gg) { return; }
          gg.scale(size, size, size);
          var pm = new T.Mesh(gg, new T.MeshStandardMaterial({
            color: 0xd9c49a, roughness: 0.55, metalness: 0.12,
            emissive: new T.Color(0xffbe72), emissiveIntensity: 0.05
          }));
          /* 归位点在字的原位；散开点绕着环外一圈摆 */
          var cx = 0, cy = 0, n = 0;
          grp.forEach(function (pi) { var c = centroid(polys[pi]); cx += c[0]; cy += c[1]; n++; });
          pm.userData.home = new T.Vector3(0, car.mount.y, car.mount.z);
          var ang = gi / groups.length * Math.PI * 2 - Math.PI / 2;
          pm.userData.out = new T.Vector3(Math.cos(ang) * size * 1.5,
            car.mount.y + Math.sin(ang) * size * 1.1 + 0.34, car.mount.z + size * 0.5);
          pm.userData.away = true;
          pm.position.copy(pm.userData.out);
          pm.castShadow = true;
          pm.name = 'piece-' + gi;
          pm.userData.piece = gi;
          host.add(pm);
          pieces.push(pm);
        });
        if (strokeMeshes[0]) { host.remove(strokeMeshes[0]); strokeMeshes = []; }
      }
    }

    var allIn = false;
    var api = {
      char: ch, style: style, zone: o.zone || '',
      marker: !!o.marker,
      solved: function () { return pieces.length ? allIn : true; },
      group: group,
      carrierMeshes: meshes,
      strokeMeshes: strokeMeshes,
      pieces: pieces,
      mountY: car.mount.y,
      collider: car.collider,
      setState: function (s) {
        if (glyphMat) {
          glyphMat.emissiveIntensity = s.learned ? 0.55 : (s.hover ? 0.30 : 0.0);
          glyphMat.color.setHex(s.learned ? 0x6b3f18 : (style === 'stele' ? 0x3a2d1c : 0x2f2618));
        }
        pieces.forEach(function (p) {
          p.material.emissiveIntensity = s.learned ? 0.5 : (s.hover ? 0.28 : 0.05);
        });
        if (glyphMat && pieces.length) {
          /* 把所有构件拢在一起之后，整字才"读得出来" */
          var done = 0;
          pieces.forEach(function (p) { if (!p.userData.away) { done++; } });
          allIn = (done === pieces.length);
        }
      },
      /* 点一个构件：t=1 归位，t=0 散开。真正的位移由 world3d 每帧插值去做，
         所以运动是"在空间里真切地飞过去"，不是播一段 GIF。 */
      setPieceHome: function (i, home) {
        var p = pieces[i]; if (!p) { return; }
        p.userData.to = home ? p.userData.home : p.userData.out;
        p.userData.targetAway = !home;
      },
      pieceCount: function () { return pieces.length; },
      /* 次序不对：把这个构件往上顶一下再落回去 —— 用空间运动答复"不对" */
      shakePiece: function (i) {
        var p = pieces[i];
        if (!p) { return; }
        var out = p.userData.out;
        p.userData.to = new T.Vector3(out.x * 1.06, out.y + 0.22, out.z + 0.12);
        p.userData.targetAway = true;
        setTimeout(function () { p.userData.to = out; }, 260);
      },
      updatePieces: function (dt, snap) {
        var again = false;
        pieces.forEach(function (p) {
          var to = p.userData.to;
          if (!to) { return; }
          var d = to.clone().sub(p.position);
          if (d.length() < 0.004) { p.position.copy(to); p.userData.to = null; return; }
          p.position.addScaledVector(d, Math.min(1, dt * (snap ? 22 : 6.2)));
          again = true;
        });
        var done = 0;
        pieces.forEach(function (p) { if (!p.userData.targetAway) { done++; } });
        allIn = pieces.length ? (done === pieces.length) : false;
        return again;
      }
    };

    /* 所有可拾取的子网格共用一份标记：由 world3d 收集并射线检测 */
    var tag = { kind: 'char', char: ch, zone: o.zone || '', style: style, item: api };
    group.traverse(function (obj) {
      if (obj.isMesh) { obj.userData.kind = 'char'; obj.userData.char = ch;
        obj.userData.zone = o.zone || ''; obj.userData.style = style; obj.userData.item = api; }
    });
    return api;
  }

  /* ================= 6. 构件分组 =================
     一个字的笔画按空间位置聚成 k 组 —— 这就是"拆字"的依据。
     数据本身就是这么来的：glyph-parts.json 里每个构件一笔一笔记录，
     把它们在字里的位置一聚，得到的正是这个字由哪几个部件组成。
     例如「林」的 10 笔会自然分成左右两棵树。 */
  function clusterPieces(ch, k) {
    var polys = polysOf(ch);
    if (!polys) { return []; }
    k = Math.max(1, Math.min(k || 2, polys.length));
    var cs = polys.map(function (p) { return centroid(p); });
    var vx = 0, vy = 0, mx = 0, my = 0, i;
    for (i = 0; i < cs.length; i++) { mx += cs[i][0]; my += cs[i][1]; }
    mx /= cs.length; my /= cs.length;
    for (i = 0; i < cs.length; i++) {
      vx += (cs[i][0] - mx) * (cs[i][0] - mx);
      vy += (cs[i][1] - my) * (cs[i][1] - my);
    }
    var useX = vx >= vy;
    var order = cs.map(function (c, idx) { return { v: useX ? c[0] : c[1], i: idx }; })
      .sort(function (a, b) { return a.v - b.v; });
    /* 按需要分几组，就切成几段 —— 组内笔画数尽量均衡 */
    var groups = [], per = Math.ceil(order.length / k);
    for (i = 0; i < order.length; i += per) {
      var grp = [];
      for (var j = i; j < Math.min(order.length, i + per); j++) { grp.push(order[j].i); }
      groups.push(grp);
    }
    /* 组本身还要按"书写先后"排：靠上、靠左的部件先到位 */
    groups.sort(function (a, b) {
      var ca = 0, cb = 0;
      a.forEach(function (i2) { ca += cs[i2][useX ? 0 : 1]; });
      b.forEach(function (i2) { cb += cs[i2][useX ? 0 : 1]; });
      return ca / a.length - cb / b.length;
    });
    return groups;
  }

  /* 只要字、不要载体 —— 门阙上的封锁牌、柱子上的标记这类小件用它。
     同样是实体挤出，不是贴图。 */
  function glyphMesh(ch, size, opt) {
    TH();
    var o = opt || {};
    var polys = polysOf(ch);
    var st = strokesOf(ch);
    if (!polys || !st) { return null; }
    var gs = [];
    polys.forEach(function (poly) {
      gs.push({ g: new T.ExtrudeGeometry(shapeOfPoly(poly), {
        depth: 0.085, bevelEnabled: true,
        bevelThickness: 0.020,
        bevelSize: Math.min(st.hw * 0.45, 0.016), bevelSegments: 1, steps: 1
      }) });
    });
    var geo = mergeGeos(gs);
    if (!geo) { return null; }
    geo.scale(size, size, size);
    return new T.Mesh(geo, new T.MeshStandardMaterial({
      color: o.color || 0x2f2618, roughness: 0.62, metalness: 0.08,
      emissive: new T.Color(o.emissive || 0xffbe72), emissiveIntensity: o.glow || 0
    }));
  }

  App.worldGlyph = {
    buildItem: buildItem,
    strokesOf: strokesOf,
    polysOf: polysOf,
    styles: Object.keys(CARRIERS),
    hasGlyph: function (ch) { return !!strokesOf(ch); },
    clusterPieces: clusterPieces,
    glyphMesh: glyphMesh
  };
})(window.App);
