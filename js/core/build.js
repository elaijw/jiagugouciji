/* ============================================================
   字有骨气 · 启动
   职责：注入品牌字形、套用主题、做存储迁移、启动路由。
   放在所有脚本之后加载，因此此刻 App 的各模块都已就绪。
   ============================================================ */
(function (App) {
  'use strict';

  /* ---------- 品牌信息 ---------- */
  App.BRAND = '甲骨构字记';
  App.BRAND_SUB = '用甲骨文构件拼出汉字';
  App.BRAND_SEAL = '试玩版';
  App.BRAND_VERSION = '0.2';

  /* ============================================================
     品牌字形：「甲骨」二字用数据集的真实甲骨文字形。
     来源 hanzi-glyphs-svg（CC BY 4.0）glyph_id 1023=甲、0315=骨；
     本项目做了缩放、配色与编排。运行期合成，可随主题变色。
     ============================================================ */
  var GLYPH_IDS = ['1023', '0315'];      /* 甲、骨 */
  var OB_INLINE = {
    /* 两个构件的矢量路径（viewBox 内为原始坐标，此处按高度统一缩放） */
    '1023': { vb: [3.58, 3.58, 18.06, 22.84],
      d: 'M 3.581 4.026 L 4.581 20.026 A 0.42 0.42 0 0 0 5.419 19.974 L 4.419 3.974 ' +
         'A 0.42 0.42 0 0 0 3.581 4.026 Z M 4 4.42 L 18 4.42 A 0.42 0.42 0 0 0 18 3.58 ' +
         'L 4 3.58 A 0.42 0.42 0 0 0 4 4.42 Z M 17.48 4 L 17.48 19 A 0.42 0.42 0 0 0 18.32 19 ' +
         'L 18.32 4 A 0.42 0.42 0 0 0 17.48 4 Z M 3.58 19.58 L 18.58 19.58 A 0.42 0.42 0 0 0 18.58 18.74 ' +
         'L 3.58 18.74 A 0.42 0.42 0 0 0 3.58 19.58 Z M 11 7 L 11 20 A 0.42 0.42 0 0 0 11.84 20 ' +
         'L 11.84 7 A 0.42 0.42 0 0 0 11 7 Z' },
    '0315': { vb: [4.40, 5.15, 20.6, 27.9],
      d: 'M 6 9 L 6 12 A 0.615 0.615 0 0 0 7.23 12 L 7.23 9 A 0.615 0.615 0 0 0 6 9 Z ' +
         'M 4.4 12.6 L 16 12.6 A 0.615 0.615 0 0 0 16 11.37 L 4.4 11.37 A 0.615 0.615 0 0 0 4.4 12.6 Z ' +
         'M 16.6 9 L 16.6 13 A 0.615 0.615 0 0 0 17.83 13 L 17.83 9 A 0.615 0.615 0 0 0 16.6 9 Z ' +
         'M 7.391 19.087 L 8.391 26.087 A 0.615 0.615 0 0 0 9.609 25.913 L 8.609 18.913 ' +
         'A 0.615 0.615 0 0 0 7.391 19.087 Z' }
  };

  function buildBrandGlyphURI(color) {
    var H = 64, PAD = 2, GAP = 12;
    var parts = [], x = 0;
    GLYPH_IDS.forEach(function (id) {
      var g = OB_INLINE[id];
      if (!g) return;
      var k = H / g.vb[3];
      var w = g.vb[2] * k;
      parts.push({ id: id, x: x, k: k, vb: g.vb, d: g.d, w: w });
      x += w + GAP;
    });
    if (!parts.length) return '';
    var totalW = x - GAP + PAD * 2;
    var body = parts.map(function (p) {
      var tx = p.x - p.vb[0] * p.k + PAD;
      var ty = -p.vb[1] * p.k + PAD;
      return '<g transform="translate(' + tx.toFixed(2) + ',' + ty.toFixed(2) + ') scale(' +
        p.k.toFixed(5) + ')"><path d="' + p.d + '" fill="' + color + '"/></g>';
    }).join('');
    var W = totalW, HH = H + PAD * 2;
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W.toFixed(1) +
      '" height="' + HH.toFixed(1) + '" viewBox="0 0 ' + W.toFixed(1) + ' ' + HH.toFixed(1) +
      '" role="img" aria-label="甲骨">' + body + '</svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  /* 品牌字形颜色：主题固定为骨白（浅底），取墨色 */
  function glyphColorFor() {
    return '#221d15';
  }

  /* ============================================================
     外观：固定为「骨白」浅色主题，站点不提供任何外观设置。
     html 上的 data-theme="bone" 只是让 css 里那套骨白变量生效的
     内部实现细节（css 以 [data-theme="bone"] 组织），用户看不到也改不了；
     不读取任何存储值，因此早期访客残留的 theme 设置不会影响显示。
     ============================================================ */
  function applyAppearance() {
    document.documentElement.setAttribute('data-theme', 'bone');
    App.brandGlyphURI = buildBrandGlyphURI(glyphColorFor());
    /* 已渲染的站点头需要重画（字形颜色变了） */
    if (App.shell && App.shell.renderHeader) App.shell.renderHeader();
  }

  /* ---------- 启动 ---------- */
  function boot() {
    applyAppearance();

    /* 清掉可能残留的临时类（例如上一次异常退出时留下的） */
    if (document.body.classList) document.body.classList.remove('challenging');

    /* 首次访问给一句引导；模式页已有明确路线，toast 会盖住关卡入口。 */
    if (!App.store.get('seen', false)) {
      App.store.set('seen', true);
      var initialRoute = String(location.hash || '').replace(/^#\/?/, '').split('/')[0];
      if (initialRoute !== 'modes') {
        setTimeout(function () {
          App.toast('欢迎来到字有骨气。挑一个玩法，开始刻字。', 4200);
        }, 700);
      }
    }

    App.router.start();

    /* 暴露给调试与自动化测试 */
    window.__ZQ__ = {
      version: App.BRAND_VERSION,
      modes: App.modes,
      packs: App.packs,
      router: App.router
    };
  }

  /* 本脚本是最后一个同步脚本，放在 </body> 之前：
     此刻 DOM 已解析完毕，直接启动即可，不必等 DOMContentLoaded
     （等它反而会让外部驱动脚本先于平台就绪运行）。 */
  boot();

})(window.App = window.App || {});
