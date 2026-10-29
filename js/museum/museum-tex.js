/* ============================================================
   甲骨奇谭 · 3D 博物馆 / 纹理层
   ------------------------------------------------------------
   这里只做一件事：把**项目里已有的真实数据**画成 3D 用得上的贴图。

   贴图上的一切都不新编：
     骨面     程序生成的骨色底 + 骨纹 + 褐斑（只是材质，不冒充文物）
     刻痕     直接取 App.glyphs.parts[字] 的真实甲骨字形笔画（CC BY 4.0）
     碑文     展区名 / 说明，用 canvas 排中文（宋体一系）

   为什么用 canvas 而不是图片文件：
     · 项目是「零依赖、可双击打开」的静态站，不能依赖外部贴图；
     · 字形要按字现画，73 个字形全导出成 PNG 会让仓库变大几十倍；
     · 文字牌要跟着文案走，画一次 1024px 足够 4K 屏看清。

   约定：所有函数同步返回 canvas。
   字形用 Path2D 直接描边，不走 <img src="data:image/svg+xml">——
   后者是异步的，会让「展品建好了但贴图还没到」这种半成品状态出现在首帧。
   ============================================================ */
(function (App) {
  'use strict';

  /* ---------- 小工具 ---------- */

  /* 确定性随机：同一个字每次布展得到同一块骨面，不会每次刷新都变样 */
  function rng(seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >> 17;
      s ^= s << 5;  s >>>= 0;
      return s / 4294967296;
    };
  }

  function hashStr(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return h >>> 0;
  }

  function canvas(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  /* glyph-parts.json 里只有 "translate(x,y) scale(s)" 这一种写法，
     解析它比引一个 SVG 解析器便宜得多。 */
  function parseTransform(t) {
    var out = { tx: 0, ty: 0, s: 1 };
    if (!t) { return out; }
    var m = /translate\(\s*(-?[\d.]+)[ ,]+(-?[\d.]+)\s*\)/.exec(t);
    if (m) { out.tx = parseFloat(m[1]); out.ty = parseFloat(m[2]); }
    var n = /scale\(\s*(-?[\d.]+)/.exec(t);
    if (n) { out.s = parseFloat(n[1]); }
    return out;
  }

  function glyphRec(ch) {
    return (App.glyphs && App.glyphs.parts) ? App.glyphs.parts[ch] : null;
  }

  /* ---------- 画一个真甲骨字形 ----------
     ctx 已按 100×100 的画布坐标系铺好（调用方负责把 viewBox 换成像素）。
     o: { color, weight, shadow:{color,blur,ox,oy} } */
  function strokeGlyph(ctx, ch, o) {
    var g = glyphRec(ch);
    if (!g || !g.pieces || !g.pieces.length) { return false; }
    var m = parseTransform(g.transform);
    var opt = o || {};
    ctx.save();
    ctx.translate(m.tx, m.ty);
    ctx.scale(m.s, m.s);
    ctx.lineWidth = (g.strokeWidth || 0.16) * (opt.weight || 1);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = opt.color || '#241d14';
    if (opt.shadow) {
      ctx.shadowColor = opt.shadow.color;
      ctx.shadowBlur = opt.shadow.blur;
      ctx.shadowOffsetX = opt.shadow.ox || 0;
      ctx.shadowOffsetY = opt.shadow.oy || 0;
    }
    for (var i = 0; i < g.pieces.length; i++) {
      var d = g.pieces[i].d;
      if (!d) { continue; }
      try { ctx.stroke(new Path2D(d)); } catch (e) { /* 老浏览器没有 Path2D */ }
    }
    ctx.restore();
    return true;
  }

  /* 把字形画进一张 size×size 的画布（居中，100 画布铺满） */
  function paintGlyph(cv, ch, o) {
    var ctx = cv.getContext('2d');
    var S = cv.width / 100;
    ctx.save();
    ctx.scale(S, S);
    var ok = strokeGlyph(ctx, ch, o);
    ctx.restore();
    return ok;
  }

  /* ---------- 骨面底 ----------
     不是"米色纸"，是一件物件：底色不匀、有纵向骨纹、有褐斑、有边角发暗。
     opt.cracks 打开后加几道发丝裂 —— 只有主展品才开，不然 12 块骨版都裂一遍
     就不像真东西了。 */
  function paintBone(ctx, w, h, seed, opt) {
    var R = rng(seed);
    var g = ctx.createLinearGradient(0, 0, w * 0.3, h);
    g.addColorStop(0, '#e3d6ba');
    g.addColorStop(0.45, '#dccdb0');
    g.addColorStop(1, '#cdbc9c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    /* 大块色斑：骨面深浅不匀的来源 */
    var mottles = 14;
    for (var i = 0; i < mottles; i++) {
      var x = R() * w, y = R() * h, r = (0.10 + R() * 0.34) * w;
      var rg = ctx.createRadialGradient(x, y, 0, x, y, r);
      var dark = R() > 0.45;
      rg.addColorStop(0, dark ? 'rgba(138,114,78,.34)' : 'rgba(255,249,232,.34)');
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }

    /* 纵向骨纹：真骨的纹理是长的，不是噪点 */
    ctx.save();
    ctx.lineCap = 'round';
    var veins = Math.round(w / 8);
    for (var v = 0; v < veins; v++) {
      var vx = R() * w;
      var amp = (1 + R() * 5);
      var alpha = 0.05 + R() * 0.085;
      ctx.beginPath();
      ctx.moveTo(vx, -10);
      var steps = 8;
      for (var s = 1; s <= steps; s++) {
        var yy = (h + 20) * (s / steps) - 10;
        var xx = vx + Math.sin(s * 1.7 + v) * amp;
        ctx.lineTo(xx, yy);
      }
      ctx.strokeStyle = 'rgba(140,116,78,' + alpha.toFixed(3) + ')';
      ctx.lineWidth = 0.6 + R() * 1.8;
      ctx.stroke();
    }
    ctx.restore();

    /* 细碎褐斑与虫蛀点 */
    var specks = Math.round(w * h / 900);
    for (var k = 0; k < specks; k++) {
      var sx = R() * w, sy = R() * h;
      var rr = 0.4 + R() * 2.2;
      ctx.beginPath();
      ctx.arc(sx, sy, rr, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(113,88,54,' + (0.07 + R() * 0.20).toFixed(3) + ')';
      ctx.fill();
    }

    /* 边角发暗：让平面的贴图在立体骨版上看着有厚度 */
    var vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.30,
      w / 2, h / 2, Math.max(w, h) * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(74,55,32,.40)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);

    if (opt && opt.cracks) { paintCracks(ctx, w, h, seed); }
  }

  /* ---------- 发丝裂 ----------
     真甲骨上的裂不是"闪电纹"，是从边缘起、顺着骨料走势一路细下去的一条，
     中途分叉、越走越细。每道先画一道浅色口沿（裂口两侧有翻起），
     再压一条暗线居中 —— 光看暗线是"画上去的线"，两条一起才像裂开。 */
  function paintCracks(ctx, w, h, seed, bumpMode) {
    var R = rng(seed ^ 0x5c1d);
    var S = Math.min(w, h);
    function walk(x, y, dir, len, wid, depth) {
      var px = x, py = y, a = dir;
      var steps = Math.max(6, Math.round(len / (S * 0.035)));
      ctx.beginPath();
      ctx.moveTo(px, py);
      for (var i = 0; i < steps; i++) {
        a += (R() - 0.5) * 0.34;
        px += Math.cos(a) * len / steps;
        py += Math.sin(a) * len / steps;
        ctx.lineTo(px, py);
      }
      if (!bumpMode) {
        /* 口沿（先画，稍粗、浅） */
        ctx.strokeStyle = 'rgba(255,248,231,.30)';
        ctx.lineWidth = wid * 2.1;
        ctx.stroke();
      }
      /* 裂芯（暗、细） */
      ctx.strokeStyle = bumpMode ? 'rgba(56,56,56,1)' : 'rgba(74,55,33,.44)';
      ctx.lineWidth = wid * (bumpMode ? 1.5 : 1);
      ctx.stroke();
      if (depth > 0 && R() > 0.32) {
        walk(px, py, a + (R() > 0.5 ? 0.7 : -0.7), len * 0.52, wid * 0.62, depth - 1);
      }
    }
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    /* 主裂：从上缘偏左往下走 */
    walk(w * (0.30 + R() * 0.16), h * 0.06, Math.PI * 0.52 + (R() - 0.5) * 0.5,
      h * (0.40 + R() * 0.16), S * 0.0022, 2);
    /* 次裂：从右缘横着进来，短一些 */
    walk(w * 0.985, h * (0.44 + R() * 0.16), Math.PI * 0.94 + (R() - 0.5) * 0.4,
      w * 0.24, S * 0.0017, 1);
    ctx.restore();
  }

  /* ---------- 刻一刀 ----------
     在 (cx,cy) 放一个 size 像素高的字（size = 100 单位方框的像素边长）。
     因为刀口粗细跟着 size 等比缩，小字的笔画自然就细 —— 真刻也是这样，
     小字下刀浅、字口窄，不会因为"缩小"而糊成一片。

     mode: 'map'  骨面刻痕（三遍：暗槽 / 字身 / 受光口沿）
           'bump' 高度图（只要一遍暗） */
  function carveAt(ctx, ch, cx, cy, size, mode, o) {
    var g = glyphRec(ch);
    if (!g || !g.pieces || !g.pieces.length) { return false; }
    var k = size / 100;
    var opt = o || {};
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(k, k);
    ctx.translate(-50, -50);
    if (opt.rot) {
      ctx.translate(50, 50);
      ctx.rotate(opt.rot);
      ctx.translate(-50, -50);
    }
    if (mode === 'bump') {
      strokeGlyph(ctx, ch, {
        color: 'rgba(0,0,0,.86)', weight: 3.0,
        shadow: { color: 'rgba(0,0,0,.5)', blur: 2, ox: 0, oy: 0 }
      });
    } else {
      /* ① 刻槽的暗部：带阴影的粗笔画，等于给凹槽打底 */
      strokeGlyph(ctx, ch, {
        color: 'rgba(44,33,20,.66)', weight: 3.5,
        shadow: { color: 'rgba(38,28,16,.62)', blur: 3.2, ox: 0.5, oy: 0.9 }
      });
      /* ② 刻痕本体 */
      strokeGlyph(ctx, ch, { color: 'rgba(30,23,14,.97)', weight: 2.7 });
      /* ③ 槽口受光的一道细边：光从左上来，所以口沿偏左上 */
      ctx.globalCompositeOperation = 'lighter';
      strokeGlyph(ctx, ch, { color: 'rgba(255,249,236,.30)', weight: 1.0 });
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
    return true;
  }

  /* ---------- 竖行排布 ----------
     甲骨上的成篇刻辞是竖行、右起、一行写完再换左边一行。
     这跟今天的横排是两个方向，所以直接照搬"文字居中放一块"是假的。

     cols: ['日月','山川',...]，每一项是一列（从右往左排）。
     每字带一点确定的旋转与错位：手刻的竖行从来不是印刷对齐的，
     但同一个字每次布展要落在同一个位置，所以抖动由字 + 行列算出，不用随机数。

     回传每字的 {ch,x,y,size,rot}，map 与 bump 共用同一份，保证刻痕与高度一致。 */
  function colLayout(cols, W, H) {
    var list = (cols || []).filter(function (s) { return s && String(s).length; });
    var n = list.length;
    if (!n) { return []; }

    var maxLen = 1;
    list.forEach(function (c) { if (String(c).length > maxLen) { maxLen = String(c).length; } });

    /* 字格取两个约束里小的那个：纵向要装下最长一列，横向要装下所有列 */
    var cell = Math.min((H * 0.76) / maxLen, (W * 0.80) / (n * 1.30));
    var gapCol = cell * 1.30;
    var totalW = gapCol * n;
    var xRight = W / 2 + totalW / 2 - gapCol / 2;
    var out = [];

    for (var i = 0; i < n; i++) {
      var cs = String(list[i]);
      var colH = cell * cs.length;
      var y0 = H * 0.5 - colH / 2 + cell / 2;
      for (var j = 0; j < cs.length; j++) {
        var ch = cs.charAt(j);
        var h = hashStr(ch + ':' + i + ':' + j);
        var jx = ((h % 100) / 100 - 0.5) * cell * 0.07;
        var jy = ((h >> 7 & 63) / 63 - 0.5) * cell * 0.05;
        var jr = ((h >> 13 & 63) / 63 - 0.5) * 0.055;
        var js = 0.94 + ((h >> 19 & 31) / 31) * 0.09;
        out.push({
          ch: ch, x: xRight - i * gapCol + jx, y: y0 + j * cell + jy,
          size: cell * 0.86 * js, rot: jr
        });
      }
    }
    return out;
  }

  /* ---------- 立体的字：展品贴图 ----------
     返回 { map, bump }：
       map   骨面 + 刻进去的字（暗刻 + 下缘一道受光的口沿）
       bump  灰度高度：骨面细纹为中性灰，字是凹下去的
     两处都用同一套真字形笔画，所以"刻的字"和"读的字"是同一个字，不会错位。

     opt.columns 有值时走"竖行成篇"（表谱刻辞的形制），ch 可以留空；
     没有 columns 时是单字展品。 */
  function slabTextures(ch, opt) {
    var o = opt || {};
    var W = o.w || 512;
    var H = o.h || 512;
    var seed = hashStr(ch || (o.columns || []).join('') || 'bone') || 7;

    var cv = canvas(W, H);
    var ctx = cv.getContext('2d');
    paintBone(ctx, W, H, seed, { cracks: !!o.cracks });

    /* 骨版是竖长的，贴图也得是竖长的。
       否则正方形的字画在 1:1.58 的骨版上会被拉长一倍半 —— 字就变形了。 */
    var marks = o.columns ? colLayout(o.columns, W, H) : [];
    var has = !!glyphRec(ch);
    /* 主字放大 1.18：字形数据四周留了白，不放大占不住这块骨。
       放的是同一套笔画，不是另一个字。 */
    var mainSize = Math.min(W, H) * 1.18;

    marks.forEach(function (m) {
      carveAt(ctx, m.ch, m.x, m.y, m.size, 'map', { rot: m.rot });
    });
    if (has) { carveAt(ctx, ch, W / 2, H / 2, mainSize, 'map'); }

    /* bump：中性灰 + 骨面纹理 + 字为暗（凹） */
    var bv = canvas(Math.max(64, W >> 1), Math.max(64, H >> 1));
    var bctx = bv.getContext('2d');
    bctx.fillStyle = '#8a8a8a';
    bctx.fillRect(0, 0, bv.width, bv.height);
    /* 骨面自身的起伏。
       密度和强度都得压住：这些点是"骨面的疏松"，看得见就行；一密一强，
       近看就变成一层橘皮 / 鸡皮疙瘩，反而假。 */
    var R = rng(seed ^ 0x9e37);
    for (var i = 0; i < bv.width * 0.5; i++) {
      var x = R() * bv.width, y = R() * bv.height;
      var rr = 1.5 + R() * 7.5;
      var gg = bctx.createRadialGradient(x, y, 0, x, y, rr);
      var up = R() > 0.5;
      gg.addColorStop(0, up ? 'rgba(255,255,255,.042)' : 'rgba(0,0,0,.042)');
      gg.addColorStop(1, 'rgba(0,0,0,0)');
      bctx.fillStyle = gg;
      bctx.fillRect(x - rr, y - rr, rr * 2, rr * 2);
    }
    /* 裂纹在高度图上也是凹的，否则侧面打光时看不到裂口 */
    if (o.cracks) { paintCracks(bctx, bv.width, bv.height, seed, true); }
    /* bump 用同一套坐标：重新按半分辨率排一次，与 map 逐字对位 */
    if (marks.length) {
      var bm = colLayout(o.columns, bv.width, bv.height);
      bm.forEach(function (m) {
        carveAt(bctx, m.ch, m.x, m.y, m.size, 'bump', { rot: m.rot });
      });
    }
    if (has) {
      carveAt(bctx, ch, bv.width / 2, bv.height / 2,
        Math.min(bv.width, bv.height) * 1.18, 'bump');
    }

    return { map: cv, bump: bv };
  }

  /* ---------- 文字牌 ----------
     竖排是中式展签的常态：一个字一列，从上往下读。
     opt: { w, h, vertical, size, color, bg, font, weight, tracking } */
  function textCanvas(text, opt) {
    var o = opt || {};
    var w = o.w || 512, h = o.h || 256;
    var cv = canvas(w, h);
    var ctx = cv.getContext('2d');
    if (o.bg) {
      ctx.fillStyle = o.bg;
      ctx.fillRect(0, 0, w, h);
    }
    var fam = o.font || '"Songti SC","Noto Serif SC","Source Han Serif SC",serif';
    var fs = o.size || Math.round(Math.min(w, h) * 0.42);
    ctx.font = (o.weight || '600') + ' ' + fs + 'px ' + fam;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = o.color || '#f0e6d2';

    var chars = String(text || '').split('');
    if (o.vertical) {
      var gap = fs * (o.tracking || 1.22);
      var total = gap * chars.length;
      var y0 = h / 2 - total / 2 + gap / 2;
      for (var i = 0; i < chars.length; i++) {
        ctx.fillText(chars[i], w / 2, y0 + i * gap);
      }
    } else {
      /* 横排：字距自己加，measureText 的 letterSpacing 兼容性还不够 */
      var tr = (o.tracking || 1.06);
      var widths = chars.map(function (c) { return ctx.measureText(c).width * tr; });
      var sum = widths.reduce(function (a, b) { return a + b; }, 0);
      var x = w / 2 - sum / 2;
      for (var j = 0; j < chars.length; j++) {
        ctx.fillText(chars[j], x + widths[j] / 2, h / 2);
        x += widths[j];
      }
    }
    return cv;
  }

  /* ---------- 环境贴图 ----------
     展厅里没有天空，但有"顶光 + 四壁反光"。
     用一张 equirect 渐变描述它，再交给 PMREM 变成预过滤环境，
     金属/抛光面的高光才有形状，不会是一片塑料死白。 */
  function envCanvas() {
    var w = 512, h = 256;
    var cv = canvas(w, h);
    var ctx = cv.getContext('2d');
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#3a2c1e');     /* 顶：暖褐 */
    g.addColorStop(0.34, '#221a12');
    g.addColorStop(0.52, '#171009');  /* 视平线：最暗 */
    g.addColorStop(0.78, '#0e0a06');
    g.addColorStop(1, '#090604');     /* 地面 */
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    /* 顶部光井：一长条暖白，构成骨面上的主高光 */
    var lg = ctx.createRadialGradient(w * 0.5, h * 0.06, 0, w * 0.5, h * 0.06, w * 0.30);
    lg.addColorStop(0, 'rgba(255,238,208,.95)');
    lg.addColorStop(0.35, 'rgba(255,226,186,.35)');
    lg.addColorStop(1, 'rgba(255,220,180,0)');
    ctx.fillStyle = lg;
    ctx.fillRect(0, 0, w, h * 0.55);

    /* 两侧壁灯：左右各一团，让抛光的柱面有竖高光 */
    [[0.08, 0.55], [0.92, 0.55], [0.30, 0.62], [0.70, 0.62]].forEach(function (p) {
      var rg = ctx.createRadialGradient(p[0] * w, p[1] * h, 0, p[0] * w, p[1] * h, w * 0.13);
      rg.addColorStop(0, 'rgba(255,206,150,.55)');
      rg.addColorStop(1, 'rgba(255,200,140,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, w, h);
    });
    return cv;
  }

  App.museumTex = {
    rng: rng,
    hashStr: hashStr,
    canvas: canvas,
    glyphRec: glyphRec,
    paintGlyph: paintGlyph,
    paintBone: paintBone,
    carveAt: carveAt,
    colLayout: colLayout,
    slabTextures: slabTextures,
    textCanvas: textCanvas,
    envCanvas: envCanvas
  };

})(window.App = window.App || {});
