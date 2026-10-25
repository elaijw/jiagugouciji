/* ============================================================
   visual.js —— 纯视觉增强（不碰任何数据与交互逻辑）
   ------------------------------------------------------------
   只做四件事，全部是"加装饰"：
     1. 首屏右侧注入甲骨字形（逐笔描边）；字形取真实构件数据，
        没有该字就自动换一个，绝不画假字
     2. 首屏右下注入龟宝半身像
     3. 卡片/区块滚动入场（IntersectionObserver + .vr-in）
     4. 数字滚动计数（统计条与"我的收集"大数字）

   全部尊重 prefers-reduced-motion；任何一步失败都静默跳过，
   不影响页面原有功能。
   ============================================================ */
(function (App) {
  'use strict';

  if (!App || !App.on) { return; }

  var REDUCED = false;
  try {
    REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) {}

  /* ---------- 1/2. 首屏：刻字 + 龟宝 ---------- */
  function heroDeco() {
    var hero = document.querySelector('.home-scene .hero');
    if (!hero) { return; }

    /* 右侧叠加的甲骨字形已按反馈移除：骨片上只留照片自带的刻辞，不再压一个大字 */

    /* 展览说明牌：小号构件字形 + 引线 + 一句解释。
       只是注解装饰，不往骨片上压大字。 */
    if (!hero.querySelector('.hero-label') && App.hasGlyph && App.glyphSvg &&
        App.hasGlyph('人') && App.hasGlyph('木')) {
      var lab = document.createElement('aside');
      lab.className = 'hero-label';
      lab.setAttribute('aria-label', '说明：甲骨文「休」由「人」与「木」两个构件组成');
      lab.innerHTML =
        '<span class="hl-kicker">甲骨 · 合体字</span>' +
        '<span class="hl-form">' +
          '<span class="hl-comp"><svg viewBox="0 0 100 100">' +
            App.glyphSvg('人', '#24221D') + '</svg></span>' +
          '<i>＋</i>' +
          '<span class="hl-comp"><svg viewBox="0 0 100 100">' +
            App.glyphSvg('木', '#24221D') + '</svg></span>' +
          '<i>＝</i>' +
          '<b>休</b>' +
        '</span>' +
        '<span class="hl-note">今字「休」· 人倚木而息</span>';
      /* 引线：从牌子右上角指向骨片刻辞一带 */
      var lead = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      lead.setAttribute('class', 'hl-lead');
      lead.setAttribute('viewBox', '0 0 120 70');
      lead.setAttribute('aria-hidden', 'true');
      lead.innerHTML = '<path d="M6 64 C34 48 68 30 110 12"/>' +
                       '<circle cx="110" cy="12" r="2.4"/>';
      lab.appendChild(lead);
      hero.appendChild(lab);
    }

    /* 龟宝半身像：右下角，和骨片错开 */
    if (!hero.querySelector('.hero-guibao')) {
      var gb = document.createElement('div');
      gb.className = 'hero-guibao';
      gb.setAttribute('aria-hidden', 'true');
      var img = document.createElement('img');
      img.src = 'assets/guibao-front.png';
      img.alt = '';
      gb.appendChild(img);
      hero.appendChild(gb);
    }
  }

  /* ---------- 3. 滚动入场 ---------- */
  var io = null;
  function revealSetup() {
    var sel = [
      '.home-scene .home-sec',
      '.home-scene .pc-slot',
      '.home-scene .daily-card',
      '.home-scene .collect-card',
      '.home-scene .ach-card',
      '.home-scene .stat-band',
      '.home-scene .motivate-card',
      '.modes-scene .lv',
      '.archive-scene .ar-card'
    ].join(',');
    var nodes = document.querySelectorAll(sel);
    if (!nodes.length) { return; }

    if (REDUCED || !('IntersectionObserver' in window)) {
      for (var i = 0; i < nodes.length; i++) { nodes[i].classList.add('vr-in'); }
      return;
    }

    if (!io) {
      io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) { return; }
          var el = en.target;
          el.classList.add('vr-in');
          io.unobserve(el);
        });
      }, { root: null, rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    }

    for (var j = 0; j < nodes.length; j++) {
      var el = nodes[j];
      if (el.classList.contains('vr-reveal')) { continue; }
      el.classList.add('vr-reveal');
      /* 同一屏里的卡片错开一点，读起来有节奏 */
      var sibs = el.parentNode ? el.parentNode.children : null;
      if (sibs && sibs.length > 1) {
        var idx = Array.prototype.indexOf.call(sibs, el);
        el.style.transitionDelay = Math.min(idx * 70, 280) + 'ms';
      }
      io.observe(el);
    }
  }

  /* ---------- 4. 数字滚动 ---------- */
  function countUpEl(el) {
    if (el.getAttribute('data-vr-counted') === '1') { return; }
    /* 目标值只取一次、存在属性上：绝不从"正在跳动的文字"里再读一次，
       否则第二次启动会把中间值 49 当成目标，数字就停了。 */
    var raw = el.getAttribute('data-vr-target');
    if (raw == null) {
      raw = (el.textContent || '').replace(/[^\d]/g, '');
      el.setAttribute('data-vr-target', raw);
    }
    var target = parseInt(raw, 10);
    if (!isFinite(target) || target <= 0) { el.setAttribute('data-vr-counted', '1'); return; }
    el.setAttribute('data-vr-counted', '1');
    if (REDUCED) { el.textContent = String(target); return; }

    var start = performance.now();
    var dur = 900;
    function step(now) {
      var t = Math.min(1, (now - start) / dur);
      var e = 1 - Math.pow(1 - t, 3);      /* easeOutCubic */
      el.textContent = String(Math.round(target * e));
      if (t < 1) { requestAnimationFrame(step); }
      else { el.textContent = String(target); }
    }
    el.textContent = '0';
    requestAnimationFrame(step);
  }

  function countUp() {
    var sel = '.home-scene .stat-cell b, .home-scene .cc-big b';
    var nodes = document.querySelectorAll(sel);
    if (!nodes.length) { return; }
    /* 不做懒加载：数字是装饰性计数，一进首页就跳完最稳。
       之前挂在 IntersectionObserver 上，图片加载导致布局移动时
       会在滚动到位前才触发，截图里就会停在 18 这种中间值。 */
    for (var i = 0; i < nodes.length; i++) {
      countUpEl(nodes[i]);
    }
  }

  function boot() {
    try { heroDeco(); } catch (e) {}
    try { revealSetup(); } catch (e) {}
    try { countUp(); } catch (e) {}
  }

  /* 路由一变就重做一遍（首页每次都是新节点） */
  App.on('route', function () {
    setTimeout(boot, 0);
    setTimeout(boot, 220);   /* 等首屏动画把节点挂稳再补一次 */
  });
  setTimeout(boot, 60);

  App.visualExpand = { boot: boot };
})(window.App = window.App || {});
