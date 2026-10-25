/* ============================================================
   redesign.js —— 重设计的"主视觉"与两处形象替换
   ------------------------------------------------------------
   1. 首页右侧：原创 SVG 骨片 + 甲骨字「休」（人＋木）＋构件引线
      ＋今字对照；支持逐笔刻出、悬停对照、"观察刻痕"重播
   2. 龟宝：把 3D 位图换成二维线描 SVG（全局替换，含引导卡与提示）
   3. 顶栏：品牌副题、移动端抽屉菜单
   全部只读既有字形数据（App.glyphSvg），不编造字形；缺数据时不画。
   ============================================================ */
(function (App) {
  'use strict';

  if (!App || !App.on) { return; }

  var REDUCED = false;
  try { REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  /* ---------------- 龟宝：二维线描 ---------------- */
  function guibaoSvg() {
    return '' +
    '<svg viewBox="0 0 64 64" role="img" aria-hidden="true" focusable="false">' +
      '<g fill="#FBF6EC" stroke="#24221D" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">' +
        '<path d="M13 44c0-13 9-22 20-22s19 9 19 22z"/>' +
        '<path d="M16 41c-7 0-10-4-9-8 1-3 4-4 7-3l4 3"/>' +
      '</g>' +
      '<g stroke="#24221D" stroke-width="2.2" fill="none" stroke-linecap="round">' +
        '<path d="M21 45v7M44 45v7M51 39l7 7"/>' +
      '</g>' +
      '<g stroke="#8F3528" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".9">' +
        '<path d="M33 23v20M25 28l-3 12M41 28l3 12"/>' +
      '</g>' +
      '<circle cx="11" cy="33" r="1.6" fill="#24221D"/>' +
    '</svg>';
  }

  function swapGuibao() {
    var imgs = document.querySelectorAll('img');
    for (var i = 0; i < imgs.length; i++) {
      var img = imgs[i];
      if (!/guibao/i.test(img.getAttribute('src') || '')) { continue; }
      var span = document.createElement('span');
      span.className = 'gb-ink ' + (img.className || '');
      span.innerHTML = guibaoSvg();
      if (img.getAttribute('alt')) { span.setAttribute('role', 'img'); span.setAttribute('aria-label', img.getAttribute('alt')); }
      else { span.setAttribute('aria-hidden', 'true'); }
      img.parentNode.replaceChild(span, img);
    }
  }

  /* ---------------- 首页主视觉 ---------------- */
  function glyphGroup(ch, tx, ty, scale, cls) {
    if (!App.hasGlyph || !App.hasGlyph(ch) || !App.glyphSvg) { return ''; }
    var inner = App.glyphSvg(ch, 'currentColor');
    if (!inner) { return ''; }
    return '<g class="rd-glyph ' + (cls || '') + '" transform="translate(' + tx + ',' + ty +
      ') scale(' + scale + ')" stroke-width="0">' + inner + '</g>';
  }

  function glyphNested(ch, x, y, size) {
    if (!App.hasGlyph || !App.hasGlyph(ch) || !App.glyphSvg) { return ''; }
    var inner = App.glyphSvg(ch, '#2A241A');
    if (!inner) { return ''; }
    return '<svg x="' + x + '" y="' + y + '" width="' + size + '" height="' + size +
      '" viewBox="0 0 100 100" class="rd-glyph" overflow="visible">' + inner + '</svg>';
  }

  function boneArtifact() {
    if (!App.hasGlyph || !App.hasGlyph('人') || !App.hasGlyph('木')) { return null; }

    var box = document.createElement('div');
    box.className = 'hero-artifact rd-run';
    box.setAttribute('aria-label', '骨片主视觉：甲骨文「休」，由「人」与「木」两个构件组成');

    var stage = document.createElement('div');
    stage.className = 'rd-stage';

    /* 骨片轮廓：竖向长骨、边缘有缺口与崩角，不是圆角矩形 */
    var BONE = 'M208 50 C240 28 292 22 336 30 C372 37 396 58 408 90 ' +
      'C418 118 402 144 414 170 C426 196 452 212 458 246 ' +
      'C464 280 444 302 448 334 C452 366 476 388 472 422 ' +
      'C468 456 444 476 444 510 C444 544 462 570 448 604 ' +
      'C432 642 388 662 336 664 C284 666 236 650 206 620 ' +
      'C176 590 172 550 182 514 C192 478 210 460 204 428 ' +
      'C198 396 172 376 170 342 C168 308 188 286 184 254 ' +
      'C180 222 162 196 168 162 C174 128 174 72 208 50 Z';

    stage.innerHTML = '' +
    '<svg class="rd-art" viewBox="0 0 640 720" role="presentation">' +
      '<defs>' +
        '<linearGradient id="rd-bone-grad" x1="0" y1="0" x2=".35" y2="1">' +
          '<stop offset="0" stop-color="#FDF9F0"/>' +
          '<stop offset=".5" stop-color="#F5EEDF"/>' +
          '<stop offset="1" stop-color="#E7DECB"/>' +
        '</linearGradient>' +
        '<radialGradient id="rd-bone-in" cx=".38" cy=".3" r=".75">' +
          '<stop offset="0" stop-color="#FFFFFF" stop-opacity=".55"/>' +
          '<stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>' +
        '</radialGradient>' +
      '</defs>' +

      '<path d="' + BONE + '" fill="url(#rd-bone-grad)"/>' +
      '<path d="' + BONE + '" fill="url(#rd-bone-in)"/>' +
      '<path d="' + BONE + '" fill="none" stroke="#C6B99E" stroke-width="2.2"/>' +

      /* 骨面裂纹：短、细、克制，各带 pathLength 便于逐笔显影 */
      '<path class="rd-crack" pathLength="1" d="M232 118 C262 168 246 202 268 246"/>' +
      '<path class="rd-crack" pathLength="1" d="M452 244 C424 292 440 322 418 356"/>' +
      '<path class="rd-crack" pathLength="1" d="M262 566 C300 592 332 586 366 610"/>' +
      '<path class="rd-crack" pathLength="1" d="M398 84 C378 118 394 146 372 178"/>' +

      /* 甲骨字「休」：人（左）+ 木（右），用嵌套 SVG 定位，互不挤压 */
      glyphNested('人', 138, 198, 252) +
      glyphNested('木', 326, 208, 272) +

      /* 构件引线与注记 */
      '<path class="rd-callout" d="M252 316 L136 280 L88 280"/>' +
      '<path class="rd-callout" d="M466 336 L540 296 L590 296"/>' +
      '<text class="rd-note-b" x="22" y="272">人</text>' +
      '<text class="rd-note" x="22" y="300">侧身的人</text>' +
      '<text class="rd-note-b" x="552" y="288">木</text>' +
      '<text class="rd-note" x="552" y="316">枝与根</text>' +

      /* 骨面下方的小注：说明这是个合体字，不是单字 */
      '<text class="rd-cap-lab" x="196" y="574">甲骨 · 合体字</text>' +
      '<text class="rd-cap" x="196" y="606">人 ＋ 木 ＝ 休</text>' +
    '</svg>';

    /* 把每条笔画归一化成 pathLength=1：dasharray 才是"整笔"，
       否则 1 个用户单位会变成一串虚线 */
    var gp = stage.querySelectorAll('.rd-glyph path');
    for (var gi = 0; gi < gp.length; gi++) { gp[gi].setAttribute('pathLength', '1'); }

    /* 今字对照：悬停 / 点开后浮现 */
    var cmp = document.createElement('div');
    cmp.className = 'rd-compare';
    cmp.innerHTML =
      '<span class="rd-compare-lab">今字</span>' +
      '<span class="rd-compare-char">休</span>' +
      '<span class="rd-compare-note">人倚木而息</span>';

    var replay = document.createElement('button');
    replay.type = 'button';
    replay.className = 'rd-replay';
    replay.textContent = '观察刻痕';
    replay.addEventListener('click', function () {
      box.classList.remove('rd-run');
      void box.offsetWidth;
      box.classList.add('rd-run');
    });

    stage.addEventListener('click', function () {
      box.classList.toggle('is-close');
    });

    box.appendChild(stage);
    box.appendChild(cmp);
    box.appendChild(replay);
    return box;
  }

  /* ---------------- 顶栏：品牌副题 + 抽屉 ---------------- */
  function brandSub() {
    var brand = document.querySelector('.top-brand');
    if (!brand || brand.querySelector('.brand-sub')) { return; }
    var s = document.createElement('span');
    s.className = 'brand-sub';
    s.textContent = '甲骨构字记';
    brand.appendChild(s);
  }

  function drawer() {
    var top = document.querySelector('.top');
    if (!top || top.querySelector('.top-menu-btn')) { return; }
    var right = top.querySelector('.top-right');
    if (!right) { return; }
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'top-menu-btn';
    b.setAttribute('aria-label', '打开导航');
    b.textContent = '菜单';
    b.addEventListener('click', function () {
      var open = document.body.classList.toggle('nav-open');
      b.textContent = open ? '收起' : '菜单';
      b.setAttribute('aria-label', open ? '收起导航' : '打开导航');
    });
    right.appendChild(b);
  }

  function heroText() {
    var k = document.querySelector('.home-scene .hero-kicker');
    if (k) { k.textContent = '甲骨文互动叙事 / 识字 · 探索 · 讨伐'; }
  }

  function heroArt() {
    var hero = document.querySelector('.home-scene .hero');
    if (!hero) { return; }
    if (hero.querySelector('.hero-artifact')) { return; }
    var art = boneArtifact();
    if (!art) { return; }          /* 没有字形数据就不画，宁可空白也不造假 */
    var hin = hero.querySelector('.hero-in');
    if (hin && hin.parentNode === hero) { hero.insertBefore(art, hin.nextSibling); }
    else { hero.appendChild(art); }
  }

  function boot() {
    try { brandSub(); } catch (e) {}
    try { drawer(); } catch (e) {}
    try { heroText(); } catch (e) {}
    try { heroArt(); } catch (e) {}
    try { swapGuibao(); } catch (e) {}
  }

  App.on('route', function () {
    setTimeout(boot, 0);
    setTimeout(boot, 200);
  });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    setTimeout(boot, 60);
  }
})(window.App = window.App || {});
