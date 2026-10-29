/* ============================================================
   甲骨奇谭 · 3D 博物馆 / 环境音
   ------------------------------------------------------------
   为什么不用音频文件：
     站点里已经有一首 bgm（assets/bgm-guzheng.mp3，2MB），但那是给关卡用的
     曲子，放进展馆会抢戏；而且再挂一个大文件，首屏和手机都吃亏。
     这里的声音全部用 Web Audio 现算：一层低频垫（展馆的"空"）、一层
     极轻的房间噪声（石头与人的呼吸）、一点混响（大厅的体积感），
     外加三个极短的交互音（选中 / 成功 / 拆构件）。

   为什么默认关：
     浏览器不允许无交互自动播放；更何况不请自来的声音很无礼。
     顶栏有一个「声音」开关，打开后记住选择。

   约定：所有函数都可以在没初始化时安全调用（返回 false，不抛错）。
   ============================================================ */
(function (App) {
  'use strict';

  var KEY = 'museumaudio';
  var A = {
    ctx: null, master: null, pad: null, noise: null, verb: null,
    on: false, built: false, nodes: []
  };

  function store() { return App.store || null; }

  function readPref() {
    var s = store();
    return !!(s && s.get(KEY, false));
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
    padGain.gain.value = 0.30;
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
    ng.gain.value = 0.05;
    src.connect(bp);
    bp.connect(ng);
    ng.connect(A.master);
    ng.connect(A.verb);
    src.start();
    A.nodes.push(src);
    A.noise = ng;

    return true;
  }

  function fade(to, sec) {
    if (!A.ctx || !A.master) { return; }
    var t = A.ctx.currentTime;
    var g = A.master.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(to, t + (sec || 0.8));
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
        fade(0.20, 1.2);
      } else {
        A.on = false;
        fade(0, 0.5);
      }
      writePref(A.on);
      return A.on;
    },

    toggle: function () { return this.setOn(!A.on); },

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

    dispose: function () {
      if (A.on) { fade(0, 0.2); }
      A.on = false;
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
