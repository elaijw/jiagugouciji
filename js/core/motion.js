/* ============================================================
   字有骨气 · 动效与互动
   ------------------------------------------------------------
   三件事，都只用 opacity / transform，不动布局、不引起重排：

     1 滚动显现 —— 内容进入视口时淡入上升。一屏一屏地"翻开"，
       而不是一次性糊在眼前。用 IntersectionObserver，只触发一次。
     2 字形描绘 —— 鼠标移到展板上时，甲骨字形像被重新刻一遍那样
       逐笔描出。用 Web Animations API（可反复触发、不污染 CSS）。
     3 底纹视差 —— 骨版底纹随指针轻微位移。幅度很小（几像素），
       只为让页面"有厚度"，不是炫技。

   尊重 prefers-reduced-motion：用户要求减少动态时，全部跳过。
   ============================================================ */
(function (App) {
  'use strict';

  var reduce = false;
  try {
    reduce = window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) { reduce = false; }

  /* 进入视口就浮现的候选元素。
     这些是"一块一块的内容"，不是零碎的行内元素——
     零碎元素也逐个浮现会显得碎。 */
  var REVEAL_SEL = [
    '.stat-band', '.home-sec', '.sec-head',
    '.lv', '.play-card', '.daily-card', '.collect-card', '.ach-card',
    '.atlas-card', '.howto-sec', '.mode-card',
    '.tune', '.setup > .panel', '.wy-ref', '.bd-field'
  ].join(',');

  var io = null;

  function ensureObserver() {
    if (io || !('IntersectionObserver' in window)) { return io; }
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) { return; }
        var el = en.target;
        el.classList.add('mo-in');
        io.unobserve(el);            /* 只浮现一次，回滚不再重来 */
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
    return io;
  }

  /* ---------- 1. 滚动显现 ---------- */
  function armReveal(root) {
    if (reduce || !root) { return; }
    var obs = ensureObserver();
    var list = root.querySelectorAll(REVEAL_SEL);
    if (!obs) { return; }
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (el.classList.contains('mo-rv')) { continue; }
      /* 已经在视口里的（首屏）直接给终态，不要"开局先闪一下" */
      el.classList.add('mo-rv');
      var r = el.getBoundingClientRect();
      if (r.top < window.innerHeight * 0.92) {
        /* 首屏内的不做动画：直接给终态，并且**关掉过渡**。
           只加 .mo-in 是不够的——.mo-in 上挂着 transition，
           元素仍会从 opacity:0 过渡过来，中途被打断就卡在隐藏态。 */
        el.classList.add('mo-in');
        el.classList.add('mo-now');
      } else {
        /* 同屏多块时错开一点，看起来是"依次浮现"而不是"整块闪出" */
        el.style.transitionDelay = (Math.min(i % 6, 5) * 55) + 'ms';
        obs.observe(el);
      }
    }
  }

  /* ---------- 2. 字形描绘 ---------- */
  var inked = new WeakSet();

  function prepGlyph(svg) {
    if (!svg || inked.has(svg)) { return; }
    inked.add(svg);
    var paths = svg.querySelectorAll('path');
    for (var i = 0; i < paths.length; i++) {
      try { paths[i].__len = paths[i].getTotalLength(); } catch (e) { /* 忽略 */ }
    }
    var host = svg.closest ? svg.closest('.lv, .play-card, .atlas-card, .daily-card') : null;
    if (!host) { return; }
    host.addEventListener('mouseenter', function () { draw(svg); });
  }

  function draw(svg) {
    if (reduce || !svg.animate) { return; }
    var paths = svg.querySelectorAll('path');
    for (var i = 0; i < paths.length; i++) {
      var p = paths[i];
      var L = p.__len;
      if (!L) { continue; }
      try {
        p.animate(
          [{ strokeDasharray: L + ' ' + L, strokeDashoffset: L },
           { strokeDasharray: L + ' ' + L, strokeDashoffset: 0 }],
          { duration: 820, delay: i * 60, easing: 'cubic-bezier(.22,.61,.36,1)',
            fill: 'none' });
      } catch (e) { /* 个别浏览器不支持就静默跳过，不影响功能 */ }
    }
  }

  function armGlyphs(root) {
    if (reduce || !root) { return; }
    var list = root.querySelectorAll('.lv-glyph, .ac-glyph, .dc-glyph, .as-glyph');
    for (var i = 0; i < list.length; i++) { prepGlyph(list[i]); }
  }

  /* ---------- 3. 底纹视差 ---------- */
  var bgX = 0, bgY = 0, tx = 0, ty = 0, raf = 0, bound = false;

  function tick() {
    raf = 0;
    bgX += (tx - bgX) * 0.12;          /* 缓动，不要跟手，跟手会显得毛躁 */
    bgY += (ty - bgY) * 0.12;
    var R = document.documentElement;
    R.style.setProperty('--bg-x', bgX.toFixed(2) + 'px');
    R.style.setProperty('--bg-y', bgY.toFixed(2) + 'px');
    if (Math.abs(tx - bgX) > 0.05 || Math.abs(ty - bgY) > 0.05) {
      raf = requestAnimationFrame(tick);
    }
  }

  function onMove(e) {
    /* 幅度只有 7px：是"纸有厚度"，不是"背景在飘" */
    tx = (e.clientX / window.innerWidth - 0.5) * -7;
    ty = (e.clientY / window.innerHeight - 0.5) * -7;
    if (!raf) { raf = requestAnimationFrame(tick); }
  }

  function armParallax() {
    if (reduce || bound) { return; }
    bound = true;
    /* 触摸设备没有指针，不挂 */
    if (window.matchMedia && window.matchMedia('(hover: none)').matches) { return; }
    window.addEventListener('pointermove', onMove, { passive: true });
  }

  /* ---------- 统一入口：每次路由渲染后调用 ---------- */
  function arm(root) {
    if (reduce) { return; }
    armReveal(root);
    armGlyphs(root);
    armParallax();
  }

  /* 兜底：万一观察器没工作（老浏览器、异常、页面被中断），
     2.5 秒后强行让所有 .mo-rv 显示——**内容绝不允许因为动效而消失**。 */
  function safety() {
    setTimeout(function () {
      /* 无条件全部显示：兜底的意义就是"内容绝不允许因为动效而消失"，
         带"在视口内"的判断反而会漏掉该显示的。 */
      var els = document.querySelectorAll('.mo-rv:not(.mo-in)');
      for (var i = 0; i < els.length; i++) {
        els[i].classList.add('mo-in');
        els[i].classList.add('mo-now');
      }
    }, 2500);
  }

  App.motion = {
    arm: function (root) {
      /* 挂这个类之后，滚动显现的隐藏态才会生效。
         没跑起来 -> 没有这个类 -> 内容照常可见。 */
      if (!reduce) { document.documentElement.classList.add('js-motion'); }
      arm(root);
      safety();
    },
    reduced: function () { return reduce; }
  };
})(window.App = window.App || {});
