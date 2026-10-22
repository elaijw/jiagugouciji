/* ============================================================
   wangyi-world.js —— 第二关大地图：光影层
   ------------------------------------------------------------
   教训：把原画再"平移一份"来模拟水/云，接缝一定会露。
   所以换一种动法 —— 画面本身不动，动的是**光**：

     wm-shadow  4 团大云影，乘着风扫过整幅画（70~120s）
     wm-glint   河面上的光斑，沿河道一段段亮过去（6~11s）
     wm-smoke   村舍炊烟（升、散、淡）
     wm-birds   天空鸟群（掠过）
     wm-mist    两条雾带（极慢漂）

   没有位移叠加 → 没有接缝；光斑与云影都带柔边，
   看不出边界，只觉得画面在呼吸。
   ============================================================ */
(function (App) {
  'use strict';

  if (!App) { return; }

  var W = 2624, H = 1472;

  function glints() {
    var out = '';
    /* 沿河道散布的光斑：位置照河道走向给，时长错开 */
    var spots = [
      [180, 1010, 120, 7.2], [420, 985, 150, 8.6], [700, 1035, 130, 6.4],
      [980, 1000, 170, 9.4], [1260, 985, 140, 7.8], [1540, 950, 160, 8.2],
      [1820, 965, 150, 6.8], [2080, 995, 170, 9.0], [2330, 1035, 140, 7.4]
    ];
    spots.forEach(function (s, i) {
      out += '<g class="wm-glint wm-glint-' + (i % 3) + '" transform="translate(' + s[0] + ',' + s[1] + ')">' +
        '<ellipse rx="' + s[2] + '" ry="6" fill="#ffffff" opacity=".5" ' +
        'style="animation-duration:' + s[3] + 's;animation-delay:' + (-i * 0.9).toFixed(1) + 's"/>' +
        '</g>';
    });
    return out;
  }

  function html() {
    return '' +
    '<svg class="wm-fx" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid slice" aria-hidden="true">' +
      '<defs>' +
        '<filter id="wm-soft" x="-30%" y="-30%" width="160%" height="160%">' +
          '<feGaussianBlur stdDeviation="46"/></filter>' +
        '<filter id="wm-glow" x="-40%" y="-40%" width="180%" height="180%">' +
          '<feGaussianBlur stdDeviation="9"/></filter>' +
      '</defs>' +

      /* 云影：四团，各自速度与起点不同，扫过整幅画 */
      '<g filter="url(#wm-soft)" opacity=".22">' +
        '<ellipse class="wm-shadow wm-shadow-1" cx="500"  cy="300"  rx="620" ry="230" fill="#4a3a24"/>' +
        '<ellipse class="wm-shadow wm-shadow-2" cx="1750" cy="420"  rx="720" ry="260" fill="#43331f"/>' +
        '<ellipse class="wm-shadow wm-shadow-3" cx="1100" cy="900"  rx="680" ry="240" fill="#4a3a24"/>' +
        '<ellipse class="wm-shadow wm-shadow-4" cx="2200" cy="1150" rx="520" ry="200" fill="#3f3020"/>' +
      '</g>' +

      /* 扫光：一条很宽的斜向高光，慢慢扫过整幅画 */
      '<g class="wm-sweep" filter="url(#wm-soft)" opacity=".28">' +
        '<rect x="-500" y="-200" width="900" height="1900" fill="#fff6e2" transform="rotate(-14)"/>' +
      '</g>' +

      /* 河面光斑 */
      '<g filter="url(#wm-glow)">' + glints() + '</g>' +

      /* 炊烟 */
      '<g class="wm-smoke wm-smoke-a" transform="translate(1230,1120)"><circle r="10" fill="#f8f1e2"/></g>' +
      '<g class="wm-smoke wm-smoke-b" transform="translate(1390,1090)"><circle r="8"  fill="#f8f1e2"/></g>' +
      '<g class="wm-smoke wm-smoke-c" transform="translate(1540,1130)"><circle r="12" fill="#f8f1e2"/></g>' +

      /* 鸟群 */
      '<g class="wm-birds wm-birds-1" transform="translate(1900,220)">' +
        '<path d="M-36 0 q12 -11 24 0 q12 -11 24 0" fill="none" stroke="#46361f" stroke-width="3.6" opacity=".5"/>' +
        '<path d="M-8 18 q12 -11 24 0 q12 -11 24 0" fill="none" stroke="#46361f" stroke-width="3.4" opacity=".44"/>' +
        '<path d="M22 34 q12 -11 24 0 q12 -11 24 0" fill="none" stroke="#46361f" stroke-width="3" opacity=".38"/>' +
      '</g>' +
      '<g class="wm-birds wm-birds-2" transform="translate(2150,300) scale(.82)">' +
        '<path d="M-28 0 q11 -10 22 0 q11 -10 22 0" fill="none" stroke="#46361f" stroke-width="3" opacity=".42"/>' +
        '<path d="M4 16 q11 -10 22 0 q11 -10 22 0" fill="none" stroke="#46361f" stroke-width="3" opacity=".34"/>' +
      '</g>' +

      /* 雾带 */
      '<g class="wm-mist wm-mist-1"><ellipse cx="900" cy="880" rx="920" ry="74" fill="#fdf8ea" opacity=".18"/></g>' +
      '<g class="wm-mist wm-mist-2"><ellipse cx="1900" cy="760" rx="840" ry="62" fill="#fdf8ea" opacity=".14"/></g>' +
    '</svg>';
  }

  App.worldMap = { html: html, W: W, H: H };
})(window.App = window.App || {});
