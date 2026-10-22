/* ============================================================
   juice.js —— 打击反馈层（裂纹 / 伤害数字 / 震动 / 顿帧 / 阶段过渡）
   ------------------------------------------------------------
   为什么要独立一层：
     三个模式都会重画 DOM（render()），如果把动画绑在被重画的节点上，
     动效会被下一次重画打断、甚至看不见。这里统一挂在一个固定的
     覆盖层（#juice-layer）上，与业务 DOM 解耦。

   可关闭/可回退：
     App.juice.cfg = { enabled, shake, numbers, cracks, hitstop }
     任意一项设 false 即关闭该层；enabled=false 全关。
     系统「减少动态效果」时自动关闭震动、顿帧、粒子，保留信息文字。

   约束：
     · 只动 transform / opacity，不触发布局
     · 单次动效 ≤ 1.5s（阶段过渡 900ms 以内）
   ============================================================ */
(function (App) {
  'use strict';

  var reduceQ = window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : { matches: false, addEventListener: null };

  /* 效果开关（三层，优先级从高到低）：
       ① URL：?fx=0 关 / ?fx=1 开（便于排查"是不是动效导致的卡"）
       ② 本地存储：App.store('fx')
       ③ 默认开
     系统「减少动态效果」永远优先于以上开关（在 on() 里单独判断）。 */
  var FX_KEY = 'fx';
  function savedFx() {
    try { return (App.store && App.store.get) ? App.store.get(FX_KEY, null) : null; }
    catch (e) { return null; }
  }
  function urlFx() {
    try {
      var m = /[?&]fx=(0|1)\b/.exec(location.search || '');
      return m ? m[1] === '1' : null;
    } catch (e) { return null; }
  }

  var J = App.juice = {
    cfg: {
      enabled: true,
      shake: 1,        // 强度倍率，0 关闭
      numbers: true,
      cracks: true,
      hitstop: true,
      stageFx: true
    },
    reduced: !!reduceQ.matches,
    layer: null
  };

  /* 声音统一走远端的骨板音（App.sound.pluck），不另建音频系统 */
  function pluck(v) {
    try { if (App.sound && App.sound.pluck) { App.sound.pluck(v); } } catch (e) {}
  }

  function reduced() { return J.reduced; }
  function on(key) {
    if (!J.cfg.enabled) { return false; }
    if (document.hidden) { return false; }
    if (key === 'shake' && (reduced() || !J.cfg.shake)) { return false; }
    if (key === 'hitstop' && (reduced() || !J.cfg.hitstop)) { return false; }
    if (key === 'cracks' && !J.cfg.cracks) { return false; }
    if (key === 'numbers' && !J.cfg.numbers) { return false; }
    if (key === 'stageFx' && reduced()) { return false; }
    return true;
  }

  /* 初始化开关 + 暴露设置接口（控制台/设置页都可用） */
  (function initFx() {
    var v = urlFx();
    if (v === null) { v = savedFx(); }
    if (v === false) { J.cfg.enabled = false; }
  })();

  J.setEnabled = function (on) {
    J.cfg.enabled = !!on;
    try { if (App.store && App.store.set) { App.store.set(FX_KEY, J.cfg.enabled); } }
    catch (e) {}
    if (!J.cfg.enabled && J.layer) { J.layer.innerHTML = ''; }
    return J.cfg.enabled;
  };

  /* 后台标签页不做粒子/数字，回来再继续（省电、防卡顿） */
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && J.layer) { J.layer.innerHTML = ''; }
  });

  if (reduceQ.addEventListener) {
    reduceQ.addEventListener('change', function (e) {
      J.reduced = !!e.matches;
      if (J.reduced && J.layer) { J.layer.innerHTML = ''; }
    });
  }

  function ensure() {
    if (J.layer && J.layer.parentNode) { return J.layer; }
    var el = document.getElementById('juice-layer');
    if (!el) {
      el = document.createElement('div');
      el.id = 'juice-layer';
      el.setAttribute('aria-hidden', 'true');
      document.body.appendChild(el);
    }
    J.layer = el;
    return el;
  }

  /* ---------- 坐标工具：接受元素 / {x,y} / MouseEvent ---------- */
  function pointOf(p) {
    if (!p) { return { x: window.innerWidth / 2, y: window.innerHeight / 2 }; }
    if (typeof p.clientX === 'number') { return { x: p.clientX, y: p.clientY }; }
    if (typeof p.x === 'number') { return { x: p.x, y: p.y }; }
    var r = p.getBoundingClientRect ? p.getBoundingClientRect() : null;
    if (r) { return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
    return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  }

  /* ---------- 震屏：给一个稳定的容器加类，动画结束自动摘 ---------- */
  J.shake = function (target, amp, ms) {
    if (!on('shake')) { return; }
    var el = target || document.querySelector('.scene') || document.body;
    if (!el) { return; }
    var a = Math.min(1, (typeof amp === 'number' ? amp : 1)) * (J.cfg.shake || 1);
    el.style.setProperty('--juice-shake', (a * 5).toFixed(2) + 'px');
    el.classList.remove('juice-shaking');
    /* 强制回流一次，保证连续命中也重新触发动画 */
    void el.offsetWidth;
    el.classList.add('juice-shaking');
    var dur = ms || 220;
    clearTimeout(el.__juiceShakeT);
    el.__juiceShakeT = setTimeout(function () {
      el.classList.remove('juice-shaking');
    }, dur);
  };

  /* ---------- 顿帧：短暂冻结过渡/动画，制造"打到了"的停顿感 ---------- */
  J.freeze = function (ms, then) {
    if (!on('hitstop')) { if (then) { then(); } return; }
    var root = document.documentElement;
    root.classList.add('juice-frozen');
    setTimeout(function () {
      root.classList.remove('juice-frozen');
      if (then) { then(); }
    }, Math.max(40, Math.min(120, ms || 70)));
  };

  /* ---------- 伤害数字：从字形上浮出 ---------- */
  J.number = function (pt, text, kind) {
    if (!on('numbers')) { return; }
    var p = pointOf(pt);
    var s = document.createElement('span');
    s.className = 'juice-num juice-num-' + (kind || 'hit');
    s.textContent = text;
    s.style.left = p.x + 'px';
    s.style.top = p.y + 'px';
    ensure().appendChild(s);
    setTimeout(function () {
      if (s.parentNode) { s.parentNode.removeChild(s); }
    }, 900);
  };

  /* ---------- 裂纹：从命中点炸开几道折线，短促消失 ---------- */
  J.crack = function (pt, size, tone) {
    if (!on('cracks')) { return; }
    var p = pointOf(pt);
    var R = size || 90;
    var svgNS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('class', 'juice-crack tone-' + (tone || 'bone'));
    svg.setAttribute('viewBox', '0 0 200 200');
    svg.setAttribute('width', R * 2);
    svg.setAttribute('height', R * 2);
    svg.style.left = (p.x - R) + 'px';
    svg.style.top = (p.y - R) + 'px';

    var seed = Math.random() * 10;
    for (var i = 0; i < 5; i++) {
      var ang = (Math.PI * 2 * i) / 5 + seed;
      var len = 40 + Math.random() * 50;
      var mid = len * 0.55;
      var d = 'M 100 100 L ' +
        (100 + Math.cos(ang) * mid + (Math.random() * 10 - 5)) + ' ' +
        (100 + Math.sin(ang) * mid + (Math.random() * 10 - 5)) + ' L ' +
        (100 + Math.cos(ang) * len) + ' ' + (100 + Math.sin(ang) * len);
      var path = document.createElementNS(svgNS, 'path');
      path.setAttribute('d', d);
      path.setAttribute('class', 'juice-crack-path');
      path.setAttribute('stroke-dasharray', '120');
      path.setAttribute('stroke-dashoffset', '120');
      svg.appendChild(path);
    }
    ensure().appendChild(svg);
    setTimeout(function () {
      if (svg.parentNode) { svg.parentNode.removeChild(svg); }
    }, 620);
  };

  /* ---------- 一次命中的组合反馈（业务侧只需要调这个） ---------- */
  J.hit = function (pt, opts) {
    opts = opts || {};
    var kind = opts.kind || 'hit';
    var text = opts.text;
    var after = opts.after;

    if (kind !== 'miss') {
      J.number(pt, text == null ? '' : String(text), kind);
      J.crack(pt, opts.size || (kind === 'cut' ? 70 : 96), kind === 'cut' ? 'cut' : 'bone');
      J.shake(opts.target, opts.power == null ? 0.8 : opts.power, 200);
      pluck(kind === 'cut' ? 0.7 : (kind === 'break' ? 1.2 : 0.9));
    } else {
      J.number(pt, '空', 'miss');
      pluck(0.3);
    }

    var wait = on('hitstop') ? (opts.freeze == null ? 70 : opts.freeze) : 0;
    if (wait > 0) { J.freeze(wait, after); } else if (after) { after(); }
  };

  /* ---------- 阶段切换：骨片整体裂开 + 色调压一层 ---------- */
  J.stageBreak = function (target, stage) {
    if (!on('stageFx')) { return; }
    var el = target || document.querySelector('.scene');
    if (!el) { return; }
    var p = pointOf(el);
    J.crack(p, 220, 'stage');
    var film = document.createElement('div');
    film.className = 'juice-stagefilm stage-' + (stage || 2);
    ensure().appendChild(film);
    setTimeout(function () {
      if (film.parentNode) { film.parentNode.removeChild(film); }
    }, 900);
    if (stage >= 3) {
      el.classList.remove('juice-phase-2');
      el.classList.add('juice-phase-3');
    } else {
      el.classList.add('juice-phase-2');
    }
    pluck(1.6);
  };

  /* ---------- 收束：通关时从中心收拢 ---------- */
  J.finale = function (target) {
    if (!J.cfg.enabled) { return; }
    var el = target || document.querySelector('.scene');
    if (!el) { return; }
    el.classList.add('juice-finale');
    setTimeout(function () { el.classList.remove('juice-finale'); }, 1200);
    pluck(1.1);
  };

  /* ---------- 笔画斩断：沿被斩的 SVG 路径播一次描画 ---------- */
  J.severStroke = function (g) {
    if (!g || !J.cfg.enabled || reduced()) { return; }
    g.classList.add('juice-severed');
    setTimeout(function () { g.classList.remove('juice-severed'); }, 500);
  };

  /* 调试入口：控制台可 App.juice.cfg.enabled=false 一键关闭 */
  App.juice = J;
})(window.App = window.App || {});
