/* ============================================================
   甲骨奇谭 · 3D 博物馆 / 环境音
   ------------------------------------------------------------
   两层声音：
     1. 底噪 —— 全部用 Web Audio 现算：一层低频垫（展馆的"空"）、一层
        极轻的房间噪声（石头与人的呼吸）、一点混响（大厅的体积感），
        外加三个极短的交互音（选中 / 成功 / 拆构件）。现算的东西不占请求，
        也不会和曲子打架。
     2. 曲子 —— 就是站点那首 assets/bgm-guzheng.mp3（古筝独奏）。
        原来是"进馆就让路"（site 的 App.sound 被 suspend）：展厅里只有
        一层电流声，走一圈像在机房里。现在把这首曲子接进来当馆里的背景，
        音量压到比关卡低一档，跟环境音垫一起过同一个 master：
        关「声音」时两者一起淡出，打 Boss 时一起让路。

   为什么默认关：
     浏览器不允许无交互自动播放；更何况不请自来的声音很无礼。
     顶栏有一个「声音」开关，打开后记住选择。

   约定：所有函数都可以在没初始化时安全调用（返回 false，不抛错）。
   ============================================================ */
(function (App) {
  'use strict';

  var KEY = 'museumaudio';
  /* 馆里的古筝：与关卡里是同一个文件，浏览器只会下载一次 */
  var BGM_SRC = 'assets/bgm-guzheng.mp3?v=20261021-1';
  var BGM_VOL = 0.62;         /* 相对 master 的音量：比关卡那档（0.13）低一点 */
  var BGM_DUCK = 0.30;        /* 打 Boss 时压到三成 */

  var A = {
    ctx: null, master: null, pad: null, noise: null, verb: null, bgm: null,
    on: false, built: false, nodes: [],
    /* 环境音垫的基准音量（duck 之前的值，恢复时按它还原） */
    padBase: 0.24, noiseBase: 0.045,
    ducked: false,
    /* 开关变化时要通知谁：馆顶栏那颗、关卡右上角那颗，两边必须同一个状态 */
    watchers: []
  };

  function store() { return App.store || null; }

  function readPref() {
    var s = store();
    var v = s ? s.get(KEY, null) : null;
    if (v !== null && v !== undefined) { return !!v; }
    /* 没设过：跟随站点总开关（默认开）。
       用户在关卡里是开着声音的，进馆却一片安静，只会以为"馆里没做声音"。

       ⚠ 读的是**存档里的** sound，不是 App.sound.on()：
       进馆时 site 的 BGM 已经被 suspend 了，那一刻 on() 恒为 false，
       拿它当默认值等于"馆里永远默认静音"。 */
    try {
      if (App.store && App.store.get) {
        var sv = App.store.get('sound', true);
        return !(sv === false || sv === 0 || sv === '0');
      }
    } catch (e) { /* 忽略 */ }
    return true;
  }
  function writePref(v) {
    var s = store();
    if (s) { s.set(KEY, v); }
  }

  function ensureCtx() {
    if (A.ctx) { return A.ctx; }
    var C = window.AudioContext || window.webkitAudioContext;
    if (!C) { return null; }
    try { A.ctx = new C(); } catch (e) { return null; }
    A.master = A.ctx.createGain();
    A.master.gain.value = 0;          /* 从 0 淡入，避免"啪"的一声 */
    A.master.connect(A.ctx.destination);
    return A.ctx;
  }

  /* 混响用一段衰减噪声当脉冲响应：比引 IR 文件便宜，也不占请求 */
  function makeIR(ctx, sec, decay) {
    var rate = ctx.sampleRate;
    var len = Math.floor(rate * sec);
    var buf = ctx.createBuffer(2, len, rate);
    for (var ch = 0; ch < 2; ch++) {
      var d = buf.getChannelData(ch);
      for (var i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  function makeNoise(ctx, sec) {
    var rate = ctx.sampleRate;
    var len = Math.floor(rate * sec);
    var buf = ctx.createBuffer(1, len, rate);
    var d = buf.getChannelData(0);
    var last = 0;
    for (var i = 0; i < len; i++) {
      /* 棕噪声：比白噪声更像"空间"，不刺耳 */
      var w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.2;
    }
    return buf;
  }

  function build() {
    var ctx = ensureCtx();
    if (!ctx) { return false; }
    if (A.built) { return true; }
    A.built = true;

    A.verb = ctx.createConvolver();
    A.verb.buffer = makeIR(ctx, 2.6, 3.2);
    var verbGain = ctx.createGain();
    verbGain.gain.value = 0.42;
    A.verb.connect(verbGain);
    verbGain.connect(A.master);

    /* 低频垫：两个略微失谐的正弦，走低通，音量由慢 LFO 推着起伏。
       它不"演奏"，只负责让展厅不是死的。 */
    var padGain = ctx.createGain();
    padGain.gain.value = A.padBase;
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 260;
    lp.Q.value = 0.6;
    padGain.connect(lp);
    lp.connect(A.master);
    lp.connect(A.verb);

    var o1 = ctx.createOscillator();
    o1.type = 'sine';
    o1.frequency.value = 55;      /* A1 */
    var o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = 82.41;   /* E2，纯五度 */
    o2.detune.value = 7;
    var o3 = ctx.createOscillator();
    o3.type = 'triangle';
    o3.frequency.value = 110;
    var o3g = ctx.createGain();
    o3g.gain.value = 0.12;
    o1.connect(padGain);
    o2.connect(padGain);
    o3.connect(o3g);
    o3g.connect(padGain);
    o1.start(); o2.start(); o3.start();
    A.nodes.push(o1, o2, o3);

    /* 呼吸：0.06Hz，一分钟两次多一点 */
    var lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    var lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.16;
    lfo.connect(lfoGain);
    lfoGain.connect(padGain.gain);
    lfo.start();
    A.nodes.push(lfo);
    A.pad = padGain;

    /* 房间噪声：一条几乎听不见的底噪，手机外放基本听不到，耳机里才有 */
    var src = ctx.createBufferSource();
    src.buffer = makeNoise(ctx, 4);
    src.loop = true;
    var bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 520;
    bp.Q.value = 0.5;
    var ng = ctx.createGain();
    ng.gain.value = A.noiseBase;
    src.connect(bp);
    bp.connect(ng);
    ng.connect(A.master);
    ng.connect(A.verb);
    src.start();
    A.nodes.push(src);
    A.noise = ng;

    return true;
  }

  /* ------------------------------------------------------------------
     古筝（真实音频文件）
     ------------------------------------------------------------------
     走 WebAudio：<audio> → MediaElementSource → gain → master。
     这样它和底下那层环境音垫共用同一个推子 —— 开关、duck、dispose
     都不用各写一份，也不会出现"关了声音还有曲子"。
     ------------------------------------------------------------------ */
  var bgmBroken = false;

  function ensureBgm() {
    if (A.bgm) { return A.bgm; }
    if (bgmBroken) { return null; }
    var ctx = ensureCtx();
    if (!ctx || !document.createElement) { bgmBroken = true; return null; }
    try {
      var el = document.createElement('audio');
      el.src = BGM_SRC;
      el.loop = true;
      el.preload = 'auto';
      el.volume = 1;                 /* 音量交给 gain 管，元素本身不动 */
      var src = ctx.createMediaElementSource(el);
      var g = ctx.createGain();
      g.gain.value = 0;
      src.connect(g);
      g.connect(A.master);
      if (A.verb) { g.connect(A.verb); }
      A.bgm = el;
      A.bgmGain = g;
      A.bgmSrc = src;
    } catch (e) { bgmBroken = true; return null; }
    return A.bgm;
  }

  function bgmRamp(to, sec) {
    var g = A.bgmGain && A.bgmGain.gain;
    if (!g || !A.ctx) { return; }
    var t = A.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(to, t + (sec || 0.8));
  }

  function bgmUp(sec) {
    var el = ensureBgm();
    if (!el) { return; }
    try {
      var p = el.play();
      if (p && p.catch) { p.catch(function () { /* 没拿到手势：下次开关再来 */ }); }
    } catch (e) { /* 忽略 */ }
    bgmRamp(A.ducked ? BGM_VOL * BGM_DUCK : BGM_VOL, sec == null ? 2.4 : sec);
  }

  function bgmDown(sec) {
    bgmRamp(0, sec == null ? 0.6 : sec);
    setTimeout(function () {
      /* 淡出期间又开起来了就别停 */
      if (A.on || !A.bgm) { return; }
      try { A.bgm.pause(); } catch (e) { /* 忽略 */ }
    }, (sec == null ? 0.6 : sec) * 1000 + 80);
  }

  function fade(to, sec) {
    if (!A.ctx || !A.master) { return; }
    var t = A.ctx.currentTime;
    var g = A.master.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(to, t + (sec || 0.8));
  }

  /* 通知所有开关 UI 重画 */
  function notify() {
    var list = A.watchers.slice();
    for (var i = 0; i < list.length; i++) {
      try { list[i](A.on); } catch (e) { /* 一个坏了不影响别人 */ }
    }
  }

  /* 把环境音垫压到 30% 或还原（打 Boss 时用） */
  function applyDuck(toDuck) {
    if (!A.ctx) { return; }
    var t = A.ctx.currentTime;
    var k = toDuck ? 0.28 : 1;
    if (A.pad) {
      var pg = A.pad.gain;
      pg.cancelScheduledValues(t);
      pg.setValueAtTime(pg.value, t);
      /* 总开关由 master 推子负责淡入淡出，这里只管 duck，不要再乘 A.on */
      pg.linearRampToValueAtTime(A.padBase * k, t + 0.4);
    }
    if (A.noise) {
      var ng = A.noise.gain;
      ng.cancelScheduledValues(t);
      ng.setValueAtTime(ng.value, t);
      ng.linearRampToValueAtTime(A.noiseBase * k, t + 0.4);
    }
    /* 战斗音乐有自己的旋律，馆里的曲子必须让开，不然两条旋律打架 */
    if (A.bgmGain) { bgmRamp(BGM_VOL * (toDuck ? BGM_DUCK : 1), 0.4); }
  }

  /* 一次极短的音：选中展品 / 拆掉一个构件都用它 */
  function blip(freq, dur, type, vol) {
    if (!A.on || !A.ctx) { return false; }
    var ctx = A.ctx;
    var t = ctx.currentTime;
    var o = ctx.createOscillator();
    o.type = type || 'triangle';
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.72, t + dur);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol == null ? 0.16 : vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(A.master);
    if (A.verb) { g.connect(A.verb); }
    o.start(t);
    o.stop(t + dur + 0.02);
    return true;
  }

  App.museumAudio = {
    preferOn: readPref,

    isOn: function () { return !!A.on; },

    setOn: function (v) {
      var want = !!v;
      if (want) {
        if (!build()) { return false; }
        if (A.ctx.state === 'suspended') {
          try { A.ctx.resume(); } catch (e) { /* 有的浏览器必须等手势，忽略 */ }
        }
        A.on = true;
        /* 被 duck 过（正在打 Boss）就还原成战场该有的音量，别一开声音就顶满 */
        if (A.ducked) { applyDuck(true); } else { fade(0.20, 1.2); }
        bgmUp(2.4);
      } else {
        A.on = false;
        fade(0, 0.5);
        bgmDown();
      }
      writePref(A.on);
      notify();
      return A.on;
    },

    toggle: function () { return this.setOn(!A.on); },

    /* 谁想跟着开关重画，就登记一个回调（返回取消函数）。
       馆顶栏那颗「声音」和关卡里那颗「♪ 声音」共用同一个状态，
       否则从关卡里关掉、回到馆里那颗还写着"开" —— 就是之前那个 bug。 */
    onChange: function (fn) {
      if (typeof fn !== 'function') { return function () {}; }
      A.watchers.push(fn);
      return function () {
        var i = A.watchers.indexOf(fn);
        if (i >= 0) { A.watchers.splice(i, 1); }
      };
    },

    /* 打 Boss 时把展厅的环境音垫压下去：战斗音乐有自己的低频，
       两层叠在一起会糊成一团。淡 0.4s，不打手。 */
    duck: function (v) {
      A.ducked = !!v;
      applyDuck(A.ducked);
    },

    /* 选中一件展品：一声木石轻响 */
    click: function () { return blip(620, 0.16, 'triangle', 0.14); },
    /* 拆掉一个构件：更闷一点 */
    part: function () { return blip(320, 0.22, 'sine', 0.18); },
    /* 成功：上行两声 */
    good: function () {
      if (!A.on) { return false; }
      blip(660, 0.18, 'triangle', 0.15);
      var self = this;
      setTimeout(function () { self && blip && blip(880, 0.26, 'triangle', 0.13); }, 130);
      return true;
    },

    /* 自查用：不参与界面。pad/master 的实际增益是"duck 有没有生效"最硬的证据 */
    _state: function () {
      return {
        on: A.on,
        pref: readPref(),
        ducked: A.ducked,
        built: A.built,
        master: A.master ? +A.master.gain.value.toFixed(4) : -1,
        ctx: A.ctx ? A.ctx.state : 'none',
        bgm: A.bgm ? (A.bgm.paused ? 'paused' : 'playing') : 'none',
        bgmVol: A.bgmGain ? +A.bgmGain.gain.value.toFixed(3) : -1,
        bgmT: A.bgm ? +A.bgm.currentTime.toFixed(2) : -1,
        bgmDur: A.bgm && isFinite(A.bgm.duration) ? +A.bgm.duration.toFixed(1) : -1,
        bgmReady: A.bgm ? A.bgm.readyState : -1,
        pad: A.pad ? +A.pad.gain.value.toFixed(4) : -1,
        noise: A.noise ? +A.noise.gain.value.toFixed(4) : -1
      };
    },

    dispose: function () {
      if (A.on) { fade(0, 0.2); }
      A.on = false;
      A.ducked = false;
      notify();
      if (A.bgm) { bgmRamp(0, 0.2); }
      var bgmEl = A.bgm;
      A.bgm = null;
      A.bgmGain = null;
      A.bgmSrc = null;
      setTimeout(function () {
        try { if (bgmEl) { bgmEl.pause(); } } catch (e) {}
        /* MediaElementSource 断开之后这个 <audio> 才能被回收；
           ctx 也关了，下次进馆 ensureBgm 会重新建一份 */
        try { if (bgmEl) { bgmEl.removeAttribute('src'); bgmEl.load(); } } catch (e) {}
      }, 320);
      var nodes = A.nodes;
      A.nodes = [];
      setTimeout(function () {
        nodes.forEach(function (n) { try { n.stop(0); } catch (e) {} });
        if (A.ctx) {
          try { A.ctx.close(); } catch (e) {}
        }
        A.ctx = null;
        A.master = null;
        A.verb = null;
        A.pad = null;
        A.noise = null;
        A.built = false;
      }, 320);
    }
  };
})(window.App = window.App || {});
