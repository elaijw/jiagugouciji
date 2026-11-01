/* ============================================================
   甲骨拓片字形（rubbings）
   ------------------------------------------------------------
   数据在 js/core/_rubbings.js（window.App.glyphRubbings），
   由 tools/import_rubbings.py 从 zhouyongh/hanzi-glyphs-svg 导入：
   甲骨层 13,956 件里的 593 件，对应站内 73 个字，每字 1~3 种写法。

   和 glyph-parts.json 的分工：
     glyph-parts  参数化骨架：一条条 M/L 折线 + 均匀笔宽。
                  是 JGW 数据集为了"可计算"（拆字、分段、聚类）而做的抽象，
                  同一个字每一笔都等宽，看着像图形设计。
     rubbings     拓片摹本：从原拓自动描摹出来的闭合轮廓，笔画有粗细、
                  有崩口、有刀锋 —— 同一个字在不同甲骨上写法还不一样。

   所以：要"算"的地方（拆字玩法、构件聚类）继续用 glyph-parts；
   要"看"的地方（骨面刻辞、展签、门楣、字墙、中央展台）改用 rubbings。

   一个拓片 SVG 是 400×400 画布，但字在里头占的比例每个都不同
   （有的顶满，有的只占中间一小块）。所以这里按实际包围盒归一化，
   不按 viewBox —— 否则一排字会大小参差。
   ============================================================ */
