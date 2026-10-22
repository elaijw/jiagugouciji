/* ============================================================
   字有骨气 · 声音层（audio）
   ------------------------------------------------------------
   这一层是**纯增量**的：不改任何玩法的逻辑，只做两件事——

     1. 背景音乐   —— 古筝独奏，资产里的 bgm-guzheng.mp3，循环播放。
     2. 骨板拨动   —— 点关卡卡片时那一下，资产里的 bone-clack.wav
                      （从一段真实骨头敲击录音里切出来的一击）。

   为什么用音频文件、而且只能走 <audio>：
     这站是纯静态、双击 index.html 就能跑的（file://）。实测两件事：
       · <audio src="./assets/x.mp3"> 在 file:// 下**能**加载、能播；
       · createMediaElementSource 接进 Web Audio 之后输出**恒为 0** ——
         file:// 被视为 opaque origin，媒体被判跨源、tainted，直接静音。
     所以音量只能靠 el.volume（线性增益），不能过 Web Audio 的母线、
     压缩器、滤波器。下面所有音量都是按"文件电平 × volume"算出来的。

   合成层还在，但降级为**备份**：两个音频文件只要有一个加载失败
   （比如有人只拷了 html/js 没拷 assets），就自动退回振荡器合成，
   不至于整站无声。两条路不会同时出声。

   三条硬约束：
     · 浏览器不允许无交互自动出声 → 第一次 pointerdown / keydown 才
       play()，之后靠 App.store('sound') 记住开关。
     · 关掉时淡出并 pause（不是把音量调 0 让它在后台继续跑）。
     · 标签页切走时 pause，回来再续上。

   音量（线性，作用在 el.volume 上）：
     背景 bgm-guzheng.mp3  文件 RMS 0.103 / 峰值 0.933
       → ×0.13 后 RMS ≈ -37dBFS、峰值 ≈ -18dBFS
     骨板 bone-clack.wav   文件峰值 0.84
       → ×0.30 后峰值 ≈ -12dBFS
   0.22 → 0.13：0.22 时古筝的旋律线是听得清的，会跟讲解抢注意力。
   这一版按"有氛围就好"压到 0.13 —— 只在换页、答题的间隙听见，
   认真读字的时候它在底下铺一层，不构成"正在放音乐"这件事。
   骨板不跟着压：那一下是操作反馈，比音乐高约 24dB 才点得出来。

   对外接口（都带 try/catch，音频失败绝不影响页面）：
     App.sound.on()        是否开着
     App.sound.toggle()    切换并持久化，触发 'sound' 事件
     App.sound.set(bool)
     App.sound.pluck(v)    拨一下骨板（v 为力度，默认 1）
     App.sound.unlock()    手动解锁（一般不需要，首次点击会自动调）
   ============================================================ */
