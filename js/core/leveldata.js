/* ============================================================
   字有骨气 · 关卡与字形数据装载
   职责：把 levels.json 与 glyph-parts.json 暴露为 App.levels / App.glyphs。

   为什么不用 fetch？
     平台是「传统 script + 全局 App」架构，为的是能在 file:// 下双击直接打开。
     fetch 读本地 JSON 会被 CORS 拦（file:// 下 origin 为 null），
     因此这里用同目录的 _data.js 包裹 JSON（由 dev/_build_leveldata.py 生成），
     保持「双击即开、无需起服务器」这一既有决定。

   字形结构（glyph-parts.json 的每个字）：
     transform     把原始坐标映射到 100×100 画布的变换
     strokeWidth   描边宽度
     pieces[]      笔画：每笔一条 M/L 折线 d，c = 该笔在画布里的包围盒
     注意：JSON 里【不存】整段 svg —— 它等于 transform + 各笔画 d，
     存两份会让体积翻倍（实测 157KB→315KB）。这里按需重建。
   ============================================================ */
(function (App) {
  'use strict';

  App.levels = App.levels || null;
  App.glyphs = App.glyphs || null;

  var CANVAS = 100;

  function rec(name) {
    return (App.glyphs && App.glyphs.parts) ? App.glyphs.parts[name] : null;
  }

  /* 把若干笔画拼成一个 <path>，外层套上该字的变换 */
  function frame(g, ds, color) {
    return '<g transform="' + g.transform + '">' +
      '<path d="' + ds.join(' ') + '" fill="none" stroke="' +
      (color || 'currentColor') + '" stroke-width="' + g.strokeWidth + '" ' +
      'stroke-linecap="round" stroke-linejoin="round"/></g>';
  }

  /* 取整字的甲骨字形（描边用 color；不传则随 currentColor） */
  App.glyphSvg = function (name, color) {
    var g = rec(name);
    if (!g || !g.pieces || !g.pieces.length) { return ''; }
    var ds = [];
    for (var i = 0; i < g.pieces.length; i++) { ds.push(g.pieces[i].d); }
    return frame(g, ds, color);
  };

  /* 取该字的第 i 笔（同样落在 100×100 画布的正确位置上） */
  App.glyphStrokeSvg = function (name, i, color) {
    var g = rec(name);
    if (!g || !g.pieces || !g.pieces[i]) { return ''; }
    return frame(g, [g.pieces[i].d], color);
  };

  /* 该字的笔画清单（画布坐标包围盒 c=[x0,y0,x1,y1]），供「拖拽构字」用 */
  App.glyphStrokes = function (name) {
    var g = rec(name);
    return (g && g.pieces) ? g.pieces : [];
  };

  /* 该字有几笔 */
  App.glyphStrokeCount = function (name) {
    var g = rec(name);
    return (g && g.pieceCount) || 0;
  };

  /* 该字是否有甲骨字形 */
  App.hasGlyph = function (name) {
    return !!(rec(name) && rec(name).pieces && rec(name).pieces.length);
  };

  App.glyphCanvas = CANVAS;

})(window.App = window.App || {});
