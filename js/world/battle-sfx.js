(function (App) {
  'use strict';
  /* ============================================================
     守字之骨 · 战斗音效（纯 WebAudio 程序化生成，不用音频文件）
     ------------------------------------------------------------
     和 battle-music.js 是一对：那一个管"音乐"（鼓/低音/动机，一直在响），
     这一个管"事件"（打中、断骨、答错、进阶段、被吸走、盖印……）。

     两点约定：
       1) 共用战斗音乐的 AudioContext 和混响，但**不共用音乐的推子** ——
          音乐有淡入淡出，音效必须随时立刻响（胜利音乐收尾时还要盖印）。
       2) 全部经过 museumAudio 的总开关判断：馆里「声音」关着就一声不出。

     材质都往"骨、石、木"上靠：短、干、偏闷，不加悦耳的和声。
     ============================================================ */
  if (!App) { return; }

  var B = { ctx: null, out: null, verb: null, ready: false };

  function on() {
    return !!(App.museumAudio && App.museumAudio.isOn && App.museumAudio.isOn());
  }

  /* 向战斗音乐要上下文；它没加载就自己起一个，音效不该因为音乐缺席而失声 */
  function bus() {
    if (B.ctx) { return B; }
    var ctx = null, out = null, verb = null;
    try {
      if (App.battleMusic && App.battleMusic.audio) {
        var a = App.battleMusic.audio();
        if (a && a.ctx) { ctx = a.ctx; out = a.out; verb = a.verb; }
      }
    } catch (e) { /* 退到自己建 */ }
    if (!ctx) {
      var C = window.AudioContext || window.webkitAudioContext;
      if (!C) { return null; }
      try { ctx = new C(); } catch (e2) { return null; }
      out = ctx.createGain();
      out.gain.value = 1;
      out.connect(ctx.destination);
    }
    B.ctx = ctx;
    B.out = out;
    B.verb = verb;
    B.noiseSrc = null;
    return B;
  }

  function t0() { return B.ctx.currentTime; }

  /* 一段白噪（整页只造一次，反复用） */
  function noise() {
    if (B.noiseSrc) { return B.noiseSrc; }
    var ctx = B.ctx;
    var n = Math.floor(ctx.sampleRate * 2);
    var buf = ctx.createBuffer(1, n, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) { d[i] = Math.random() * 2 - 1; }
    B.noiseSrc = buf;
    return buf;
  }

  function send(node, amt) {
    if (!B.verb) { return; }
    var g = B.ctx.createGain();
    g.gain.value = amt == null ? 0.22 : amt;
    node.connect(g);
    g.connect(B.verb);
  }

  /* 噪声冲击：带通从 f0 扫到 f1，指数衰减 */
  function hitNoise(t, dur, f0, f1, q, vel, verb) {
    var ctx = B.ctx;
    var src = ctx.createBufferSource();
    src.buffer = noise();
    src.loop = true;
    var bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(f0, t);
    bp.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    bp.Q.value = q == null ? 1.1 : q;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vel), t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp); bp.connect(g); g.connect(B.out);
    if (verb) { send(g, verb); }
    src.start(t); src.stop(t + dur + 0.03);
    return g;
  }

  /* 单音：可扫频、可指定波形 */
  function tone(t, dur, f0, f1, type, vel, verb) {
    var ctx = B.ctx;
    var o = ctx.createOscillator();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) { o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur); }
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vel), t + Math.min(0.02, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(B.out);
    if (verb) { send(g, verb); }
    o.start(t); o.stop(t + dur + 0.03);
    return g;
  }

  /* 金属泛音：正片叠底的一串非整数倍正弦，用来做锣/骨铃 */
  function metal(t, dur, base, vel, ratios, verb) {
    var rs = ratios || [1, 2.76, 5.4, 8.93];
    for (var i = 0; i < rs.length; i++) {
      tone(t, dur * (1 - i * 0.14), base * rs[i], base * rs[i] * 0.998,
        'sine', vel * Math.pow(0.58, i), verb == null ? 0.3 : verb);
    }
  }

  function guard() {
    if (!on()) { return false; }
    var b = bus();
    if (!b) { return false; }
    try {
      if (b.ctx.state === 'suspended') { b.ctx.resume(); }
    } catch (e) { /* 等手势 */ }
    return true;
  }

  var API = {
    isReady: function () { return !!B.ctx; },

    /* 打中守阵兽：一声闷骨击 + 骨肩的硬边 */
    strike: function (vel) {
      if (!guard()) { return false; }
      var t = t0(), v = vel == null ? 1 : vel;
      tone(t, 0.17, 165, 52, 'sine', 0.5 * v, 0.12);
      hitNoise(t, 0.085, 1150, 420, 1.3, 0.3 * v, 0.1);
      hitNoise(t + 0.004, 0.04, 4200, 2600, 2.0, 0.12 * v, 0.16);
      return true;
    },

    /* 打散守阵兽：连击三下 + 一记下行风声 + 低频塌陷 */
    shatter: function () {
      if (!guard()) { return false; }
      var t = t0();
      API.strike(1.0);
      tone(t + 0.06, 0.5, 96, 28, 'sine', 0.55, 0.18);
      hitNoise(t + 0.02, 0.75, 3000, 420, 0.8, 0.3, 0.4);
      metal(t + 0.10, 0.9, 420, 0.09, [1, 2.2, 3.9], 0.35);
      hitNoise(t + 0.12, 0.22, 900, 260, 1.0, 0.22, 0.2);
      return true;
    },

    /* 拆掉一片构件骨 / 折断一段笔画：脆裂 */
    crack: function (vel) {
      if (!guard()) { return false; }
      var t = t0(), v = vel == null ? 1 : vel;
      hitNoise(t, 0.055, 2600, 1400, 1.8, 0.36 * v, 0.14);
      tone(t + 0.005, 0.16, 720, 250, 'triangle', 0.2 * v, 0.1);
      hitNoise(t + 0.06, 0.14, 1100, 380, 1.0, 0.14 * v, 0.16);
      return true;
    },

    /* 挑错了：低处一个小二度，闷、不刺耳，但明确"不对" */
    wrong: function () {
      if (!guard()) { return false; }
      var t = t0();
      tone(t, 0.34, 196, 176, 'sine', 0.26, 0.1);
      tone(t, 0.34, 207.65, 186, 'sine', 0.2, 0.1);
      hitNoise(t, 0.12, 700, 300, 0.9, 0.12, 0.08);
      return true;
    },

    /* 悬停/选中一片骨：极短的一声，不能盖过音乐 */
    select: function () {
      if (!guard()) { return false; }
      var t = t0();
      tone(t, 0.07, 900, 700, 'triangle', 0.09, 0.1);
      hitNoise(t, 0.03, 3200, 2400, 2.2, 0.05, 0.1);
      return true;
    },

    /* 守阵兽登场：低吼。锯齿过低通再扫一道带通，像骨头在沙里磨 */
    roar: function () {
      if (!guard()) { return false; }
      var t = t0();
      var ctx = B.ctx;
      [0, 0.7].forEach(function (det) {
        var o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(64, t);
        o.frequency.linearRampToValueAtTime(86, t + 0.5);
        o.frequency.linearRampToValueAtTime(58, t + 1.15);
        o.detune.value = det * 9;
        var lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(300, t);
        lp.frequency.linearRampToValueAtTime(1200, t + 0.45);
        lp.frequency.linearRampToValueAtTime(260, t + 1.2);
        var g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.16, t + 0.16);
        g.gain.linearRampToValueAtTime(0.0001, t + 1.2);
        o.connect(lp); lp.connect(g); g.connect(B.out);
        send(g, 0.28);
        o.start(t); o.stop(t + 1.25);
      });
      hitNoise(t + 0.1, 0.9, 420, 1100, 0.7, 0.1, 0.3);
      return true;
    },

    /* 进阶段：一声锣 + 一个上行的五度，给玩家"来新的了"的记号 */
    phaseUp: function () {
      if (!guard()) { return false; }
      var t = t0();
      metal(t, 2.1, 233.08, 0.13, [1, 2.4, 3.8, 5.9], 0.42);
      hitNoise(t, 0.5, 5200, 1400, 0.6, 0.11, 0.4);
      tone(t + 0.03, 0.7, 261.63, 392.0, 'triangle', 0.09, 0.3);
      return true;
    },

    /* 护盾炸裂：宽噪声 + 三记金属，比"断骨"更大更亮 */
    shieldBreak: function () {
      if (!guard()) { return false; }
      var t = t0();
      hitNoise(t, 0.55, 6800, 900, 0.55, 0.26, 0.45);
      tone(t, 0.6, 140, 40, 'sine', 0.42, 0.2);
      metal(t + 0.02, 1.3, 349.23, 0.1, [1, 2.2, 4.1], 0.4);
      return true;
    },

    /* 骨版被吸回漩涡：2.4 秒的上升涡流，正好配那段 2.1s 的吸入动画 */
    suck: function () {
      if (!guard()) { return false; }
      var t = t0(), dur = 2.4;
      var ctx = B.ctx;
      var src = ctx.createBufferSource();
      src.buffer = noise();
      src.loop = true;
      var bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(260, t);
      bp.frequency.exponentialRampToValueAtTime(3600, t + dur);
      bp.Q.value = 2.4;
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.2, t + 0.5);
      g.gain.linearRampToValueAtTime(0.0001, t + dur);
      src.connect(bp); bp.connect(g); g.connect(B.out);
      send(g, 0.5);
      src.start(t); src.stop(t + dur + 0.05);

      tone(t + 0.1, dur * 0.85, 38, 190, 'sine', 0.2, 0.3);
      return true;
    },

    /* 印章砸下：厚木/石的闷响 + 纸面沙沙，收尾用 */
    stamp: function () {
      if (!guard()) { return false; }
      var t = t0();
      tone(t, 0.2, 128, 44, 'sine', 0.5, 0.2);
      hitNoise(t, 0.1, 640, 220, 0.9, 0.3, 0.2);
      hitNoise(t + 0.05, 0.26, 3400, 1800, 0.7, 0.09, 0.3);
      return true;
    },

    /* 胜利：三下鼓 + 上行五声 + 长尾。音乐那边会自己收，这里只补"落定" */
    win: function () {
      if (!guard()) { return false; }
      var t = t0();
      var seq = [293.66, 392.0, 440.0, 587.33];
      for (var i = 0; i < seq.length; i++) {
        tone(t + i * 0.13, 0.55, seq[i], seq[i], 'triangle', 0.14, 0.45);
      }
      tone(t, 0.25, 110, 42, 'sine', 0.42, 0.2);
      tone(t + 0.26, 0.25, 98, 40, 'sine', 0.34, 0.2);
      metal(t + 0.5, 1.8, 587.33, 0.07, [1, 2.7, 4.6], 0.4);
      return true;
    },

    /* 开场说明卡出现：一声低鼓，别抢戏 */
    intro: function () {
      if (!guard()) { return false; }
      var t = t0();
      tone(t, 0.42, 96, 38, 'sine', 0.34, 0.3);
      hitNoise(t, 0.3, 520, 180, 0.8, 0.08, 0.35);
      return true;
    },

    /* 总开关变化时清干净（battle-music 的 ctx 归它自己管，这里只松引用） */
    release: function () {
      B.ctx = null; B.out = null; B.verb = null; B.noiseSrc = null;
    }
  };

  App.battleSfx = API;
})(window.App = window.App || {});
