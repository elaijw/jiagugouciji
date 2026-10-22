/* ============================================================
   字有骨气 · 灵动层（life）
   ------------------------------------------------------------
   这一层是**纯增量**的：不改 shell.js / motion.js 的任何逻辑，
   只订阅已有的 `route` 事件，在页面渲染完之后补几处"会呼吸"的细节。

   为什么单独一层：
     原站已经有 motion.js（滚动显现 / 悬停描字 / 底纹视差），
     它的职责是"内容进场"。而这里要补的是**交互反馈**——
     换页的一口气、数字的滚动、骨片上的光。两件事混在一起，
     以后想单独关掉任何一边都要动别人的代码。

   五件事：
     1 换页过渡   —— 路由切换时内容轻推上来，而不是硬切
     2 首屏刻字   —— 进首页时「虎」按笔顺刻一遍（只一次）
     3 数字滚动   —— 72/37/34/3 从 0 数上去
     4 图鉴错峰   —— 前 24 张卡片依次浮现，后面的直接给终态
     5 骨片微光   —— 指针在首屏骨片上带起一团极淡的光

   全线尊重 prefers-reduced-motion：关掉动效时本文件不做任何事。
   也全线 try/catch：动效失败绝不能影响内容可见。
   ============================================================ */
(function (App) {
  'use strict';

  if (!App) { return; }

  var reduce = false;
  try {
    reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch (e) { reduce = false; }

  var EASE = 'cubic-bezier(.22,.61,.36,1)';

  /* ---------- 1. 换页过渡 ---------- */
  function pageIn(root) {
    if (reduce || !root || !root.animate) { return; }
    try {
      root.animate(
        [{ opacity: 0, transform: 'translateY(12px)' },
         { opacity: 1, transform: 'translateY(0)' }],
        { duration: 380, easing: EASE }
      );
    } catch (e) { /* 忽略 */ }
  }

  /* ---------- 2. （已移除）首屏印章字形的「按笔顺刻一遍」 ----------
     原来这里有 carveHero()，给右下角那枚「虎」印章做刻字动画，
     目标节点 .hero-rune 已随印章一并删除（2026-10-22），函数与调用同时撤掉。
     段号保留，避免后面引用注释编号对不上。 */

  /* ---------- 3. 数字滚动 ---------- */
  function countUp(root) {
    if (reduce || !root) { return; }
    var cells = root.querySelectorAll('.stat-cell b');
    for (var i = 0; i < cells.length; i++) {
      (function (el) {
        var raw = (el.textContent || '').trim();
        var target = parseInt(raw, 10);
        if (!isFinite(target) || target <= 0) { return; }
        var t0 = 0, dur = 760;

        /* 锁宽：数字每帧从 "0" 长到 "241"，位数一变整格跟着推，
           旁边的说明字就被顶着走 —— 那是真·布局位移（CLS）。
           先量出终态宽度钉成 min-width，再让它从 0 数上去。 */
        try {
          var w = Math.ceil(el.getBoundingClientRect().width);
          if (w > 0) { el.style.minWidth = w + 'px'; }
        } catch (e) { /* 量不到就算了 */ }

        el.textContent = '0';

        function step(ts) {
          if (!t0) { t0 = ts; }
          var k = Math.min(1, (ts - t0) / dur);
          /* 先快后慢，收尾干脆 */
          var eased = 1 - Math.pow(1 - k, 3);
          el.textContent = String(Math.round(target * eased));
          if (k < 1) { requestAnimationFrame(step); }
          else { el.textContent = raw; }
        }
        requestAnimationFrame(step);
      })(cells[i]);
    }
  }

  /* ---------- 4. 图鉴：前 24 张依次浮现 ---------- */
  function staggerAtlas(root) {
    if (reduce || !root) { return; }
    var cards = root.querySelectorAll('.atlas-card');
    var n = Math.min(cards.length, 24);
    for (var i = 0; i < n; i++) {
      var c = cards[i];
      if (!c.animate) { continue; }
      try {
        c.animate(
          [{ opacity: 0, transform: 'translateY(10px) scale(.985)' },
           { opacity: 1, transform: 'none' }],
          { duration: 420, delay: 40 + i * 18, easing: EASE, fill: 'backwards' }
        );
      } catch (e) { /* 忽略 */ }
    }
  }

  /* ---------- 5. 首屏骨片：指针微光 ---------- */
  var glowBound = false;

  function bindGlow(root) {
    if (reduce || glowBound) { return; }
    var hero = root.querySelector('.hero');
    if (!hero) { return; }
    if (window.matchMedia && window.matchMedia('(hover: none)').matches) { return; }

    var glow = document.createElement('div');
    glow.className = 'life-glow';
    hero.appendChild(glow);
    glowBound = true;

    var raf = 0, tx = 50, ty = 50, gx = 50, gy = 50;

    function tick() {
      raf = 0;
      gx += (tx - gx) * 0.14;
      gy += (ty - gy) * 0.14;
      glow.style.setProperty('--gx', gx.toFixed(1) + '%');
      glow.style.setProperty('--gy', gy.toFixed(1) + '%');
      if (Math.abs(tx - gx) > 0.1 || Math.abs(ty - gy) > 0.1) {
        raf = requestAnimationFrame(tick);
      }
    }

    hero.addEventListener('pointermove', function (e) {
      var r = hero.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width) * 100;
      ty = ((e.clientY - r.top) / r.height) * 100;
      if (!raf) { raf = requestAnimationFrame(tick); }
    }, { passive: true });
  }

  /* ---------- 统一入口 ---------- */
  function run(route) {
    if (reduce) { return; }
    var root = document.getElementById('sceneRoot');
    if (!root) { return; }
    var name = (route && route.name) || 'home';

    pageIn(root);
    if (name === 'home') {
      countUp(root);
      bindGlow(root);
    }
    if (name === 'atlas') { staggerAtlas(root); }
  }

  if (App.on) {
    App.on('route', function (r) { try { run(r); } catch (e) { /* 动效失败不影响内容 */ } });
  }

  /* life.js 在 build.js 之后加载，首次渲染已经跑完了，
     所以这里补一次；之后再靠 route 事件。 */
  setTimeout(function () {
    try { run(App.router && App.router.current ? App.router.current() : { name: 'home' }); } catch (e) {}
  }, 0);

  App.life = { run: run, reduced: function () { return reduce; } };

})(window.App = window.App || {});
