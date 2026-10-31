(function (App) {
  'use strict';
  /* ============================================================
     守字之骨 · 战斗音乐（纯 WebAudio 程序化生成，不用音频文件）
     ------------------------------------------------------------
     结构：一条低频持续音 + 心跳式大鼓 + 边击 + 五声音阶短动机。
     三个阶段换三种强度：
       一阶 92 BPM，只有鼓与低音
       二阶 104 BPM，加沙锤与更密的大鼓
       三阶 116 BPM，加一层三全音长音，动机改成上下行
     与馆内的「声音」开关联动：museumAudio 关掉就不响。
     ============================================================ */
  if (!App) { return; }

  var A = {
    ctx: null, master: null, playing: false, phase: 1,
    next: 0, timer: 0, step: 0, bpm: 92, started: false
  };

  function audioOn() {
    return !!(App.museumAudio && App.museumAudio.isOn && App.museumAudio.isOn());
  }

  function ctxOf() {
    if (A.ctx) { return A.ctx; }
    var C = window.AudioContext || window.webkitAudioContext;
    if (!C) { return null; }
    A.ctx = new C();
    A.master = A.ctx.createGain();
    A.master.gain.value = 0.0001;
    /* 一点点混响，免得干瘪 */
    var conv = A.ctx.createConvolver();
    var len = Math.floor(A.ctx.sampleRate * 1.6);
    var buf = A.ctx.createBuffer(2, len, A.ctx.sampleRate);
    for (var ch = 0; ch < 2; ch++) {
      var d = buf.getChannelData(ch);
      for (var i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
      }
    }
    conv.buffer = buf;
    var send = A.ctx.createGain();
    send.gain.value = 0.24;
    A.master.connect(A.ctx.destination);
    A.master.connect(send);
    send.connect(conv);
    conv.connect(A.ctx.destination);
    return A.ctx;
  }

  function noiseBuf(ctx, sec) {
    var n = Math.floor(ctx.sampleRate * sec);
    var b = ctx.createBuffer(1, n, ctx.sampleRate);
    var d = b.getChannelData(0);
    for (var i = 0; i < n; i++) { d[i] = Math.random() * 2 - 1; }
    return b;
  }

  var _noise = null;
  function noise(ctx) {
    if (!_noise) { _noise = noiseBuf(ctx, 1.2); }
    return _noise;
  }

  /* 鼓：低频噪声 + 快速衰减，加一点正弦下潜 */
  function kick(t, vel) {
    var ctx = A.ctx;
    var src = ctx.createBufferSource();
    src.buffer = noise(ctx);
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(180, t);
    lp.frequency.exponentialRampToValueAtTime(60, t + 0.14);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.9 * vel, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
    src.connect(lp); lp.connect(g); g.connect(A.master);
    src.start(t); src.stop(t + 0.3);

    var o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(92, t);
    o.frequency.exponentialRampToValueAtTime(44, t + 0.18);
    var og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.5 * vel, t + 0.006);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(og); og.connect(A.master);
    o.start(t); o.stop(t + 0.24);
  }

  /* 边击 / 沙锤：带通噪声，短 */
  function tick(t, freq, vel, dec) {
    var ctx = A.ctx;
    var src = ctx.createBufferSource();
    src.buffer = noise(ctx);
    src.playbackRate.value = 1.4;
    var bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = 1.1;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vel, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (dec || 0.07));
    src.connect(bp); bp.connect(g); g.connect(A.master);
    src.start(t); src.stop(t + (dec || 0.07) + 0.02);
  }

  /* 低音持续音：两只轻微失谐的锯齿，过低通 */
  function drone(t, freq, dur, vel) {
    var ctx = A.ctx;
    [0, 0.6].forEach(function (det) {
      var o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = freq;
      o.detune.value = det * 7;
      var lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(220, t);
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vel, t + 0.5);
      g.gain.linearRampToValueAtTime(0.0001, t + dur);
      o.connect(lp); lp.connect(g); g.connect(A.master);
      o.start(t); o.stop(t + dur + 0.05);
    });
  }

  /* 旋律音：三角波 + 一点点延迟感 */
  function note(t, freq, dur, vel) {
    var ctx = A.ctx;
    var o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vel, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(A.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  /* D 小调五声：D F G A C */
  var PENTA = [293.66, 349.23, 392.0, 440.0, 523.25];
  var ROOT = 73.42;   /* D2 */

  function scheduleStep(t) {
    var ph = A.phase;
    A.bpm = ph === 1 ? 92 : (ph === 2 ? 104 : 116);
    var beat = 60 / A.bpm;
    var s = A.step;

    /* 大鼓：每拍；三阶每拍 + 反拍 */
    if (s % 2 === 0) { kick(t, ph >= 3 ? 1.0 : 0.82); }
    if (ph >= 3 && s % 4 === 2) { kick(t, 0.55); }

    /* 边击：二、三阶 */
    if (ph >= 2 && s % 4 === 2) { tick(t, 2400, 0.16, 0.06); }
    if (ph >= 2 && s % 2 === 1) { tick(t, 5200, 0.07, 0.04); }

    /* 低音长音：每 8 步换一次根音 */
    if (s % 8 === 0) {
      drone(t, ROOT, beat * 8 * 0.98, 0.085);
      if (ph >= 3) { drone(t, ROOT * 1.414, beat * 8 * 0.9, 0.035); }  /* 三全音，紧 */
    }

    /* 动机：每 4 步来一个音，三阶改成下行 */
    if (s % 4 === 2) {
      var idx = (s / 4 + Math.floor(Math.random() * 2)) % PENTA.length;
      if (ph >= 3) { idx = PENTA.length - 1 - idx; }
      note(t, PENTA[Math.round(idx) % PENTA.length] * (ph >= 3 ? 0.5 : 1), beat * 1.6, 0.05);
    }
    A.step = (s + 1) % 16;
  }

  function loop() {
    if (!A.playing) { return; }
    var ctx = A.ctx;
    if (!audioOn()) { return; }
    var beat = 60 / A.bpm;
    /* 提前 0.3 秒排程 */
    while (A.next < ctx.currentTime + 0.3) {
      scheduleStep(A.next);
      A.next += beat / 2;      /* 八分音符一步 */
    }
  }

  App.battleMusic = {
    isPlaying: function () { return A.playing; },
    phaseNow: function () { return A.phase; },

    start: function (phase) {
      var ctx = ctxOf();
      if (!ctx) { return false; }
      if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
      A.phase = phase || 1;
      A.bpm = A.phase === 1 ? 92 : (A.phase === 2 ? 104 : 116);
      A.step = 0;
      A.next = ctx.currentTime + 0.08;
      A.playing = true;
      /* 淡入 */
      A.master.gain.cancelScheduledValues(ctx.currentTime);
      A.master.gain.setValueAtTime(0.0001, ctx.currentTime);
      A.master.gain.linearRampToValueAtTime(0.16, ctx.currentTime + 1.6);
      if (!A.timer) { A.timer = setInterval(loop, 120); }
      loop();
      return true;
    },

    setPhase: function (n) {
      A.phase = n || A.phase;
      if (A.playing) { A.next = Math.max(A.next, A.ctx.currentTime + 0.06); }
    },

    /* 停：淡出后清定时器 */
    stop: function (fadeSec) {
      if (!A.ctx) { A.playing = false; return; }
      var ctx = A.ctx;
      var f = fadeSec == null ? 1.2 : fadeSec;
      A.playing = false;
      try {
        A.master.gain.cancelScheduledValues(ctx.currentTime);
        A.master.gain.setValueAtTime(A.master.gain.value, ctx.currentTime);
        A.master.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + f);
      } catch (e) {}
      if (A.timer) { clearInterval(A.timer); A.timer = 0; }
    },

    /* 胜利：短促收尾（三下鼓 + 一个高音） */
    finish: function () {
      if (!A.ctx || !audioOn()) { this.stop(0.8); return; }
      var ctx = A.ctx, t = ctx.currentTime;
      var self = this;
      try {
        A.master.gain.cancelScheduledValues(t);
        A.master.gain.setValueAtTime(Math.max(A.master.gain.value, 0.0001), t);
        A.master.gain.linearRampToValueAtTime(0.16, t + 0.05);
      } catch (e) {}
      kick(t + 0.02, 1.0);
      kick(t + 0.26, 0.8);
      kick(t + 0.52, 1.0);
      note(t + 0.54, PENTA[4] * 2, 1.4, 0.10);
      A.playing = false;
      if (A.timer) { clearInterval(A.timer); A.timer = 0; }
      setTimeout(function () { self.stop(0.9); }, 1200);
    },

    dispose: function () {
      this.stop(0.2);
      if (A.ctx) { try { A.ctx.close(); } catch (e) {} }
      A.ctx = null; A.master = null;
    }
  };

})(window.App = window.App || {});
