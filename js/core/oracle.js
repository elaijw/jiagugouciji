/* ============================================================
   字有骨气 · 骨片刻字（oracle.js）
   ------------------------------------------------------------
   配合 css/oracle.css：图鉴里的骨片出现时，按笔顺把字"刻"出来。

   四条纪律：
     1 只刻一次。滚回来不再重来——重复播放会让人等，不会让人觉得活。
     2 只刻看得见的。241 格全排动画会掉帧，用 IntersectionObserver 逐格触发。
     3 绝不因为动效而丢内容。所有"先藏后画"的状态都挂着 3 秒兜底，
       动画没跑起来就无条件把笔画放出来。
     4 尊重 prefers-reduced-motion：直接不做，字形一上来就是终态。

   与 motion.js 的关系：
     那边负责"悬停重描"（mouseenter → draw），这边只负责"首次出现"。
     两套都走 dashoffset，收尾都会清掉内联样式，不会互相打架。
   ============================================================ */
(function (App) {
  'use strict';

  if (!App) { return; }

  var reduce = false;
  try {
    reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch (e) { reduce = false; }

  /* 要刻的字形：图鉴格子 + 图鉴详情里的大字形 + 每日一字 */
  var SEL = '.ac-glyph, .as-glyph, .dc-glyph';

  var io = null;
  var pending = [];       /* 已藏好、等着被刻的 <svg> */
  var carvedCount = 0;

  /* ---------- 藏：把笔画收成虚线，等于"还没刻" ---------- */
  function hideStrokes(svg) {
    var paths = svg.querySelectorAll('path');
    var ok = false;
    for (var i = 0; i < paths.length; i++) {
      var p = paths[i], L = 0;
      try { L = p.getTotalLength(); } catch (e) { L = 0; }
      if (!L) { continue; }
      p.__obLen = L;
      p.style.strokeDasharray = L + ' ' + L;
      p.style.strokeDashoffset = L;
      ok = true;
    }
    return ok;
  }

  function showStrokes(svg) {
    var paths = svg.querySelectorAll('path');
    for (var i = 0; i < paths.length; i++) {
      var p = paths[i];
      p.style.strokeDasharray = '';
      p.style.strokeDashoffset = '';
    }
  }

  /* ---------- 刻：按笔顺逐笔出现 ---------- */
  function carve(svg, baseDelay) {
    if (!svg || !svg.animate) { showStrokes(svg); return; }
    var paths = svg.querySelectorAll('path');
    var acc = baseDelay || 0;
    var longest = 0;
    var anims = [];

    for (var i = 0; i < paths.length; i++) {
      var p = paths[i];
      var L = p.__obLen || 0;
      if (!L) { continue; }
      /* 笔画越长，刻得越久；但压住上下限，免得一笔拖到出戏 */
      var dur = Math.max(150, Math.min(340, 90 + L * 2.4));
      try {
        anims.push(p.animate(
          [{ strokeDashoffset: L }, { strokeDashoffset: 0 }],
          { duration: dur, delay: acc, easing: 'cubic-bezier(.45,.12,.25,1)', fill: 'both' }
        ));
      } catch (e) { /* 忽略 */ }
      acc += 46;
      longest = Math.max(longest, acc + dur);
    }

    /* 动画一旦起来就**立刻清掉内联的"藏"样式**：
       值已经交给动画自己撑着了，内联留着只会在
       "中途悬停被 motion.js 重描一次"时把字形又弹回隐藏态。 */
    showStrokes(svg);

    /* 收尾把动画撤掉：不留 fill:forwards 的残留，
       否则以后改色改宽都压不住，getAnimations 也会越积越多 */
    setTimeout(function () {
      for (var k = 0; k < anims.length; k++) {
        try { anims[k].cancel(); } catch (e) {}
      }
    }, longest + 60);
  }

  /* ---------- 排队：同一批里错开一点，看起来是"依次刻" ---------- */
  var stagger = 0;
  var staggerTimer = 0;

  function schedule(svg) {
    var delay = Math.min(stagger, 14) * 52;
    stagger++;
    clearTimeout(staggerTimer);
    staggerTimer = setTimeout(function () { stagger = 0; }, 900);
    carve(svg, delay);
  }

  function ensureObserver() {
    if (io || !('IntersectionObserver' in window)) { return io; }
    io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        var en = entries[i];
        if (!en.isIntersecting) { continue; }
        var svg = en.target;
        io.unobserve(svg);
        if (svg.__obDone) { continue; }
        svg.__obDone = true;
        schedule(svg);
      }
    }, { rootMargin: '0px 0px -4% 0px', threshold: 0.25 });
    return io;
  }

  /* ---------- 挂载：只处理还没处理过的 ---------- */
  function arm(root) {
    if (reduce || !root) { return; }
    var list = root.querySelectorAll(SEL);
    if (!list.length) { return; }
    var obs = ensureObserver();

    for (var i = 0; i < list.length; i++) {
      var svg = list[i];
      if (svg.__obArmed) { continue; }
      svg.__obArmed = true;
      if (!hideStrokes(svg)) { continue; }
      pending.push(svg);

      if (!obs) {                     /* 老浏览器：直接给终态 */
        svg.__obDone = true;
        showStrokes(svg);
        continue;
      }
      obs.observe(svg);
    }
    carvedCount++;
  }

  /* ---------- 兜底：3 秒内还没被刻的，放出来 ----------
     只放**当前在视口里**的。早先的写法是"全放"，实测把折叠线以下的
     153 个字形也一起放了——用户滚下去时一个都不剩，等于白做。
     视野外的留在待刻队列里，交给 IntersectionObserver 按滚动逐格触发。 */
  function revealVisible() {
    var list = document.querySelectorAll(SEL);
    var vh = window.innerHeight || 800;
    for (var i = 0; i < list.length; i++) {
      var svg = list[i];
      if (svg.__obDone) { continue; }
      var r = svg.getBoundingClientRect();
      if (r.bottom < 0 || r.top > vh) { continue; }   /* 不在视口：继续等 */
      svg.__obDone = true;
      showStrokes(svg);
      if (io) { try { io.unobserve(svg); } catch (e) {} }
    }
  }

  function safety() {
    setTimeout(revealVisible, 3000);
  }

  /* ---------- 图鉴改筛选会重建卡片，需要重新挂 ---------- */
  var mo = null;
  var moTimer = 0;

  function watchDom() {
    if (mo || !('MutationObserver' in window)) { return; }
    var root = document.getElementById('sceneRoot');
    if (!root) { return; }
    mo = new MutationObserver(function () {
      clearTimeout(moTimer);
      moTimer = setTimeout(function () {
        arm(document.getElementById('sceneRoot'));
        safety();
      }, 140);
    });
    mo.observe(root, { childList: true, subtree: true });
  }

  App.on('route', function () {
    if (reduce) { return; }
    /* 路由整页重建：旧的观察目标全部失效，重置一遍 */
    if (io) { try { io.disconnect(); } catch (e) {} io = null; }
    pending = [];
    stagger = 0;
    arm(document.getElementById('sceneRoot'));
    watchDom();
    safety();
  });

  /* 首次渲染已经跑完（本文件在 build.js 之后加载），补一次 */
  setTimeout(function () {
    if (reduce) { return; }
    arm(document.getElementById('sceneRoot'));
    watchDom();
    safety();
  }, 0);

  App.oracle = { carve: carve, arm: arm };
})(window.App = window.App || {});
