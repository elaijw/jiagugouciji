/* ============================================================
   wangyi-world.js —— 第二关大地图（重绘 · 可动的矢量场景）
   ------------------------------------------------------------
   不再是"静态插画 + 光影"，而是把整张地图**重画成一个 SVG 场景**：
     天、日、云、远山、中峰、河、田、林、村、兽、鸟、雾，
     全部是矢量，各自会动。

   坐标沿用 2624 × 1472，与据点 / 雾层同一套，五个据点分毫不错。
   风格：骨白纸面 + 淡墨山形 + 赭色土地 + 一条会流的河。

   动的东西：云漂、水（河）流、树群轻摆、炊烟升、鸟飞、雾移、
   日轮呼吸、河面波光。
   ============================================================ */
(function (App) {
  'use strict';

  if (!App) { return; }

  var W = 2624, H = 1472;

  function rng(seed) {
    var s = seed || 1;
    return function () {
      s = (s * 1103515245 + 12345) % 2147483648;
      return s / 2147483648;
    };
  }

  /* 平滑山脊：正弦 + 伪随机，用二次曲线连起来，不出现锯齿 */
  function ridge(yBase, amp, seed, color, opacity) {
    var r = rng(seed);
    var pts = [];
    for (var x = 0; x <= W; x += 160) {
      var t = x / W;
      var env = 0.55 + 0.45 * Math.sin(t * Math.PI * 2 + seed);
      var y = yBase - amp * env * Math.abs(Math.sin(t * Math.PI * 1.4 + seed * 2));
      y -= r() * amp * 0.25;
      pts.push([x, y]);
    }
    var d = 'M0 ' + H + ' L0 ' + pts[0][1].toFixed(0);
    for (var i = 0; i < pts.length - 1; i++) {
      var xc = ((pts[i][0] + pts[i + 1][0]) / 2).toFixed(0);
      var yc = ((pts[i][1] + pts[i + 1][1]) / 2).toFixed(0);
      d += ' Q' + pts[i][0] + ' ' + pts[i][1].toFixed(0) + ' ' + xc + ' ' + yc;
    }
    d += ' L' + W + ' ' + pts[pts.length - 1][1].toFixed(0) + ' L' + W + ' ' + H + ' Z';
    return '<path d="' + d + '" fill="' + color + '" opacity="' + opacity + '"/>';
  }

  /* 一棵树：锥形树冠 + 树干，叠两个深浅层次读起来才像"树" */
  function tree(x, y, s, tint, rand) {
    var h = (24 + rand() * 16) * s;
    var w = h * 0.6;
    return '<g class="wm-tree" transform="translate(' + x.toFixed(0) + ',' + y.toFixed(0) + ') scale(' + s + ')">' +
      '<path d="M0 0 L0 -' + (h * 0.72).toFixed(1) + '" stroke="#4f3d28" stroke-width="3" opacity=".6"/>' +
      '<path d="M0 -' + (h * 0.72).toFixed(1) + ' C-' + (w * 0.62).toFixed(1) + ' -' + (h * 0.72).toFixed(1) +
        ' -' + (w * 0.62).toFixed(1) + ' -' + (h * 0.18).toFixed(1) + ' 0 -' + (h * 0.18).toFixed(1) +
        ' C' + (w * 0.62).toFixed(1) + ' -' + (h * 0.18).toFixed(1) + ' ' + (w * 0.62).toFixed(1) +
        ' -' + (h * 0.72).toFixed(1) + ' 0 -' + (h * 0.72).toFixed(1) + ' Z" fill="' + tint + '" opacity=".8"/>' +
      '<path d="M0 -' + (h * 0.6).toFixed(1) + ' C-' + (w * 0.34).toFixed(1) + ' -' + (h * 0.6).toFixed(1) +
        ' -' + (w * 0.34).toFixed(1) + ' -' + (h * 0.16).toFixed(1) + ' 0 -' + (h * 0.16).toFixed(1) +
        ' C' + (w * 0.34).toFixed(1) + ' -' + (h * 0.16).toFixed(1) + ' ' + (w * 0.34).toFixed(1) +
        ' -' + (h * 0.6).toFixed(1) + ' 0 -' + (h * 0.6).toFixed(1) + ' Z" fill="' + tint + '" opacity=".9"/></g>';
  }

  function forest(cx, cy, n, seed, tint) {
    var r = rng(seed);
    var out = '';
    for (var i = 0; i < n; i++) {
      var ang = r() * Math.PI * 2;
      var rad = Math.pow(r(), 0.55) * 300;
      var x = cx + Math.cos(ang) * rad;
      var y = cy + Math.sin(ang) * rad * 0.5 + 10;
      var s = 0.8 + r() * 0.6;
      out += tree(x, y, s, (r() > 0.5 ? tint : '#617648'), r);
    }
    return out;
  }

  function fields() {
    var out = '<g class="wm-fields" opacity=".85">';
    for (var rr = 0; rr < 4; rr++) {
      for (var cc = 0; cc < 6; cc++) {
        out += '<rect x="' + (1060 + cc * 78) + '" y="' + (1160 + rr * 48) + '" width="76" height="46" ' +
          'fill="' + ((rr + cc) % 2 ? '#cdb789' : '#c2ac7c') + '" stroke="#8a6f47" stroke-width=".9" opacity=".8"/>';
      }
    }
    out += '</g>';
    return out;
  }

  function village(seed) {
    var r = rng(seed);
    var out = '<g class="wm-village">';
    /* 村墙 / 篱笆 */
    out += '<path d="M1150 1310 Q1400 1270 1650 1310" fill="none" stroke="#6b5437" stroke-width="3" opacity=".3"/>';
    for (var i = 0; i < 10; i++) {
      var x = 1180 + i * 52 + r() * 14;
      var y = 1240 + (i % 3) * 34 + r() * 10;
      var w = 34 + r() * 12;
      var hh = 20 + r() * 8;
      out += '<g transform="translate(' + x.toFixed(0) + ',' + y.toFixed(0) + ')">' +
        '<rect x="' + (-w / 2).toFixed(0) + '" y="' + (-hh).toFixed(0) + '" width="' + w.toFixed(0) + '" height="' + hh.toFixed(0) +
        '" fill="#d3bd93" stroke="#6b5437" stroke-width="1.6"/>' +
        '<path d="M' + (-w / 2 - 7).toFixed(0) + ' ' + (-hh).toFixed(0) + ' L0 ' + (-hh - 18).toFixed(0) +
        ' L' + (w / 2 + 7).toFixed(0) + ' ' + (-hh).toFixed(0) + ' Z" fill="#8a6a44"/>' +
        '<rect x="' + (-w * 0.1).toFixed(0) + '" y="' + (-hh * 0.55).toFixed(0) + '" width="' + (w * 0.2).toFixed(0) +
        '" height="' + (hh * 0.55).toFixed(0) + '" fill="#5c4a33" opacity=".5"/>' +
        '</g>';
      if (i % 3 === 0) {
        out += '<g class="wm-smoke" transform="translate(' + (x + 5).toFixed(0) + ',' + (y - hh - 20).toFixed(0) + ')">' +
          '<circle r="9" fill="#f6efe0"/></g>';
      }
    }
    out += '</g>';
    return out;
  }

  function animals() {
    return '<g class="wm-animals" opacity=".55">' +
      /* 一鹿一羊的极简剪影 */
      '<path d="M2190 1280 q18 -34 42 -10 q14 12 40 8 l-6 22 q-20 8 -40 -2 q-10 -6 -18 -4 l-2 8 q-10 2 -14 -10 z" fill="#54432c"/>' +
      '<path d="M2120 1330 q14 -26 34 -8 q10 10 30 6 l-5 16 q-16 6 -32 -2 q-8 -4 -16 -2 l-1 6 q-8 2 -12 -8 z" fill="#54432c"/>' +
      '</g>';
  }

  function clouds() {
    return '' +
    '<g class="wm-cloud wm-cloud-1" opacity=".75">' +
      '<path d="M560 250 q80 -44 170 -12 q78 -38 150 6 q66 6 54 36 q-26 26 -104 18 q-80 16 -144 -4 q-70 6 -126 -18 q-40 -10 -30 -30 q6 -14 30 -20 z" fill="#faf4e6"/></g>' +
    '<g class="wm-cloud wm-cloud-2" opacity=".6">' +
      '<path d="M1680 360 q96 -50 200 -14 q88 -32 164 10 q60 10 44 34 q-36 24 -128 14 q-92 14 -164 -2 q-64 4 -112 -16 q-28 -12 -22 -22 q4 -10 18 -14 z" fill="#faf4e6"/></g>' +
    '<g class="wm-cloud wm-cloud-3" opacity=".45">' +
      '<path d="M1100 560 q70 -30 140 -8 q66 -24 118 8 q48 8 34 26 q-26 18 -92 12 q-66 10 -116 -2 q-56 4 -82 -16 q-16 -10 -12 -18 q4 -8 10 -8 z" fill="#faf4e6"/></g>';
  }

  function riverGlints() {
    var out = '<g class="wm-glints">';
    var spots = [[180, 1000], [460, 980], [760, 1030], [1060, 990], [1340, 970],
      [1620, 930], [1900, 950], [2180, 990], [2440, 1000]];
    spots.forEach(function (s, i) {
      out += '<ellipse class="wm-glint" cx="' + s[0] + '" cy="' + s[1] + '" rx="120" ry="7" fill="#ffffff" opacity=".5" ' +
        'style="animation-duration:' + (6.5 + (i % 3) * 1.2).toFixed(1) + 's;animation-delay:' + (-i * 0.9).toFixed(1) + 's"/>';
    });
    out += '</g>';
    return out;
  }

  function birds() {
    var out = '';
    [[1900, 220, 1, 'wm-birds-1'], [2160, 300, .8, 'wm-birds-2']].forEach(function (b) {
      out += '<g class="wm-birds ' + b[3] + '" transform="translate(' + b[0] + ',' + b[1] + ') scale(' + b[2] + ')">';
      [[-36, 0], [-8, 18], [22, 34]].forEach(function (p) {
        out += '<path d="M' + p[0] + ' ' + p[1] + ' q12 -11 24 0 q12 -11 24 0" fill="none" stroke="#46361f" ' +
          'stroke-width="3.4" opacity=".5"/>';
      });
      out += '</g>';
    });
    return out;
  }

  function vector() {
    return '' +
'<svg class="wm-svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid slice" role="img" ' +
'aria-label="殷商王邑大地图：远山、一条大河、农田村舍与树林；北面天象、东面山川、西南草木、东南禽兽、南面人居">' +
 '<defs>' +
  '<linearGradient id="wm-sky" x1="0" y1="0" x2="0" y2="1">' +
   '<stop offset="0" stop-color="#efe6cf"/><stop offset=".5" stop-color="#e6d8b9"/>' +
   '<stop offset="1" stop-color="#d9c6a0"/></linearGradient>' +
  '<linearGradient id="wm-water" x1="0" y1="0" x2="0" y2="1">' +
   '<stop offset="0" stop-color="#c4d4cb"/><stop offset=".5" stop-color="#aec3b8"/>' +
   '<stop offset="1" stop-color="#98ada0"/></linearGradient>' +
  '<radialGradient id="wm-sun" cx=".5" cy=".5" r=".5">' +
   '<stop offset="0" stop-color="#f6dfae" stop-opacity=".95"/>' +
   '<stop offset=".45" stop-color="#f6dfae" stop-opacity=".45"/>' +
   '<stop offset="1" stop-color="#f6dfae" stop-opacity="0"/></radialGradient>' +
  '<filter id="wm-blur" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="9"/></filter>' +
 '</defs>' +

 /* 天 */
 '<rect width="' + W + '" height="' + H + '" fill="url(#wm-sky)"/>' +
 '<circle class="wm-sun" cx="1350" cy="150" r="230" fill="url(#wm-sun)"/>' +
 '<circle cx="1350" cy="150" r="44" fill="#f2d69f" opacity=".75"/>' +

 /* 远山：四层，由冷到暖 */
 '<g class="wm-far">' +
   ridge(720, 200, 3, '#a2aaa4', .22) +
   ridge(820, 180, 7, '#8b958e', .3) +
   ridge(920, 160, 13, '#77694f', .42) +
   ridge(1030, 120, 19, '#67573d', .5) +
 '</g>' +

 /* 东面主峰（土地山川区，1800,480）*/
 '<g class="wm-peaks">' +
   '<path d="M1560 900 L1820 340 L2080 900 Z" fill="#6f5d41" opacity=".92"/>' +
   '<path d="M1820 340 L1900 470 L1740 470 Z" fill="#efe9d8" opacity=".95"/>' +
   '<path d="M1690 620 q130 -40 260 0" fill="none" stroke="#463a26" stroke-width="1.6" opacity=".22"/>' +
   '<path d="M1660 700 q150 -44 300 0" fill="none" stroke="#463a26" stroke-width="1.6" opacity=".2"/>' +
   '<path d="M1900 900 L2120 480 L2340 900 Z" fill="#5f4f37" opacity=".9"/>' +
   '<path d="M2120 480 L2190 580 L2050 580 Z" fill="#efe9d8" opacity=".85"/>' +
   '<path d="M1980 720 q140 -40 280 0" fill="none" stroke="#3f3322" stroke-width="1.4" opacity=".2"/>' +
 '</g>' +

 clouds() +

 /* 河：岸 + 水 + 流线 + 波光 */
 '<g class="wm-river">' +
   '<path d="M-40 950 C 300 890, 620 1030, 1000 980 C 1300 940, 1500 870, 1850 890 ' +
     'C 2150 905, 2400 990, 2680 960 L 2680 1170 C 2400 1190, 2140 1110, 1840 1100 ' +
     'C 1480 1090, 1100 1130, 720 1100 C 380 1070, 120 1090, -40 1130 Z" ' +
     'fill="#8fa49a" opacity=".35"/>' +
   '<path d="M-40 990 C 300 930, 620 1070, 1000 1020 C 1300 980, 1500 910, 1850 930 ' +
     'C 2150 945, 2400 1030, 2680 1000 L 2680 1120 C 2400 1140, 2140 1060, 1840 1050 ' +
     'C 1480 1040, 1100 1080, 720 1050 C 380 1020, 120 1040, -40 1080 Z" fill="url(#wm-water)" opacity=".9"/>' +
   '<path class="wm-flow" d="M-40 1035 C 320 970, 640 1100, 1000 1050 C 1320 1005, 1520 940, 1860 960 ' +
     'C 2160 975, 2410 1060, 2680 1030" fill="none" stroke="#eef7f1" stroke-width="8" opacity=".55"/>' +
   '<path class="wm-flow wm-flow-2" d="M-40 1068 C 330 1008, 650 1138, 1000 1088 C 1330 1043, 1530 978, 1860 998 ' +
     'C 2170 1013, 2415 1098, 2680 1068" fill="none" stroke="#ffffff" stroke-width="5" opacity=".38"/>' +
   '<g filter="url(#wm-blur)">' + riverGlints() + '</g>' +
 '</g>' +

 /* 近景土地：田、林、村、兽 */
 '<g class="wm-land">' +
   fields() +
   village(20261022) +
   '<g class="wm-forest-a">' + forest(300, 1150, 40, 5, '#6f8254') + '</g>' +
   '<g class="wm-forest-b">' + forest(2050, 1310, 16, 11, '#7a7a4c') + '</g>' +
   '<g class="wm-forest-c">' + forest(1750, 720, 14, 17, '#6b7a52') + '</g>' +
   animals() +
 '</g>' +

 birds() +

 /* 雾带 */
 '<g class="wm-mist wm-mist-1" filter="url(#wm-blur)">' +
   '<ellipse cx="900" cy="900" rx="920" ry="74" fill="#fdf8ea" opacity=".16"/></g>' +
 '<g class="wm-mist wm-mist-2" filter="url(#wm-blur)">' +
   '<ellipse cx="1900" cy="760" rx="840" ry="62" fill="#fdf8ea" opacity=".13"/></g>' +
'</svg>';
  }


  /* 通用动效层：只做「光和影、鸟与烟、雾」，位置对任意底图都成立。
     与 AI 新画的底图叠加使用；?map=vector 才是全矢量场景。 */
  function overlay() {
    return '' +
    '<svg class="wm-fx" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid slice" aria-hidden="true">' +
      '<defs>' +
        '<filter id="wm-soft" x="-30%" y="-30%" width="160%" height="160%">' +
          '<feGaussianBlur stdDeviation="46"/></filter>' +
      '</defs>' +
      '<g filter="url(#wm-soft)" opacity=".18">' +
        '<ellipse class="wm-shadow wm-shadow-1" cx="500" cy="300" rx="620" ry="230" fill="#4a3a24"/>' +
        '<ellipse class="wm-shadow wm-shadow-2" cx="1750" cy="420" rx="720" ry="260" fill="#43331f"/>' +
        '<ellipse class="wm-shadow wm-shadow-3" cx="1100" cy="900" rx="680" ry="240" fill="#4a3a24"/>' +
        '<ellipse class="wm-shadow wm-shadow-4" cx="2200" cy="1150" rx="520" ry="200" fill="#3f3020"/>' +
      '</g>' +
      '<g class="wm-sweep" filter="url(#wm-soft)" opacity=".26">' +
        '<rect x="-500" y="-200" width="900" height="1900" fill="#fff6e2" transform="rotate(-14)"/>' +
      '</g>' +
      '<g class="wm-smoke" transform="translate(1400,1180)"><circle r="10" fill="#f8f1e2"/></g>' +
      '<g class="wm-smoke" transform="translate(1300,1210)"><circle r="8" fill="#f8f1e2"/></g>' +
      '<g class="wm-smoke" transform="translate(1520,1170)"><circle r="11" fill="#f8f1e2"/></g>' +
      '<g class="wm-birds wm-birds-1" transform="translate(1900,240)">' +
        '<path d="M-36 0 q12 -11 24 0 q12 -11 24 0" fill="none" stroke="#46361f" stroke-width="3.4" opacity=".5"/>' +
        '<path d="M-8 18 q12 -11 24 0 q12 -11 24 0" fill="none" stroke="#46361f" stroke-width="3.4" opacity=".44"/>' +
        '<path d="M22 34 q12 -11 24 0 q12 -11 24 0" fill="none" stroke="#46361f" stroke-width="3" opacity=".38"/>' +
      '</g>' +
      '<g class="wm-mist wm-mist-1" filter="url(#wm-soft)">' +
        '<ellipse cx="900" cy="900" rx="920" ry="74" fill="#fdf8ea" opacity=".16"/></g>' +
      '<g class="wm-mist wm-mist-2" filter="url(#wm-soft)">' +
        '<ellipse cx="1900" cy="760" rx="840" ry="62" fill="#fdf8ea" opacity=".13"/></g>' +
    '</svg>';
  }

  App.worldMap = { overlay: overlay, vector: vector, W: W, H: H };
})(window.App = window.App || {});