(function (App) {
  'use strict';

  if (!App) { return; }

  var KEY = 'sound';
  var Ctx = window.AudioContext || window.webkitAudioContext;

  /* 资产路径。带版本参数：改素材时必须一起改，否则浏览器会用旧的。 */
  var BGM_SRC = 'assets/bgm-guzheng.mp3?v=20261021-1';
  var SFX_SRC = 'assets/bone-clack.wav?v=20261021-1';

  var VOL_BGM = 0.13;
  var VOL_SFX = 0.30;
  var BGM_FADE_IN = 2.4;    /* 秒：页面刚起来时慢慢进入，别一上来就"弹" */
  var BGM_FADE_OUT = 0.6;

  var on = true;
  try {
    var saved = App.store.get(KEY, true);
    on = (saved !== false && saved !== 0 && saved !== '0');
  } catch (e) { on = true; }

  var unlocked = false;
  var nPluck = 0;

  /* ------------------------------------------------------------------
     音量渐变。el.volume 是阶跃赋值，靠 rAF 补间，40ms 一档就够平滑。
     tk 存在元素上：同一次淡入淡出被后来的覆盖时，旧的循环自己退出。
     ------------------------------------------------------------------ */
  function fadeTo(el, to, ms) {
    if (!el) { return; }
    var tk = (el.__tk = (el.__tk || 0) + 1);
    var from = el.volume;
    var t0 = performance.now();
    function step(now) {
      if (el.__tk !== tk) { return; }
      var k = ms > 0 ? Math.min(1, (now - t0) / ms) : 1;
      el.volume = Math.max(0, Math.min(1, from + (to - from) * k));
      if (k < 1) { requestAnimationFrame(step); }
    }
    requestAnimationFrame(step);
  }

  /* ------------------------------------------------------------------
     1. 背景音乐（真实音频）
     ------------------------------------------------------------------ */
  var bgm = null;
  var bgmBroken = false;
  var musicOn = false;

  function makeBgm() {
    if (bgm || bgmBroken || !document.createElement) { return bgm; }
    try {
      bgm = document.createElement('audio');
      bgm.src = BGM_SRC;
      bgm.loop = true;
      bgm.preload = 'auto';
      bgm.volume = 0;
      /* 加载失败（文件缺失 / 编码不支持）→ 记下来，改走合成 */
      bgm.addEventListener('error', function () {
        bgmBroken = true;
        if (musicOn) { startSynthMusic(); }
      });
    } catch (e) { bgmBroken = true; }
    return bgm;
  }

  function startMusic() {
    if (musicOn) { return; }
    var a = makeBgm();
    if (!a || bgmBroken) { startSynthMusic(); return; }
    musicOn = true;
    try {
      var p = a.play();
      if (p && p.catch) {
        p.catch(function () {
          /* 没拿到手势授权：等下一次解锁再试 */
          musicOn = false;
        });
      }
    } catch (e) { musicOn = false; startSynthMusic(); return; }
    a.volume = 0;
    fadeTo(a, VOL_BGM, BGM_FADE_IN * 1000);
  }

  function stopMusic() {
    musicOn = false;
    stopSynthMusic();
    if (!bgm) { return; }
    fadeTo(bgm, 0, BGM_FADE_OUT * 1000);
    setTimeout(function () {
      /* 淡出期间又开起来了就别停 */
      if (musicOn || !bgm) { return; }
      try { bgm.pause(); } catch (e) { /* 忽略 */ }
    }, BGM_FADE_OUT * 1000 + 60);
  }

  /* ------------------------------------------------------------------
     2. 骨板被拨动（真实音频）
     ------------------------------------------------------------------
     用 4 个 <audio> 轮流：连点关卡时前一声还没播完，不会把后一声掐掉。
     每次 playbackRate 随机 ±5%、音量随机 ±8% —— 同一个采样反复听也不会
     "一模一样"，这是最省事的去重复办法。
     ------------------------------------------------------------------ */
  var POOL_N = 4;
  var pool = [];
  var poolIdx = 0;
  var sfxBroken = false;

  function makePool() {
    if (pool.length || sfxBroken) { return; }
    try {
      for (var i = 0; i < POOL_N; i++) {
        var a = document.createElement('audio');
        a.src = SFX_SRC;
        a.preload = 'auto';
        a.volume = 0;
        a.addEventListener('error', function () { sfxBroken = true; });
        pool.push(a);
      }
    } catch (e) { sfxBroken = true; }
  }

  function pluck(v) {
    if (!on) { return; }
    var s = (v == null ? 1 : v);
    nPluck++;

    makePool();
    if (pool.length && !sfxBroken) {
      var a = pool[poolIdx++ % POOL_N];
      try {
        /* 元数据还没加载时赋 currentTime 会抛 InvalidStateError，
           所以只在已经播过（或已就绪）时才回零 */
        if (a.currentTime > 0) { a.currentTime = 0; }
        a.playbackRate = 0.95 + Math.random() * 0.10;
        a.volume = Math.min(1, VOL_SFX * s * (0.92 + Math.random() * 0.16));
        var p = a.play();
        if (p && p.catch) { p.catch(function () { /* 交给合成层兜底 */ }); }
        if (!sfxBroken) { return; }
      } catch (e) { sfxBroken = true; }
    }
    synthPluck(s);
  }

  /* ==================================================================
     以下为**备份**：音频文件不可用时才走这里。
     全部实时合成，零请求。原来那套"很疏的羽调 + 三层骨板声"就留在这。
     ================================================================== */
  var VOL_MASTER = 0.9;
  var VOL_MUSIC = 0.55;

  var ctx = null, master = null, musicBus = null, sfxBus = null, noiseBuf = null;
  var noteTimer = 0, droneNodes = [], step = 0, nNote = 0, offTimer = 0;

  var BELL = [220.00, 261.63, 293.66, 329.63, 392.00, 440.00];
  var CLAY = [110.00, 130.81, 146.83, 164.81, 196.00, 220.00];

  function ensure() {
    if (!Ctx) { return null; }
    try {
      if (!ctx) {
        ctx = new Ctx();
        var comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -18; comp.knee.value = 24; comp.ratio.value = 6;
        comp.attack.value = 0.006; comp.release.value = 0.24;

        master = ctx.createGain();
        master.gain.value = 0;
        musicBus = ctx.createGain();
        musicBus.gain.value = 0.0001;
        sfxBus = ctx.createGain();
        sfxBus.gain.value = VOL_SFX;

        musicBus.connect(master); sfxBus.connect(master);
        master.connect(comp); comp.connect(ctx.destination);

        noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.25), ctx.sampleRate);
        var d = noiseBuf.getChannelData(0);
        for (var i = 0; i < d.length; i++) { d[i] = Math.random() * 2 - 1; }
      }
      if (ctx.state === 'suspended') { ctx.resume(); }
      return ctx;
    } catch (e) { return null; }
  }

  /* 母线只当"总闸"，瞬时开闸：第一次点关卡时解锁与发声在同一次
     pointerdown 里，母线若还在淡入，那一下骨板声会被压掉大半。 */
  function setMaster(to, sec) {
    if (!ctx || !master) { return; }
    try {
      var t = ctx.currentTime;
      master.gain.cancelScheduledValues(t);
      if (!sec) { master.gain.setValueAtTime(to, t); }
      else { master.gain.setValueAtTime(master.gain.value, t); master.gain.linearRampToValueAtTime(to, t + sec); }
    } catch (e) { /* 忽略 */ }
  }

  function setMusicGain(to, sec) {
    if (!ctx || !musicBus) { return; }
    try {
      var t = ctx.currentTime;
      musicBus.gain.cancelScheduledValues(t);
      musicBus.gain.setValueAtTime(Math.max(0.0001, musicBus.gain.value), t);
      musicBus.gain.linearRampToValueAtTime(Math.max(0.0001, to), t + sec);
    } catch (e) { /* 忽略 */ }
  }

  /* 三层叠出来的：带通白噪"咔" + 三角波板身下坠 + 正弦闷响 */
  function synthPluck(v) {
    var c = ensure();
    if (!c) { return; }
    var s = (v == null ? 1 : v) * (0.86 + Math.random() * 0.28);
    var t = c.currentTime + 0.002;

    try {
      var n = c.createBufferSource();
      n.buffer = noiseBuf;
      var bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1850 + Math.random() * 900;
      bp.Q.value = 5.2;
      var ng = c.createGain();
      ng.gain.setValueAtTime(0.0001, t);
      ng.gain.exponentialRampToValueAtTime(0.34 * s, t + 0.004);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.075);
      n.connect(bp); bp.connect(ng); ng.connect(sfxBus);
      n.start(t); n.stop(t + 0.09);
    } catch (e) { /* 忽略 */ }

    try {
      var f0 = 468 * (0.94 + Math.random() * 0.12);
      var o = c.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.62, t + 0.085);
      var og = c.createGain();
      og.gain.setValueAtTime(0.0001, t);
      og.gain.exponentialRampToValueAtTime(0.24 * s, t + 0.006);
      og.gain.exponentialRampToValueAtTime(0.0001, t + 0.30);
      o.connect(og); og.connect(sfxBus);
      o.start(t); o.stop(t + 0.32);
    } catch (e) { /* 忽略 */ }

    try {
      var b = c.createOscillator();
      b.type = 'sine';
      b.frequency.setValueAtTime(178, t);
      b.frequency.exponentialRampToValueAtTime(118, t + 0.12);
      var bg = c.createGain();
      bg.gain.setValueAtTime(0.0001, t);
      bg.gain.exponentialRampToValueAtTime(0.16 * s, t + 0.008);
      bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.17);
      b.connect(bg); bg.connect(sfxBus);
      b.start(t); b.stop(t + 0.19);
    } catch (e) { /* 忽略 */ }
  }

  function drone() {
    if (!ctx || droneNodes.length) { return; }
    /* A2 110 / E3 164.81 / A3 220 —— 空五度 + 八度，没有三音，所以"空"。
       不用 A1 55 / E2 82：笔记本喇叭发不出 80Hz 以下。 */
    var spec = [[110.00, 0.030], [164.81, 0.015], [220.00, 0.008]];
    spec.forEach(function (x, i) {
      try {
        var o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = x[0];
        var lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 460;
        var g = ctx.createGain();
        g.gain.value = x[1];

        var lfo = ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 0.031 + i * 0.017;
        var lg = ctx.createGain();
        lg.gain.value = x[1] * 0.42;
        lfo.connect(lg); lg.connect(g.gain);

        o.connect(lp); lp.connect(g); g.connect(musicBus);
        o.start(); lfo.start();
        droneNodes.push(o, lfo);
      } catch (e) { /* 忽略 */ }
    });
  }

  /* 磬：正弦基频 + 2.76 倍非谐泛音（石头振动的比例），余音 4.6s */
  function bell(freq, t, amp) {
    try {
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(amp, t + 0.007);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 4.6);
      g.connect(musicBus);

      var a = ctx.createOscillator();
      a.type = 'sine';
      a.frequency.value = freq;
      a.connect(g);
      a.start(t); a.stop(t + 4.8);

      var b = ctx.createOscillator();
      b.type = 'sine';
      b.frequency.value = freq * 2.76;
      var bg = ctx.createGain();
      bg.gain.value = 0.30;
      b.connect(bg); bg.connect(g);
      b.start(t); b.stop(t + 1.8);
    } catch (e) { /* 忽略 */ }
  }

  /* 埙：正弦打底 + 一点三角波气声，低通 1100，起音 0.42s，4.6Hz 颤音 */
  function clay(freq, t, amp) {
    try {
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(amp, t + 0.42);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.9);
      g.connect(musicBus);

      var lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1100;
      lp.Q.value = 1.2;
      lp.connect(g);

      var o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq;
      o.connect(lp);
      o.start(t); o.stop(t + 3.1);

      var o2 = ctx.createOscillator();
      o2.type = 'triangle';
      o2.frequency.value = freq * 2.004;
      var o2g = ctx.createGain();
      o2g.gain.value = 0.055;
      o2.connect(o2g); o2g.connect(lp);
      o2.start(t); o2.stop(t + 1.4);

      var vib = ctx.createOscillator();
      vib.type = 'sine';
      vib.frequency.value = 4.6;
      var vg = ctx.createGain();
      vg.gain.value = freq * 0.004;
      vib.connect(vg); vg.connect(o.frequency);
      vib.start(t); vib.stop(t + 3.1);
    } catch (e) { /* 忽略 */ }
  }

  function scheduleNote() {
    if (!noteTimer || !ctx || !on) { return; }
    var gap = 3.4 + Math.random() * 6.1;
    var t = ctx.currentTime + 0.25;
    nNote++;

    if (Math.random() < 0.12) {
      /* 空拍：留白比音符更重要 */
    } else if (Math.random() < 0.42) {
      step = Math.max(0, Math.min(BELL.length - 1, step + (Math.random() < 0.45 ? 0 : (Math.random() < 0.62 ? 1 : -1))));
      bell(BELL[step], t, 0.095 + Math.random() * 0.035);
    } else {
      var i = Math.max(0, Math.min(CLAY.length - 1, step + Math.floor(Math.random() * 3) - 1));
      clay(CLAY[i], t, 0.065 + Math.random() * 0.030);
    }
    noteTimer = setTimeout(scheduleNote, gap * 1000);
  }

  function startSynthMusic() {
    if (noteTimer) { return; }
    var c = ensure();
    if (!c) { return; }
    setMaster(VOL_MASTER, 0);
    setMusicGain(VOL_MUSIC, 1.6);
    drone();
    noteTimer = setTimeout(function () { scheduleNote(); }, 2600);
  }

  function stopSynthMusic() {
    if (noteTimer) { clearTimeout(noteTimer); noteTimer = 0; }
    if (!ctx) { return; }
    setMusicGain(0.0001, 0.5);
    droneNodes.forEach(function (o) {
      try { o.stop(ctx.currentTime + 0.6); } catch (e) { /* 已停 */ }
    });
    droneNodes = [];
  }

  /* ------------------------------------------------------------------
     开关
     ------------------------------------------------------------------ */
  function set(v) {
    on = !!v;
    try { App.store.set(KEY, on); } catch (e) { /* 忽略 */ }

    if (offTimer) { clearTimeout(offTimer); offTimer = 0; }

    if (on) {
      if (unlocked) {
        ensure();
        if (master) { setMaster(VOL_MASTER, 0.12); }
        startMusic();
      }
    } else {
      if (master) { setMaster(0, 0.28); }
      stopMusic();
      offTimer = setTimeout(function () { offTimer = 0; stopSynthMusic(); }, 520);
    }
    try { App.emit('sound', on); } catch (e) { /* 忽略 */ }
  }

  function toggle() { set(!on); }

  /* 第一次真实交互：起音乐。Chrome 不允许无手势播放，
     所以必须挂在这个手势里。 */
  function unlock() {
    unlocked = true;
    ensure();
    if (on) { startMusic(); }
  }

  /* ------------------------------------------------------------------
     挂钩：点关卡卡片 / 键盘回车
     ------------------------------------------------------------------ */
  /* 哪些元素算"选中关卡"——
       .lv        选关页的三片甲骨
       .play-card 首页"三步"里的三片
       .pc-go / .pc-title  卡片内部的按钮/标题
       .bo-bead   构件讨伐那 21 关的珠子（未解锁时 disabled，不会触发） */
  function isLevelCard(t) {
    if (!t || !t.closest) { return null; }
    return t.closest('.lv, .play-card, .pc-go, .pc-title, .bo-bead');
  }

  function onPress(e) {
    if (e && e.button != null && e.button !== 0) { return; }
    unlock();
    if (!on) { return; }
    var card = isLevelCard(e.target);
    if (card) {
      /* 还没开放的关卡也用同一个声音：它是"可以点"的，只是点完会告诉你还在筹备 */
      pluck(card.classList.contains('pending') ? 0.7 : 1);
    }
  }

  function onKey(e) {
    if (e.key !== 'Enter' && e.key !== ' ') { return; }
    var card = isLevelCard(e.target);
    if (card && on) { pluck(1); }
  }

  if (document.addEventListener) {
    /* pointerdown 比 click 早，手指按下就有声，不用等导航 */
    document.addEventListener('pointerdown', onPress, true);
    document.addEventListener('keydown', onKey, true);
  }

  /* 切到别的标签页：停，不在后台烧 CPU、也不出声 */
  if (document.addEventListener) {
    document.addEventListener('visibilitychange', function () {
      try {
        if (document.hidden) {
          if (bgm) { bgm.pause(); }
          if (ctx) { ctx.suspend(); }
        } else {
          if (bgm && musicOn && on) { bgm.play(); }
          if (ctx && on && unlocked) { ctx.resume(); }
        }
      } catch (e) { /* 忽略 */ }
    });
  }

  /* 空闲时预热：只建元素、让浏览器把文件读进缓存，**不播放** ——
     创建 <audio> 不属于"自动播放"，所以不违反浏览器的媒体策略，
     但能让第一次点关卡时那一击立刻出来，不用等加载。 */
  if (window.setTimeout) {
    setTimeout(function () { makeBgm(); makePool(); }, 900);
  }


  /* ======================
     区域氛围音（每片一条极轻的循环层）
     ------------------------------------------------------------
     不引入外部素材：用白噪 + 带通 + 慢速 LFO 做出五种"地方"。
       sky   风：宽、慢、带一点空
       land  旷野：低、平
       plant 林：中频、细碎
       beast 荒原：低吼的缓颤
       life  市声：更近、略亮
     进区淡入 1.2s，离区淡出 0.9s；声音开关关闭时整体静音。
     ====================== */
  var AMB = {
    sky:   { f: 620,  q: 0.7, g: 0.030, lfo: 0.07, lfoAmt: 220 },
    land:  { f: 380,  q: 0.6, g: 0.028, lfo: 0.05, lfoAmt: 90 },
    plant: { f: 1500, q: 1.1, g: 0.024, lfo: 0.13, lfoAmt: 520 },
    beast: { f: 260,  q: 0.9, g: 0.030, lfo: 0.09, lfoAmt: 70 },
    life:  { f: 980,  q: 0.8, g: 0.026, lfo: 0.11, lfoAmt: 300 }
  };
  var ambNodes = null, ambId = null, ambTimer = 0;

  function stopAmbient(sec) {
    var n = ambNodes;
    ambNodes = null; ambId = null;
    if (!n) { return; }
    try {
      var t = ctx.currentTime;
      n.gain.gain.cancelScheduledValues(t);
      n.gain.gain.setValueAtTime(n.gain.gain.value, t);
      n.gain.gain.linearRampToValueAtTime(0.0001, t + (sec || 0.9));
      setTimeout(function () {
        try { n.src.stop(); } catch (e) {}
        try { n.lfo.stop(); } catch (e) {}
      }, Math.ceil((sec || 0.9) * 1000) + 120);
    } catch (e) { /* 忽略 */ }
  }

  function startAmbient(id) {
    var cfg = AMB[id];
    if (!cfg || !on) { return; }
    var c = ensure();
    if (!c) { return; }
    if (ambId === id && ambNodes) { return; }
    stopAmbient(0.6);
    try {
      var src = c.createBufferSource();
      src.buffer = noiseBuf;
      src.loop = true;

      var bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = cfg.f;
      bp.Q.value = cfg.q;

      var gain = c.createGain();
      gain.gain.value = 0.0001;

      var lfo = c.createOscillator();
      var lfoGain = c.createGain();
      lfo.frequency.value = cfg.lfo;
      lfoGain.gain.value = cfg.lfoAmt;
      lfo.connect(lfoGain);
      lfoGain.connect(bp.frequency);

      src.connect(bp); bp.connect(gain); gain.connect(sfxBus);
      src.start(); lfo.start();

      var t = c.currentTime;
      gain.gain.linearRampToValueAtTime(cfg.g, t + 1.2);

      ambNodes = { src: src, gain: gain, lfo: lfo };
      ambId = id;
    } catch (e) { /* 忽略 */ }
  }

  App.sound = {
    on: function () { return on; },
    set: set,
    toggle: toggle,
    unlock: unlock,
    pluck: pluck,

    /* 设置页"试听"用：拨一下骨板（音乐若还没起，这一次手势会把它带起来） */
    demo: function () {
      unlock();
      pluck(1);
    },

    /* 自动化核验用：不参与界面 */
    _state: function () {
      return {
        on: on,
        unlocked: unlocked,
        mode: bgmBroken ? (ctx ? 'synth' : 'none') : (bgm ? 'file' : 'pending'),
        bgm: bgm ? (bgm.paused ? 'paused' : 'playing') : 'none',
        /* currentTime 会不会走，是"真的在播"最硬的证据 */
        t: bgm ? +bgm.currentTime.toFixed(2) : -1,
        vol: bgm ? +bgm.volume.toFixed(3) : -1,
        err: (bgmBroken ? 'bgm ' : '') + (sfxBroken ? 'sfx' : ''),
        plucks: nPluck,
        /* 骨板那一声有没有真的播出去：池子里最靠前的播放进度 */
        sfxT: pool.length ? +Math.max.apply(null, pool.map(function (x) { return x.currentTime; })).toFixed(2) : -1,
        sfxVol: pool.length ? +pool[0].volume.toFixed(2) : -1,
        notes: nNote
      };
    }
  };

  /* 氛围音挂在 App.sound 建好之后（否则前面赋值会打到 undefined） */
  App.sound.ambient = function (id) {
    if (!id) { stopAmbient(); return; }
    if (!on) { return; }
    startAmbient(id);
  };
  App.sound.ambientStop = function () { stopAmbient(); };

})(window.App = window.App || {});