(function (App) {
  'use strict';

  var VB = 400;
  var boxCache = {};      /* "日#0" -> {x,y,w,h} */
  var pathCache = {};     /* "日#0" -> Path2D */

  function data() { return App.glyphRubbings || null; }

  function forms(ch) {
    var d = data();
    if (!d || !d.chars) { return null; }
    var f = d.chars[ch];
    return (f && f.length) ? f : null;
  }

  /* 包围盒必须实测，不能从 d 里抠数字。
     拓片 path 用的是相对指令（m / c / l 小写），数字是"相对上一点走多少"，
     既不是绝对位置、也和指令符混在一条串里，两两配对取 min/max 会得到
     一堆假坐标 —— 后果是「日」顶满格子、「人」缩成一条线、「虎」小得看不见。
     实测一次很便宜（256² 一次约 3ms），而且只在该字第一次被用到时算。 */
  function measure(ch, i) {
    var p = pathOf(ch, i);
    if (!p) { return null; }
    var S = 256, k = S / VB;
    var cv = document.createElement('canvas');
    cv.width = cv.height = S;
    var c = cv.getContext('2d');
    c.scale(k, k);
    c.fillStyle = '#000';
    c.fill(p);
    var img = c.getImageData(0, 0, S, S).data;
    var minx = S, miny = S, maxx = -1, maxy = -1;
    for (var y = 0; y < S; y++) {
      for (var x = 0; x < S; x++) {
        if (img[(y * S + x) * 4 + 3] < 40) { continue; }
        if (x < minx) { minx = x; } if (x > maxx) { maxx = x; }
        if (y < miny) { miny = y; } if (y > maxy) { maxy = y; }
      }
    }
    if (maxx < 0) { return null; }
    /* 像素 → viewBox 坐标；宽高各留 1px 余量，避免贴边被裁 */
    return {
      x: (minx - 0.5) / k, y: (miny - 0.5) / k,
      w: (maxx - minx + 1.5) / k, h: (maxy - miny + 1.5) / k
    };
  }

  function box(ch, i) {
    var key = ch + '#' + (i || 0);
    if (boxCache[key] !== undefined) { return boxCache[key]; }
    var b = measure(ch, i);
    boxCache[key] = b;
    return b;
  }

  function pathOf(ch, i) {
    var key = ch + '#' + (i || 0);
    if (pathCache[key]) { return pathCache[key]; }
    var fs = forms(ch);
    if (!fs) { return null; }
    var f = fs[(i || 0) % fs.length];
    try { pathCache[key] = new Path2D(f.d); } catch (e) { return null; }
    return pathCache[key];
  }

  /* 把字画到 ctx 上：以 (x,y) 为中心，长边撑满 size。
     o: { x, y, size, color, index, alpha, weight(描边加粗), flipped } */
  function paint(ctx, ch, o) {
    var p = pathOf(ch, o && o.index);
    var b = box(ch, o && o.index);
    if (!p || !b) { return false; }
    var size = (o && o.size) || 100;
    var k = size / Math.max(b.w, b.h);
    var ox = (o && o.x) || 0, oy = (o && o.y) || 0;
    /* 包围盒中心对到 (x,y)；SVG 的 y 朝下，与 canvas 一致，不用翻 */
    var cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    ctx.save();
    ctx.translate(ox, oy);
    if (o && o.flipped) { ctx.scale(-1, 1); }
    ctx.scale(k, k);
    ctx.translate(-cx, -cy);
    ctx.fillStyle = (o && o.color) || '#241d14';
    if (o && o.alpha != null) { ctx.globalAlpha = o.alpha; }
    if (o && o.weight) {
      /* 要"更厚重"的时候给一笔描边：拓片轮廓本身有崩口，
         加描边比直接放大更能保住刀口。 */
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = o.weight / k;
      ctx.lineJoin = 'round';
      ctx.stroke(p);
    }
    ctx.fill(p);
    ctx.restore();
    return true;
  }

  /* 只取一条笔画的轮廓路径，给 three 挤出用（见 museum3d 的中央展台）。
     three 的 Shape 不支持曲线指令，所以这里把 path 采样成一圈点。 */
  function points(ch, i, n) {
    var b = box(ch, i);
    var p = pathOf(ch, i);
    if (!b || !p || !App.stage3d || !App.stage3d.canvas) { return null; }
    /* 用一个离屏 canvas 扫描轮廓：拓片是形状不是线条，
       沿包围盒外框走一圈取边界不现实，直接按像素取边缘点。 */
    var S = n || 220;
    var cv = App.stage3d.canvas(S, S);
    var c = cv.getContext('2d');
    var k = (S - 2) / Math.max(b.w, b.h);
    c.translate(S / 2, S / 2);
    c.scale(k, k);
    c.translate(-(b.x + b.w / 2), -(b.y + b.h / 2));
    c.fillStyle = '#000';
    c.fill(p);
    var img = c.getImageData(0, 0, S, S).data;
    var pts = [];
    for (var y = 0; y < S; y++) {
      for (var x = 0; x < S; x++) {
        var a = img[(y * S + x) * 4 + 3];
        if (a < 128) { continue; }
        var left = x === 0 || img[(y * S + x - 1) * 4 + 3] < 128;
        var right = x === S - 1 || img[(y * S + x + 1) * 4 + 3] < 128;
        var up = y === 0 || img[((y - 1) * S + x) * 4 + 3] < 128;
        var dn = y === S - 1 || img[((y + 1) * S + x) * 4 + 3] < 128;
        if (left || right || up || dn) {
          pts.push([(x / (S - 1) - 0.5) * 2, -(y / (S - 1) - 0.5) * 2]);
        }
      }
    }
    return pts.length ? pts : null;
  }

  App.rubbings = {
    ready: function () { return !!(data() && data().chars); },
    has: function (ch) { return !!forms(ch); },
    forms: forms,
    count: function (ch) { var f = forms(ch); return f ? f.length : 0; },
    /* 出处：如「日乙3400 合1285 賓組」，没有则空串 */
    src: function (ch, i) {
      var f = forms(ch);
      if (!f) { return ''; }
      return f[(i || 0) % f.length].src || '';
    },
    chars: function () {
      var d = data();
      return (d && d.chars) ? Object.keys(d.chars) : [];
    },
    box: box,
    pathOf: pathOf,
    paint: paint,
    points: points
  };
})(window.App);
