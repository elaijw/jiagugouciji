/* ============================================================
   甲骨奇谭 · 3D 博物馆 / 界面与路由层
   ------------------------------------------------------------
   职责：
     · 提供 #/museum 场景（壳层 scene() 由 shell.js 调用）
     · 按需注入 Three.js，失败则退成平面展厅（绝不白屏）
     · 展签 / 导览 / 展区切换 / 典藏，全部用现有数据与现有路由
     · 离开路由时释放 3D 资源

   不做什么：
     · 不新建存档体系 —— 只额外记一条"看过哪些展品"，进度仍走 App.atlas / App.store 原有键
     · 不改任何玩法判定 —— 造字、王邑、讨伐都跳到原页面
   ============================================================ */
(function (App) {
  'use strict';

  var THREE_SRC = 'vendor/three.min.js';
  var STORE_KEY = 'museum';

  /* 展区：3D 里的七个区与这里一一对应（id 必须和 museum3d.js 的 GROUPS 一致）。
     href 只作"去正式关卡"的出口，不再作为点门的默认行为 —— 门后面现在都有自己的 3D 屋子。 */
  var ZONES = [
    /* 文明序厅与甲骨文展厅合并：一个「甲骨文知识厅」。
       序厅的内容（甲骨是什么 / 灼骨 / 兆纹）改成厅里一块说明碑，点开就是原来那个面板。 */
    { id: 'gallery',    name: '甲骨文知识厅', glyph: '日', note: '四段陈列：卜材 · 卜辞 · 文字 · 发现' },
    { id: 'build',      name: '造字探索区', glyph: '木', note: '把两个构件搬上台面', href: '#/play/bone-build' },
    { id: 'excavate',   name: '浮空骨片区', glyph: '山', note: '六片骨，点开长出来', href: '#/play/bone-float' },
    { id: 'boss',       name: '守字之骨区', glyph: '戈', note: '拆构件 · 断笔画 · 补古句', href: '#/play/boss-3d' },
    { id: 'collection', name: '我的典藏区', glyph: '贝', note: '观过的展、认过的字' }
  ];

  /* 会话状态。同一时刻只会有一个展馆实例。 */
  var S = {
    wrap: null, stage: null, panel: null, api: null,
    ready: false, alive: false, area: 'hall',
    seen: {}, selected: null, off: null, quest: 0, low: false
  };

  function zoneById(id) {
    for (var i = 0; i < ZONES.length; i++) { if (ZONES[i].id === id) return ZONES[i]; }
    return null;
  }

  /* ---------- 观展记录（唯一新增的存储键） ---------- */
  function readSeen() {
    var v = App.store.get(STORE_KEY, null);
    return (v && v.seen && typeof v.seen === 'object') ? v.seen : {};
  }
  function writeSeen() {
    App.store.set(STORE_KEY, { seen: S.seen, v: 1 });
  }
  function markSeen(ch) {
    if (!ch) { return false; }
    if (S.seen[ch]) { return false; }
    S.seen[ch] = Date.now();
    writeSeen();
    paintProgress();
    /* 典藏柜里对应的龛立刻亮起来 —— 3D 里的进度不是一句文字 */
    if (S.api && S.api.refresh) { try { S.api.refresh(); } catch (e) {} }
    return true;
  }
  function seenCount() { return Object.keys(S.seen).length; }

  /* ---------- 取真实资料（一条也不编） ---------- */
  function poolEntry(ch) {
    var pool = (App.data && App.data.BUILTIN_POOL) || [];
    for (var i = 0; i < pool.length; i++) { if (pool[i].g === ch) { return pool[i]; } }
    return null;
  }
  function zoneObject(ch) {
    var zones = (App.levels && App.levels.map && App.levels.map.zones) || [];
    for (var i = 0; i < zones.length; i++) {
      var objs = zones[i].objects || [];
      for (var j = 0; j < objs.length; j++) {
        if (objs[j].char === ch) {
          return { zone: zones[i].name, note: zones[i].note || '', meaning: objs[j].meaning || '' };
        }
      }
    }
    return null;
  }
  function glyphMeta(ch) {
    return (App.glyphs && App.glyphs.parts) ? App.glyphs.parts[ch] : null;
  }
  /* 真甲骨字形的 SVG 节点（复用壳层已有的约定：没有字形就不画） */
  function glyphNode(ch, cls) {
    if (!App.hasGlyph || !App.hasGlyph(ch)) { return null; }
    var sv = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    sv.setAttribute('viewBox', '0 0 100 100');
    sv.setAttribute('class', cls || 'mu-obglyph');
    sv.setAttribute('role', 'img');
    sv.setAttribute('aria-label', '甲骨文「' + ch + '」');
    sv.innerHTML = App.glyphSvg(ch, 'currentColor');
    return sv;
  }

  /* ---------- 按需注入 Three.js ----------
     首页不该为一个 600KB 的库付代价：只有真的走到 #/museum 才加载。
     file:// 下用传统 script 注入，不走 import（模块会被 CORS 拦）。 */
  /* 同 world3d.js：three.min.js 594 KB，GitHub Pages 国内实测 10~60 秒且常被掐断，
     旧逻辑 12 秒硬超时 → 线上展馆打不开。改为 45 秒 + 重试 2 次（重试加时间戳破缓存）。 */
  var LOAD_TIMEOUT = 45000, LOAD_TRIES = 2;

  function loadThree(done, tries) {
    if (window.THREE) { done(null); return; }
    tries = tries || 0;
    var s = document.createElement('script');
    var finished = false;
    var timer = setTimeout(function () {
      if (finished) { return; }
      finished = true;
      if (tries < LOAD_TRIES) { retry(); } else { done(new Error('加载超时')); }
    }, LOAD_TIMEOUT);
    function retry() {
      clearTimeout(timer);
      s.onload = s.onerror = null;
      setTimeout(function () { loadThree(done, tries + 1); }, 600);
    }
    s.src = THREE_SRC + (tries ? '?retry=' + Date.now() : '');
    s.async = true;
    s.onload = function () {
      if (finished) { return; }
      finished = true;
      clearTimeout(timer);
      done(window.THREE ? null : new Error('THREE 未就绪'));
    };
    s.onerror = function () {
      if (finished) { return; }
      finished = true;
      clearTimeout(timer);
      if (tries < LOAD_TRIES) { retry(); } else { done(new Error('脚本加载失败')); }
    };
    document.head.appendChild(s);
  }

  /* ---------- 场景外壳 ---------- */
  function scene() {
    /* 同一个 hash 里改子路径（#/museum → #/museum/excavate）、或者浏览器前进后退
       回到展馆时，壳层会再调一次 scene()。这时旧实例还活着：先拆干净再建，
       否则 S 是共用的，两套实例会互相覆盖（表现是"进了区又退回大厅"）。 */
    if (S.alive) { teardown(); }
    S.seen = readSeen();
    /* 3D 典藏柜要读这份"看过哪些"，所以把同一个对象交给场景层 */
    if (App.museum) { App.museum._seen = S.seen; }
    S.ready = false;
    S.area = 'hall';
    S.selected = null;
    S.alive = true;

    /* 站点自己的古筝 BGM 让路：馆里有自己的环境音，两首一起放就是噪音。
       只是暂挂，不写存档 —— 出馆时 App.sound.resume() 原样还回去。 */
    if (App.sound && App.sound.suspend) { App.sound.suspend(); }

    var wrap = App.el('div', 'mu-scene');
    wrap.setAttribute('data-area', 'hall');
    S.wrap = wrap;

    /* 3D 挂载点。加载期间先铺一层墨底 + 一行字，永远不会有白屏。 */
    var stage = App.el('div', 'mu-stage');
    stage.id = 'muStage';
    wrap.appendChild(stage);
    S.stage = stage;

    wrap.appendChild(App.el('div', 'mu-vignette'));

    /* ---------- 顶栏 ----------
       展馆就是首页，所以这里没有"退出去"的地方：
       左上是馆徽（不可点），中间是当前展区名，右边是馆内操作。 */
    var bar = App.el('header', 'mu-bar');
    var brand = App.el('div', 'mu-back');
    brand.setAttribute('aria-hidden', 'true');
    brand.appendChild(App.el('span', 'mu-back-ic', '甲'));
    brand.appendChild(App.el('span', 'mu-back-tx', '甲骨奇谭'));
    bar.appendChild(brand);

    var mid = App.el('div', 'mu-bar-mid');
    mid.appendChild(App.el('span', 'mu-bar-kicker', '数字博物馆'));
    /* 名字随展区变。展馆是首页之后，顶栏就是"你现在在哪"的唯一交代。 */
    var barName = App.el('span', 'mu-bar-name', '第一展厅');
    S.barName = barName;
    mid.appendChild(barName);
    bar.appendChild(mid);

    var right = App.el('div', 'mu-bar-right');
    var prog = App.el('span', 'mu-prog');
    prog.id = 'muProg';
    right.appendChild(prog);

    var btnSpot = App.el('button', 'mu-btn mu-btn-spot', '聚光');
    btnSpot.type = 'button';
    btnSpot.setAttribute('aria-pressed', 'true');
    btnSpot.onclick = function () {
      if (!S.api || !S.api.toggleSpots) { return; }
      var on = S.api.toggleSpots();
      btnSpot.classList.toggle('is-off', !on);
      btnSpot.setAttribute('aria-pressed', on ? 'true' : 'false');
    };
    right.appendChild(btnSpot);

    /* 导览：一张清单 + 实时统计，点一项就飞过去 */
    var btnIndex = App.el('button', 'mu-btn mu-btn-index', '导览');
    btnIndex.type = 'button';
    btnIndex.title = '展品清单与实时统计';
    btnIndex.onclick = function () { openIndex(''); };
    right.appendChild(btnIndex);

    /* 声音：跟随站点总开关（用户关过就关着），馆里放的是那首古筝。
       ------------------------------------------------------------
       这一颗和关卡里那颗「♪ 声音」是**同一个状态**：
         · 画的时候读实时状态 isOn()，不再读存档 preferOn() ——
           存档说"开"但 AudioContext 还没起来时，按钮会撒谎写"声音 开"，
           点下去却什么也没变，这就是之前那个"开关不对"。
         · 两边都订 museumAudio.onChange，谁改的，另一边立刻跟着重画。 */
    var btnAudio = App.el('button', 'mu-btn mu-btn-audio', '声音');
    btnAudio.type = 'button';
    btnAudio.setAttribute('aria-pressed', 'false');
    btnAudio.title = '展馆声音（古筝 · 环境音 · 战斗音乐 · 音效）';
    function paintAudio(on) {
      on = !!on;
      btnAudio.classList.toggle('is-off', !on);
      btnAudio.setAttribute('aria-pressed', on ? 'true' : 'false');
      btnAudio.textContent = on ? '声音 开' : '声音';
      btnAudio.title = on ? '点此关闭展馆声音' : '点此打开展馆声音';
    }
    paintAudio(App.museumAudio && App.museumAudio.isOn && App.museumAudio.isOn());
    if (App.museumAudio && App.museumAudio.onChange) {
      S.offAudio = App.museumAudio.onChange(paintAudio);
    } else {
      S.offAudio = null;
    }
    btnAudio.onclick = function () {
      if (!App.museumAudio) { return; }
      var on = App.museumAudio.toggle();
      /* onChange 会重画，这里只管声音本身 */
      if (on) { App.museumAudio.click(); }
    };
    right.appendChild(btnAudio);

    /* 上次在馆里是开着声音的：按钮照实写"关"（因为还没真的响），
       等用户下一次按下鼠标/触摸，在同一个手势里把 AudioContext 起起来。
       浏览器不允许无手势开音频，所以只能这样"预告 + 补上"。

       ⚠ 这一下**必须避开声音按钮自己**：
       pointerdown 比 click 早，如果用户点的正是「声音」，
       这里先替他把声音打开，按钮的 click 再 toggle 一次 → 又关回去了。
       （就是这个顺序让"点一下没反应/点了反而关掉"。） */
    if (App.museumAudio && App.museumAudio.preferOn && App.museumAudio.preferOn() &&
        !(App.museumAudio.isOn && App.museumAudio.isOn())) {
      var isSndUI = function (t) {
        try {
          return !!(t && t.closest && t.closest('.mu-btn-audio, .mu-play-snd'));
        } catch (e) { return false; }
      };
      var armAudio = function (ev) {
        /* 点在声音按钮上：让它自己的 click 决定，别抢 */
        if (isSndUI(ev && ev.target)) { return; }
        document.removeEventListener('pointerdown', armAudio, true);
        document.removeEventListener('keydown', armAudio, true);
        S.armAudio = null;
        if (!App.museumAudio.isOn || App.museumAudio.isOn()) { return; }
        App.museumAudio.setOn(true);
      };
      S.armAudio = armAudio;
      document.addEventListener('pointerdown', armAudio, true);
      document.addEventListener('keydown', armAudio, true);
    }

    var btnReset = App.el('button', 'mu-btn', '重置视角');
    btnReset.type = 'button';
    btnReset.onclick = function () { if (S.api) { S.api.resetView(); } };
    right.appendChild(btnReset);

    var btnHall = App.el('button', 'mu-btn mu-btn-hall', '返回大厅');
    btnHall.type = 'button';
    btnHall.onclick = function () { goHall(); };
    right.appendChild(btnHall);

    /* 王邑 3D 已舍弃（顶栏那道"出城"的门随之撤掉）。
       第二关改走浮空骨片，出口并入底部展区与任务条。 */
    bar.appendChild(right);
    wrap.appendChild(bar);

    /* ---------- 底部展区导览 ---------- */
    var dock = App.el('nav', 'mu-dock');
    dock.setAttribute('aria-label', '展区导览');
    ZONES.forEach(function (z) {
      var b = App.el('button', 'mu-chip');
      b.type = 'button';
      b.setAttribute('data-zone', z.id);
      var ic = glyphNode(z.glyph, 'mu-chip-glyph');
      if (ic) { b.appendChild(ic); } else { b.appendChild(App.el('span', 'mu-chip-glyph', z.glyph)); }
      b.appendChild(App.el('span', 'mu-chip-name', z.name));
      b.onclick = function () { enterZone(z.id); };
      dock.appendChild(b);
    });
    wrap.appendChild(dock);
    S.dock = dock;

    /* ---------- 今日所得（典藏区专用 HUD） ----------
       三关的进度收在 App.progress 里；进了典藏区就在这显示一行，
       不用弹窗、不打断看柜子。 */
    var sum = App.el('div', 'mu-sum');
    sum.id = 'muSum';
    sum.hidden = true;
    wrap.appendChild(sum);
    S.sum = sum;
    /* 导览条是居中一整条，宽窄会随窗口变（手机折成两行），
       所以底部这几个浮层的位置不写死像素，改成量出来的 --stack-h。 */
    window.addEventListener('resize', syncStack);

    /* ---------- 展区任务条 ----------
       3D 里的进度（拼了几个构件 / 挖出几片 / 拆掉几个部件）
       在这里显示。它是 HUD，不是弹窗：不挡视线，也不打断观察。 */
    var task = App.el('div', 'mu-task');
    task.id = 'muTask';
    task.hidden = true;
    var taskK = App.el('span', 'mu-task-k', '');
    var taskTx = App.el('span', 'mu-task-tx', '');
    var taskN = App.el('span', 'mu-task-n', '');
    var taskAgain = App.el('button', 'mu-btn mu-task-again', '重来');
    taskAgain.type = 'button';
    taskAgain.onclick = function () { resetCurrent(); };
    var taskGo = App.el('a', 'mu-btn mu-task-go', '正式关卡');
    taskGo.href = '#/play/bone-build';
    task.appendChild(taskK);
    task.appendChild(taskTx);
    task.appendChild(taskN);
    task.appendChild(taskAgain);
    task.appendChild(taskGo);
    wrap.appendChild(task);
    S.task = task;
    S.taskK = taskK; S.taskTx = taskTx; S.taskN = taskN;
    S.taskAgain = taskAgain; S.taskGo = taskGo;

    /* ---------- 操作提示 ---------- */
    var hint = App.el('div', 'mu-hint');
    hint.appendChild(App.el('span', 'mu-hint-k', '拖拽'));
    hint.appendChild(App.el('span', null, '旋转视角'));
    hint.appendChild(App.el('span', 'mu-hint-k', '滚轮'));
    hint.appendChild(App.el('span', null, '缩放'));
    hint.appendChild(App.el('span', 'mu-hint-k', '点击'));
    hint.appendChild(App.el('span', null, '看展品'));
    wrap.appendChild(hint);
    S.hint = hint;
    S.hintHTML = hint.innerHTML;

    /* ---------- 龟宝 ---------- */
    var guide = App.el('aside', 'mu-guide');
    guide.setAttribute('aria-live', 'polite');
    var gimg = App.el('img', 'mu-guide-img');
    gimg.src = 'assets/guibao-front.png';
    gimg.alt = '龟宝，馆内导览';
    guide.appendChild(gimg);
    var gb = App.el('button', 'mu-guide-bubble');
    gb.type = 'button';
    var gname = App.el('b', 'mu-guide-name', '龟宝');
    var gtext = App.el('span', 'mu-guide-text', '');
    gb.appendChild(gname);
    gb.appendChild(gtext);
    gb.onclick = function () { nextGuide(); };
    guide.appendChild(gb);
    wrap.appendChild(guide);
    S.guideText = gtext;

    /* ---------- 展签面板 ---------- */
    var panel = App.el('aside', 'mu-panel');
    panel.id = 'muPanel';
    panel.setAttribute('aria-hidden', 'true');
    wrap.appendChild(panel);
    S.panel = panel;

    /* ---------- 加载层 ---------- */
    var load = App.el('div', 'mu-loading');
    load.id = 'muLoading';
    var ring = App.el('div', 'mu-load-ring');
    load.appendChild(ring);
    load.appendChild(App.el('p', 'mu-load-tx', '正在布展…'));
    load.appendChild(App.el('p', 'mu-load-sub', '首次进入要准备展厅与十二件骨版'));
    wrap.appendChild(load);
    S.loading = load;

    document.body.classList.add('mu-lock');

    /* Esc 关展签：键盘用户不用去够右上角那个叉 */
    S.onKey = function (e) {
      if (e.key === 'Escape' || e.keyCode === 27) {
        if (S.panel && S.panel.getAttribute('aria-hidden') === 'false') { closePanel(); }
      }
    };
    document.addEventListener('keydown', S.onKey);

    /* 从馆里点"去正式关卡"时记下当时在哪个区：
       玩完按"回馆"回到那间屋子，而不是把人丢回穿堂。
       用捕获阶段 + closest，展签、任务条、区里的按钮三种出口都盖到。 */
    App.museum._zone = '';
    S.onLeave = function (e) {
      var t = e.target;
      var a = t && t.closest ? t.closest('a[href^="#/play/"]') : null;
      if (a) { App.museum._zone = S.area; }
    };
    document.addEventListener('click', S.onLeave, true);

    /* 离开路由即释放；不依赖 shell 的清理时机 */
    if (!S.off && App.on) {
      S.off = App.on('route', function (r) {
        if (!r || r.name !== 'museum') { teardown(); }
      });
    }

    /* 等壳层把节点接进文档再初始化：canvas 需要有尺寸 */
    requestAnimationFrame(function () {
      if (!S.alive) { return; }
      boot();
    });

    paintProgress();
    var sub = (App.router && App.router.current) ? App.router.current().params.id : '';
    /* #/museum/<区> 直接落在那个区（也让"玩完回馆"能回到刚才那间屋子） */
    S.pending = (sub && (sub === 'hall' || zoneById(sub))) ? sub : '';
    say('馆里没有人，就我们两个。六个门，你想先去哪一处？');
    return wrap;
  }

  /* ---------- 启动 ---------- */
  function boot() {
    if (!App.museum3d || !App.museum3d.supported()) {
      toFallback('这台设备没开 WebGL', '3D 展厅需要浏览器的图形能力。下面的平面展厅一样能看展、能进玩法。');
      return;
    }
    /* 低性能设备：关阴影、关抗锯齿、像素比压到 1 */
    var cores = navigator.hardwareConcurrency || 4;
    var mem = navigator.deviceMemory || 4;
    S.low = cores <= 4 || mem <= 2 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    loadThree(function (err) {
      if (!S.alive) { return; }
      if (err) {
        toFallback('3D 组件没有加载成功', '可能是网络或本地文件被拦。平面展厅照常可用。');
        return;
      }
      try {
        S.api = App.museum3d.create(S.stage, {
          low: S.low,
          onReady: onReady,
          onPick: onPick,
          onHover: onHover
        });
      } catch (e) {
        if (window.console && console.error) { console.error('[博物馆] 3D 初始化失败', e); }
        toFallback('3D 初始化失败', '图形上下文没能建立。已切换到平面展厅，功能不受影响。');
        /* 把原因留在页面上（自查时不用开控制台也能看见） */
        if (S.stage) { S.stage.setAttribute('data-err', (e && (e.stack || e.message)) || String(e)); }
      }
    });
  }

  function onReady() {
    if (!S.alive) { return; }
    S.ready = true;
    S.wrap.setAttribute('data-ready', '1');
    if (S.loading) {
      S.loading.classList.add('is-off');
      setTimeout(function () {
        if (S.loading && S.loading.parentNode) { S.loading.parentNode.removeChild(S.loading); }
      }, 520);
    }
    var hint = S.wrap.querySelector('.mu-hint');
    if (hint) { setTimeout(function () { hint.classList.add('is-fade'); }, 6000); }
    if (S.pending) { var pz = S.pending; S.pending = ''; enterZone(pz); }
    updateTask();
    syncStack();
  }

  /* ---------- 交互回调 ---------- */
  function onHover(kind) {
    if (!S.wrap) { return; }
    S.wrap.classList.toggle('is-hot', !!kind);
  }

  function onPick(hit) {
    if (!hit) { return; }
    if (App.museumAudio && (hit.type === 'exhibit' || hit.type === 'hero')) {
      App.museumAudio.click();
    }
    if (hit.type === 'back') {
      say('回主馆。');
      goHall();
      return;
    }
    if (hit.type === 'portal') { enterZone(hit.zone); return; }
    if (hit.type === 'hero') { openExhibit(hit.char || '卜', true); return; }
    if (hit.type === 'exhibit') { openExhibit(hit.char, false); return; }
    if (hit.type === 'tablet') { openTablet(); return; }
    if (hit.type === 'stele') { openPrologue(); return; }
    if (hit.type === 'prologue') { openPrologue(); return; }
    if (hit.type === 'board') { openBoard(hit.topic); return; }
    if (hit.type === 'plastron') { openPlastron(); return; }
    if (hit.type === 'case') { openExhibit('鼎', false); return; }
    if (hit.type === 'slot') { openExhibit(hit.char, false); return; }
    if (hit.type === 'bossface') { pickBossFace(hit); return; }
    if (hit.type === 'bosspart') { pickBossPart(hit); return; }
    if (hit.type === 'bosscore') {
      say('这是「戈」。左边名录里点一尊，把它的构件一件件拆下来看。');
      return;
    }
    if (hit.type === 'build') { pickBlock(hit); return; }
    if (hit.type === 'build-work') {
      say('这是要刻的骨。旁边的方块是构件 —— 挑两块，摆上去看能不能成字。');
      return;
    }
    if (hit.type === 'dig') { pickDig(hit); return; }
    if (hit.type === 'frag') { say('「' + hit.char + '」露出来了，可以点它看展签。'); return; }
    if (hit.type === 'heat') {
      say('灼了。看那道裂纹 —— 兆就是这么来的，吉凶从这儿读。');
      if (App.museumAudio) { App.museumAudio.click(); }
      return;
    }
  }

  /* ---------- 造字区 ---------- */
  function pickBlock(hit) {
    var r = hit.r;
    if (!r) { return; }
    if (App.museumAudio) { App.museumAudio.part(); }
    updateTask();
    if (r.kind === 'build-ok') {
      if (App.museumAudio) { App.museumAudio.good(); }
      say('成了 —— 「' + r.word.g + '」' + (r.word.mean ? '，' + r.word.mean : '') +
        '。骨上这两道，就是它的构件。');
      openBuildDone(r.word);
      return;
    }
    if (r.kind === 'build-no') {
      say('这两块凑不成一个字。这一件要的是「' + r.word.mean + '」—— 再挑一块试试。');
      return;
    }
    if (r.kind === 'build-tap') {
      say(r.picks && r.picks.length
        ? '摆上「' + r.picks.join('、') + '」了，再挑一块。'
        : '拿下来了。');
    }
  }

  /* ---------- 考古区 ---------- */
  function pickDig(hit) {
    var r = hit.r;
    if (!r) { return; }
    updateTask();
    if (r.kind === 'dig-find') {
      if (App.museumAudio) { App.museumAudio.good(); }
      say('出土了「' + r.char + '」。　' + r.found + ' / ' + r.total);
      if (r.found >= r.total) { setTimeout(openDigDone, 280); }
      return;
    }
    if (r.kind === 'dig-empty') {
      say('这一格下面只有土。　' + r.found + ' / ' + r.total);
      return;
    }
    if (r.kind === 'dig-same') { say('这一格已经挖过了。'); }
  }

  /* ---------- BOSS 区 ---------- */
  function pickBossFace(hit) {
    if (!hit.r) { return; }
    var e = hit.r.entry;
    var n = hit.r.parts;
    say('「' + (e.alt || e.char) + '」。' + (e.form || '') + '　它由 ' + n + ' 个构件组成 —— 一件件拆掉。');
    updateTask();
    openBossFace(e);
  }

  function pickBossPart(hit) {
    var r = hit.r;
    if (!r) { return; }
    if (App.museumAudio) { App.museumAudio.part(); }
    updateTask();
    if (r.broken >= r.total) {
      if (App.museumAudio) { App.museumAudio.good(); }
      say(r.total + ' 个构件都拆下来了 —— 这个字被拆开之后，反而看得更清楚。');
      return;
    }
    say('拆掉「' + r.name + '」。还剩 ' + (r.total - r.broken) + ' 件。');
  }

  /* 顶栏显示的当前展区。hall 不在 ZONES 里（它不是展厅，是穿堂），单列。 */
  function setBarName(id) {
    if (!S.barName) { return; }
    var z = zoneById(id);
    S.barName.textContent = z ? z.name : '第一展厅';
  }

  /* 地址栏跟着展区走：#/museum/excavate。
     用 replaceState 而不是改 location.hash —— 后者会触发 hashchange，
     整座馆会被卸载重建，等于每进一个区就重开一次。 */
  function syncHash(id) {
    try {
      var h = (id && id !== 'hall') ? '#/museum/' + id : '#/museum';
      if (location.hash !== h) { history.replaceState(null, '', h); }
    } catch (e) {}
  }

  /* 量一次底部浮层占掉的高度，写进 --stack-h。
     龟宝气泡据此抬高，永远不会压在导览条或任务条上。 */
  function syncStack() {
    if (!S.wrap || !S.dock) { return; }
    var base = parseFloat(window.getComputedStyle(S.dock).bottom) || 0;
    var h = base + S.dock.offsetHeight;
    if (S.task && !S.task.hidden) { h += 6 + S.task.offsetHeight; }
    S.wrap.style.setProperty('--stack-h', Math.round(h) + 'px');
  }

  /* ============================================================
     馆内玩法层（博物馆 = 外壳，玩法在馆里开）
     ------------------------------------------------------------
     以前每个玩法是一个独立页面 #/play/xxx，从馆里点进去等于"离开博物馆"。
     现在改成馆内全屏嵌入：上方一条「← 回馆 / 重开」，下面是玩法本体。
     玩法模块本身不改（mount/unmount 原样复用）。
     ============================================================ */
  function openPlay(id, title) {
    closePlay();
    var mode = App.modes && App.modes.get ? App.modes.get(id) : null;
    if (!mode || !mode.mount) {
      location.hash = '#/play/' + id;   /* 兜底：玩法没注册就走老路由 */
      return;
    }
    /* 玩法模块自己就是一层全屏（.bsp-root / .bd3-root，z-index 400），
       并且自带「← 回馆」「重开」。所以这里只放一层不拦事件的占位，
       z-index 必须低于 400 —— 第一版设成 600，玩法整个被压在黑底下面。 */
    var ov = App.el('div', 'mu-play');
    ov.id = 'muPlay';
    ov.setAttribute('data-mode', id);
    var host = App.el('div', 'mu-play-host');
    ov.appendChild(host);

    /* 馆自己的出口：玩法自带的「回馆」写在 location.hash 上，而 hash 本来就是
       #/museum，不触发 hashchange → 会卡死。hookBack() 会接管玩法自带的按钮，
       这一颗是兜底：真被挡住了也还能出来。 */
    var exit = App.el('button', 'mu-play-exit', '← 回馆');
    exit.type = 'button';
    exit.onclick = closePlay;
    /* 先藏起来：多数玩法自己顶栏就带「回馆」，hookBack 一次就认出来了。
       等两秒还没找到，才把馆这颗兜底的亮出来（那时多半是玩法挂了）。 */
    exit.style.display = 'none';

    /* 玩关卡时馆里的顶栏是藏着的，声音开关跟着一起藏了 ——
       这里补一颗，进了关卡也能把声音打开（战斗音乐随之起） */
    var snd = App.el('button', 'mu-play-exit mu-play-snd', '♪ 声音');
    snd.type = 'button';
    function paintSnd() {
      var on = !!(App.museumAudio && App.museumAudio.isOn && App.museumAudio.isOn());
      snd.textContent = on ? '♪ 声音 开' : '♪ 声音';
      snd.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    paintSnd();
    /* 和馆顶栏那颗共用状态：顶栏关掉、这颗也得变，反之亦然 */
    var offSnd = (App.museumAudio && App.museumAudio.onChange)
      ? App.museumAudio.onChange(paintSnd) : null;
    snd.onclick = function () {
      if (!App.museumAudio) { return; }
      var on = App.museumAudio.toggle();
      /* 关掉：战斗音乐跟着停（音效自己会静音）；打开：战斗音乐从当前阶段接上 */
      if (on) {
        App.museumAudio.click();
        var ph = (App.boss3d && App.boss3d._S && App.boss3d._S.phase) || 1;
        if (App.battleMusic && App.battleMusic.start) { App.battleMusic.start(ph); }
      } else if (App.battleMusic) {
        App.battleMusic.stop(0.4);
      }
    };

    /* 战斗音乐有自己的低频，展厅的环境音垫这时候要让路。
       第二关（骨片浮空）没有自己的音乐，环境音留着当底，不要压。 */
    if (id === 'boss-3d' && App.museumAudio && App.museumAudio.duck) {
      App.museumAudio.duck(true);
    }

    document.body.appendChild(ov);
    document.body.classList.add('mu-play-lock');
    /* ⚠ 这两颗浮动按钮必须挂在 body 上，不能挂进 ov。
       .mu-play 自己 position:fixed + z-index:350 就形成了一个层叠上下文，
       子元素写 z-index:900 也只在 350 这一层里比较 —— 而玩法那层是 400。
       以前它们就挂错了地方：在页面里拿不到、点不到（elementFromPoint 命中的是
       玩法自己的覆盖层），「声音」开关于是一整局都按不着。 */
    document.body.appendChild(exit);
    document.body.appendChild(snd);
    S.play = { id: id, ov: ov, mode: mode, host: host, sndOff: offSnd,
               floats: [exit, snd] };
    try {
      mode.mount(host, App.modes.buildContext(mode));
      S.play.shown = true;
      /* 玩法的顶栏要等 three.js 加载完才建出来，这里轮询几秒接管「回馆」。
         否则从馆里打开时 hash 本来就是 #/museum，点回馆不触发 hashchange，出不去。 */
      /* 判定形态：如果玩法自己挂了一层 fixed 全屏（3D 系），我们就缩成占位；
         否则（2D 系，内容渲染进 host）把嵌入层变成不透明外壳。 */
      var layered = false;
      [].forEach.call(document.body.children, function (el2) {
        if (el2 === ov || !el2.style) { return; }
        var cs = window.getComputedStyle(el2);
        if (cs.position === 'fixed' && parseInt(cs.zIndex || '0', 10) >= 400) { layered = true; }
      });
      if (!layered) {
        ov.classList.add('mu-play-solid');
      } else {
        ov.classList.remove('mu-play-solid');
      }

      /* 「回馆」统一接管（事件委托）
         ------------------------------------------------------------
         玩法自带的出口写法并不统一：第三关是 <button>，第二关是 <div>。
         原来只给 button/a 改 onclick，第二关那颗 <div> 根本没被认领过 ——
         点它把 location.hash 设成 '#/museum'，而 hash 本来就是它，
         不触发 hashchange，于是卡在原地，只能靠馆这颗兜底的出去。
         改成在 document 上截获：谁的文字是「回馆」都算，点了一律 closePlay。
         —— 这样两种写法都出得去，也就不用留两颗一样的按钮。 */
      var findBack = function (t) {
        for (var n = t; n && n !== document.body; n = n.parentNode) {
          if (n.nodeType !== 1) { continue; }
          var txt = (n.textContent || '').trim();
          if (txt.length <= 6 && /^[←\s]*回\s*馆$/.test(txt)) { return n; }
        }
        return null;
      };
      var onBack = function (ev) {
        var b = findBack(ev.target);
        if (!b) { return; }
        /* 只接管玩法的根节点里面的（别把馆自己的按钮也拦了） */
        if (!(host.contains(b) || (b.closest && b.closest('.bsp-root, .bd3-root')))) { return; }
        ev.preventDefault();
        ev.stopPropagation();
        closePlay();
      };
      document.addEventListener('click', onBack, true);
      S.play.onBack = onBack;

      var tries = 0, found = 0;
      (function hookBack() {
        /* 只做一件事：认出玩法"自带"的出口，认出后把馆这颗兜底的收起来 */
        var roots = [document.querySelector('.bsp-root'), document.querySelector('.bd3-root'), host];
        roots.forEach(function (root) {
          if (!root || root.contains(exit)) { return; }
          [].forEach.call(root.querySelectorAll('button, a, div, span'), function (b) {
            if (b.dataset && b.dataset.muBack) { return; }
            var txt = (b.textContent || '').trim();
            if (txt.length > 6 || !/^[←\s]*回\s*馆$/.test(txt)) { return; }
            if (b.dataset) { b.dataset.muBack = '1'; }
            found++;
          });
        });
        if (found && exit.parentNode) { exit.parentNode.removeChild(exit); }
        /* 一直没有可接管的出口：把兜底那颗亮出来，别让人出不去 */
        else if (!found && tries >= 3 && exit.parentNode) { exit.style.display = ''; }
        if (++tries < 12) { setTimeout(hookBack, 600); }
      })();
    } catch (err) {
      /* 玩法没挂起来：这颗兜底出口必须亮出来 */
      exit.style.display = '';
      host.innerHTML = '';
      host.appendChild(App.el('p', 'lead', '玩法加载出错：' + (err && err.message)));
      if (window.console && console.error) { console.error('[博物馆] 玩法挂载失败', err); }
    }
  }

  function closePlay() {
    if (!S.play) { return; }
    var p = S.play;
    S.play = null;
    try { if (p.mode.unmount) { p.mode.unmount(p.host); } } catch (e) {}
    if (p.ov && p.ov.parentNode) { p.ov.parentNode.removeChild(p.ov); }
    (p.floats || []).forEach(function (b) {
      if (b && b.parentNode) { b.parentNode.removeChild(b); }
    });
    if (p.sndOff) { try { p.sndOff(); } catch (e) {} }
    if (p.onBack) { document.removeEventListener('click', p.onBack, true); }
    /* 战斗音乐不该跟着出关卡；环境音垫从"打 Boss 的压低态"还原 */
    if (App.battleMusic && App.battleMusic.isPlaying && App.battleMusic.isPlaying()) {
      App.battleMusic.stop(0.5);
    }
    if (App.museumAudio && App.museumAudio.duck) { App.museumAudio.duck(false); }
    document.body.classList.remove('mu-play-lock');
  }

  /* 造字区每拼成一个字，任务条要跟着变（不然还写着上一字的 0/2） */
  if (App.on) {
    App.on('museum-build', function () {
      if (S.alive && S.area === 'build') { updateTask(); }
    });
    /* 造字区拼对一个字：先讲课，再进下一个 */
    App.on('museum-build-solved', function (d) {
      if (!S.alive || S.area !== 'build' || !d || !d.word) { return; }
      openBuildLesson(d);
    });
  }

  /* 拼对之后的讲解卡：甲骨形 / 今字 / 释义 / 卜辞 / 知识点 + 下一个字 */
  function openBuildLesson(d) {
    var w = d.word || {};
    openPanel(function (p) {
      panelHead(p, w.g || '', '造字探索区 · 第 ' + ((d.seq || 0) + 1) + ' / ' + (d.total || 5) + ' 题');
      var body = App.el('div', 'mu-p-body');
      var pair = App.el('div', 'mu-p-pair');
      var now = App.el('div', 'mu-p-now');
      now.appendChild(App.el('span', 'mu-p-now-ch', w.g || ''));
      now.appendChild(App.el('span', 'mu-p-now-k', '今字'));
      pair.appendChild(now);
      var ob = App.el('div', 'mu-p-ob');
      var obsvg = glyphNode(w.g, 'mu-p-ob-glyph');
      if (obsvg) {
        ob.appendChild(obsvg);
      } else if (d.pair && d.pair.length) {
        /* 合体字在字库里没有整字字形：按构件左右并置画出来，
           这正是商人当时的写法，也比留一块空白强。 */
        var pairBox = App.el('div', 'mu-p-ob-pair');
        d.pair.forEach(function (ch) {
          var g1 = glyphNode(ch, 'mu-p-ob-piece');
          if (g1) { pairBox.appendChild(g1); }
          else { pairBox.appendChild(App.el('span', 'mu-p-ob-piece-t', ch)); }
        });
        ob.appendChild(pairBox);
      } else {
        ob.appendChild(App.el('span', 'mu-p-none', '无整字字形'));
      }
      ob.appendChild(App.el('span', 'mu-p-now-k', '甲骨字形'));
      pair.appendChild(ob);
      body.appendChild(pair);

      var dl = App.el('dl', 'mu-p-dl');
      row(dl, '构件', (d.pair || []).join(' + '));
      if (w.mean) { row(dl, '释义', w.mean); }
      if (w.src) { row(dl, '卜辞', w.src); }
      if (w.lv) { row(dl, '释读', w.lv); }
      row(dl, '已经在甲骨上刻好了', '这是第 ' + (d.solved || 1) + ' 个拼成的字');
      body.appendChild(dl);

      /* 集章条：刚盖上的那一枚用 .is-new 落一下，五枚齐了换成收尾语气。
         3D 那边有一块同样的牌子（工作台左手边），这里给面板也来一条 ——
         看完讲解就关掉面板的人，也得看见自己攒了几枚。 */
      var stamps = d.stamps || [];
      var stampTotal = (S.api && S.api.buildState && S.api.buildState().stampTotal) || 5;
      if (stamps.length) {
        var sbox = App.el('div', 'mu-stamps');
        sbox.appendChild(App.el('span', 'mu-stamps-k', d.stampFull ? '五枚齐了' : '集章'));
        var rowEl = App.el('div', 'mu-stamps-row');
        for (var si = 0; si < stampTotal; si++) {
          var ch = stamps[si];
          var cell = App.el('span', 'mu-stamp' + (ch ? ' is-on' : '') +
            (ch && si === stamps.length - 1 ? ' is-new' : ''));
          cell.textContent = ch || '印';
          rowEl.appendChild(cell);
        }
        sbox.appendChild(rowEl);
        body.appendChild(sbox);
      }

      body.appendChild(App.el('p', 'mu-p-note',
        '字形是拼出来的：两个构件各占一边，合起来才是这个字。\n' +
        '甲骨文里同一个字常有几种写法，这里只取最通行的一种。'));

      var acts = App.el('div', 'mu-p-acts');
      var next = App.el('button', 'mu-btn mu-btn-primary',
        d.stampFull ? '收下这一排字 · 再来一轮 →' : '下一个字 →');
      next.type = 'button';
      next.onclick = function () {
        if (S.api && S.api.buildNext) {
          var r = S.api.buildNext();
          say('第 ' + (r.seq + 1) + ' / ' + r.total + ' 题：「' + r.target + '」，挑两块构件放上台面。');
        }
        closePanel();
        updateTask();
      };
      acts.appendChild(next);
      var stay = App.el('button', 'mu-btn', '再看看这块骨');
      stay.type = 'button';
      stay.onclick = closePanel;
      acts.appendChild(stay);
      body.appendChild(acts);
      p.appendChild(body);
    });
  }

  function enterZone(id) {
    var z = zoneById(id);
    if (!z) { return; }

    /* 浮空骨片区不再走"考古任务"那一层：点门就直接进骨片空间。
       （挖掘 mini-game 的代码还在，想恢复把这行删掉即可） */
    if (id === 'boss') {
      /* 名录墙那间屋子没用了：直接开三阶段守字之骨 */
      setBarName(id);
      openPlay('boss-3d', '守字之骨区 · 三阶段');
      return;
    }

    if (id === 'excavate') {
      /* 不再离开博物馆：直接在馆内开骨片空间 */
      setBarName(id);
      openPlay('bone-float', '浮空骨片区 · 骨片浮空');
      return;
    }

    setBarName(id);

    /* 有 3D：每一道门后都是一间真的屋子，走过去，不跳页 */
    if (S.api && !S.fallback && S.api.areas && S.api.areas.indexOf(id) >= 0) {
      S.api.setArea(id);
      S.area = id;
      syncHash(id);
      S.wrap.setAttribute('data-area', id);
      closePanel();
      updateTask();
      say(ZONE_LINE[id] || '');
      return;
    }

    /* 2D 降级：没有 3D 时，玩法回到原来的页面 */
    if (z.href) {
      if (App.museum) { App.museum._zone = S.area; }
      location.hash = z.href.replace(/^#/, '');
      return;
    }
    if (id === 'gallery') {
      say('平面展厅里，十二件骨版就在下面那一排。');
      return;
    }
    /* 序厅已并入知识厅：老链接落到知识厅 */
    if (id === 'prologue') { enterZone('gallery'); return; }
    if (id === 'collection') { openCollection(); return; }
  }

  function goHall() {
    if (S.api) { S.api.setArea('hall'); }
    S.area = 'hall';
    S.selected = null;
    setBarName('hall');
    syncHash('hall');
    if (S.wrap) { S.wrap.setAttribute('data-area', 'hall'); }
    closePanel();
    updateTask();
    say('回到总厅了。六个门，你想先去哪一处？');
  }

  /* ---------- 任务条 ---------- */
  function updateTask() {
    var t = S.task;
    if (!t) { return; }
    var id = S.area;
    /* 典藏区：显示三关收口的"今日所得" */
    if (S.sum) {
      var isColl = (id === 'collection');
      var pg = (App.progress && App.progress.summary) ? App.progress.summary() : null;
      if (isColl && pg && (pg.total || (pg.boss && pg.boss.cleared))) {
        S.sum.hidden = false;
        S.sum.innerHTML = '';
        var line = App.el('div', 'mu-sum-line');
        line.innerHTML = '今日所得　·　认过 <b>' + pg.total + '</b> 个字　·　骨片点开 <b>' +
          pg.floatN + '</b> 片　·　守字之骨 ' +
          ((pg.boss && pg.boss.cleared) ? '<b>已通过</b>' : '未通过');
        S.sum.appendChild(line);
        /* 12 件展品做成"柜格"：点一间 → 展开它的展签（展签里能直达关卡/图鉴）。
           3D 柜格本身也可点（kind: slot），这里给一份不依赖 3D 的等价入口。 */
        var exs = [];
        try {
          if (App.levels && App.levels.museum && App.levels.museum.exhibits) {
            exs = App.levels.museum.exhibits;
          }
        } catch (e0) { exs = []; }
        if (!exs || !exs.length) {
          exs = ['日', '月', '雨', '火', '山', '水', '木', '田', '人', '大', '目', '鼎'];
        }
        var cells = App.el('div', 'mu-sum-cells');
        exs.slice(0, 12).forEach(function (ch) {
          var cb = App.el('button', 'mu-sum-cell' + (S.seen[ch] ? ' on' : ''));
          cb.type = 'button';
          cb.title = S.seen[ch] ? ('「' + ch + '」已收进典藏，点开看展签')
                                : ('「' + ch + '」还没看过，点开看怎么去看');
          var cg = glyphNode(ch, 'mu-sum-cell-g');
          if (cg) { cb.appendChild(cg); }
          else { cb.appendChild(App.el('span', null, ch)); }
          cb.onclick = function () { openExhibit(ch, false); };
          cells.appendChild(cb);
        });
        S.sum.appendChild(cells);

        var where = App.el('div', 'mu-sum-acts');
        [['bone-build', '第一关'], ['bone-float', '骨片空间'], ['boss-3d', '守字之骨']]
          .forEach(function (kv) {
            var a3 = App.el('button', 'mu-btn mu-btn-sm', kv[1]);
            a3.type = 'button';
            a3.onclick = function () { openPlay(kv[0]); };
            where.appendChild(a3);
          });
        S.sum.appendChild(where);
      } else {
        S.sum.hidden = true;
      }
    }

    var show = !S.fallback && (id === 'build' || id === 'excavate' || id === 'boss');
    t.hidden = !show;
    if (S.wrap) { S.wrap.classList.toggle('has-task', show); }
    syncStack();
    if (!show) { return; }

    if (id === 'build') {
      var bs = (S.api && S.api.buildState) ? S.api.buildState() : null;
      S.taskK.textContent = '造字探索区';
      S.taskTx.textContent = bs && bs.target
        ? ('拼出「' + bs.target + '」：放 ' + bs.need + ' 块构件，放错会自动退回')
        : '把两块构件搬上台面，骨上就会多刻一道';
      S.taskN.textContent = bs
        ? ((bs.done ? '已成字' : bs.picks.length + ' / ' + bs.need) +
           (bs.solved ? '　·　已拼成 ' + bs.solved + ' 字' : ''))
        : '';
      S.taskAgain.hidden = false;
      S.taskAgain.textContent = '换一个字';
      S.taskGo.removeAttribute('href');
      S.taskGo.textContent = '去造字关';
      S.taskGo.onclick = function (ev) { ev.preventDefault(); openPlay('bone-build', '造字探索区'); };
    } else if (id === 'excavate') {
      var ds = (S.api && S.api.digState) ? S.api.digState() : null;
      S.taskK.textContent = '考古任务区';
      S.taskTx.textContent = '点探方往下挖，三片带字的骨埋在下面';
      S.taskN.textContent = ds ? ('已出土 ' + ds.found + ' / ' + ds.total) : '';
      S.taskAgain.hidden = false;
      S.taskAgain.textContent = '重新填土';
      S.taskGo.removeAttribute('href');
      S.taskGo.textContent = '去骨片空间';
      S.taskGo.onclick = function (ev) { ev.preventDefault(); openPlay('bone-float', '浮空骨片区 · 骨片浮空'); };
    } else {
      var bst = (S.api && S.api.bossState) ? S.api.bossState() : null;
      S.taskK.textContent = 'BOSS 挑战区';
      S.taskTx.textContent = '点名录里的一尊，再把它的构件一件件拆掉';
      S.taskN.textContent = bst && bst.idx >= 0
        ? ('已拆 ' + bst.broken + ' / ' + bst.total) : '先选一尊';
      S.taskAgain.hidden = true;
      S.taskGo.removeAttribute('href');
      S.taskGo.textContent = '去讨伐';
      S.taskGo.onclick = function (ev) { ev.preventDefault(); openPlay('boss-3d', '守字之骨区 · 三阶段'); };
    }
    /* 文字填完再量一次：任务条可能因为文案换行而变高 */
    syncStack();
  }

  function resetCurrent() {
    if (!S.api) { return; }
    if (S.area === 'build') {
      S.api.buildReset();
      say('换了一个字。台面上的构件也换了，重新看。');
    } else if (S.area === 'excavate') {
      S.api.digReset();
      say('土又填回去了。想再挖一遍就再来。');
    } else if (S.area === 'boss') {
      S.api.bossClear();
      say('清台了。再点一尊。');
    }
    updateTask();
  }

  /* ---------- 龟宝的几句话 ---------- */
  var LINES = {};
  var ZONE_LINE = {
    prologue: '先看这块碑。看完点一下那块骨 —— 灼一次，你就明白「兆」是什么了。',
    gallery: '十二件骨版分四段：卜材、卜辞、文字、发现。点一件，我陪你凑近看。',
    build: '台上有四块构件，只有两块能凑成这个字。挑对了，骨上就多一道。',
    excavate: '九个探方，三片带字的骨埋在下面。一格一格挖，别急着整块掀。',
    boss: '名录墙上都是讨伐页里的形象。点一尊，把它的构件一件件拆下来。',
    collection: '看过哪一件，柜子里哪个龛就亮着。没亮的，就是还没看过。'
  };
  function say(text, key) {
    if (key) { LINES[key] = text; }
    if (!S.guideText) { return; }
    S.guideText.textContent = text;
    /* 换了话就闪一下，让人注意到它开口了 */
    var b = S.guideText.parentNode;
    if (b) {
      b.classList.remove('is-new');
      void b.offsetWidth;
      b.classList.add('is-new');
    }
  }
  function nextGuide() {
    var pool = [
      '六个门都开着，走错了也不要紧，随时能回来。',
      '骨版上的字不是贴上去的图，是按真实字形数据刻出来的。',
      '看不清就转一转，光会跟着你的角度走。',
      '想直接玩的话，底部那一排：造字、考古、讨伐，都是原来那三关。'
    ];
    S.quest = (S.quest + 1) % pool.length;
    say(pool[S.quest]);
  }

  /* ---------- 面板通用 ---------- */
  function openPanel(build) {
    var p = S.panel;
    if (!p) { return; }
    App.clearNode(p);
    build(p);
    p.setAttribute('aria-hidden', 'false');
    S.wrap.classList.add('is-panel');
    if (S.hint) {
      S.hint.classList.remove('is-fade');
      var k = S.hint.querySelector('.mu-hint-k');
      if (k) { k.textContent = '拖拽'; }
      var t = S.hint.querySelectorAll('span:not(.mu-hint-k)');
      if (t[0]) { t[0].textContent = '转动展品'; }
      if (t[1]) { t[1].textContent = '滚轮缩放'; }
      if (t[2]) { t[2].textContent = '点空白处离开'; }
    }
  }
  function closePanel() {
    if (!S.panel) { return; }
    S.panel.setAttribute('aria-hidden', 'true');
    S.wrap.classList.remove('is-panel');
    /* 把展品放下：拖拽重新变成"转视角"，不是"继续转那件东西" */
    if (S.api && S.api.select) { S.api.select(null); }
    if (S.hint) {
      if (S.hintHTML) { S.hint.innerHTML = S.hintHTML; }
      S.hint.classList.remove('is-fade');
    }
  }
  /* nowCh：抬头显示用的今字。甲骨字形按 ch 取（数据集里只有繁体键，如「車」「龍」），
     而标题该写简体，所以两者分开传 —— 不传就还用 ch。 */
  function panelHead(p, ch, sub, nowCh) {
    var head = App.el('div', 'mu-p-head');
    var gbox = App.el('div', 'mu-p-glyph');
    var g = glyphNode(ch, 'mu-p-obglyph');
    if (g) { gbox.appendChild(g); } else { gbox.appendChild(App.el('span', null, ch)); }
    head.appendChild(gbox);

    var meta = App.el('div', 'mu-p-meta');
    meta.appendChild(App.el('h2', 'mu-p-title', nowCh || ch));
    meta.appendChild(App.el('p', 'mu-p-sub', sub));
    head.appendChild(meta);

    var x = App.el('button', 'mu-p-x', '×');
    x.type = 'button';
    x.setAttribute('aria-label', '关闭展签');
    x.onclick = closePanel;
    head.appendChild(x);
    p.appendChild(head);
    return head;
  }
  function row(dl, k, v) {
    if (!v) { return; }
    var d = App.el('div', 'mu-p-row');
    d.appendChild(App.el('dt', null, k));
    d.appendChild(App.el('dd', null, v));
    dl.appendChild(d);
  }

  /* ---------- 数字展签 ----------
     一件骨版 = 一条甲骨学的知识，不是"又一个字"。
     正文顺序固定：主题 → 导语 → 分条（中文序号）→ 卜辞原辞 → 小注。
     「…」标卜辞例句、**…** 标强调，两个标记交给 inlineNodes()，
     与知识石板的面板共用同一套排版（.mu-b-list / .mu-b-quote）。
     没有对应条目的字（从图鉴直接点进来的）仍走原来的字卡。 */
  function openExhibit(ch, isHero) {
    var obj = zoneObject(ch);
    var pool = poolEntry(ch);
    var meta = glyphMeta(ch);
    var item = (App.oracleHall && App.oracleHall.byChar && App.oracleHall.byChar[ch]) || null;
    var isSeen = markSeen(ch);

    openPanel(function (p) {
      panelHead(p, ch,
        item ? (item.sec + ' · ' + item.tag)
             : (isHero ? (ch === '卜' ? '中央展品 · 卜兆之形' : '中央展品 · 骨版上的一个字')
                : (obj ? obj.zone + ' · 甲骨实物' : '甲骨文展厅')),
        item ? item.now : null);

      var body = App.el('div', 'mu-p-body');

      if (item) {
        body.appendChild(App.el('h3', 'mu-p-board-t', item.title));
        body.appendChild(App.el('p', 'mu-p-board-lead', item.lead));

        var list = App.el('ol', 'mu-b-list');
        item.rows.forEach(function (kv, i) {
          var li = App.el('li', 'mu-b-item');
          li.appendChild(App.el('span', 'mu-b-num', CN_ORD[i] || String(i + 1)));
          var main = App.el('div', 'mu-b-main');
          main.appendChild(App.el('h4', 'mu-b-k', kv[0]));
          var v = App.el('p', 'mu-b-v');
          inlineNodes(kv[1]).forEach(function (nd) { v.appendChild(nd); });
          main.appendChild(v);
          li.appendChild(main);
          list.appendChild(li);
        });
        body.appendChild(list);

        /* 卜辞原辞单独成块：骨上的话和讲解之间要有一条界线，
           否则读者分不清哪一句是三千年前刻上去的。 */
        if (item.quote) {
          var fig = App.el('figure', 'mu-b-quote');
          fig.appendChild(App.el('p', 'mu-b-quote-tx', item.quote));
          if (item.qnote) {
            fig.appendChild(App.el('figcaption', 'mu-b-quote-note', item.qnote));
          }
          body.appendChild(fig);
        }

        if (item.note) { body.appendChild(App.el('p', 'mu-p-note', item.note)); }
        if (meta && meta.glyphId) {
          body.appendChild(App.el('p', 'mu-p-sim',
            '骨面字形 ' + ch + '　数据编号 #' + meta.glyphId +
            (meta.pieceCount ? '　' + meta.pieceCount + ' 笔' : '') +
            '　取自甲骨字形数据集（CC BY 4.0）'));
        }
      } else {
        /* 大字：今字 + 真甲骨形，左右并置，方便对照 */
        var pair = App.el('div', 'mu-p-pair');
        var now = App.el('div', 'mu-p-now');
        now.appendChild(App.el('span', 'mu-p-now-ch', ch));
        now.appendChild(App.el('span', 'mu-p-now-k', '今字'));
        pair.appendChild(now);
        var ob = App.el('div', 'mu-p-ob');
        var obsvg = glyphNode(ch, 'mu-p-ob-glyph');
        if (obsvg) { ob.appendChild(obsvg); } else { ob.appendChild(App.el('span', 'mu-p-none', '无整字字形')); }
        ob.appendChild(App.el('span', 'mu-p-now-k', '甲骨字形'));
        pair.appendChild(ob);
        body.appendChild(pair);

        var dl = App.el('dl', 'mu-p-dl');
        row(dl, '释义', (pool && pool.mean) || (obj && obj.meaning) || '');
        if (pool && pool.src) { row(dl, '卜辞', pool.src); }
        if (pool && pool.lv) { row(dl, '释读', pool.lv); }
        if (obj) { row(dl, '所属类别', obj.zone); }
        if (meta) {
          row(dl, '笔画', (meta.pieceCount || 0) + ' 笔');
          row(dl, '数据编号', '#' + meta.glyphId);
        }
        if (obj && obj.note) { row(dl, '这一区', obj.note); }
        body.appendChild(dl);

        /* 构形信息：只用数据里有的，不做推测 */
        var comps = [];
        if (pool && pool.w) { comps = String(pool.w).split('+').filter(Boolean); }
        if (comps.length) {
          var cbox = App.el('div', 'mu-p-comps');
          cbox.appendChild(App.el('span', 'mu-p-k', '构件'));
          comps.forEach(function (c) {
            var chip = App.el('span', 'mu-p-comp');
            var cg = glyphNode(c, 'mu-p-comp-g');
            if (cg) { chip.appendChild(cg); }
            chip.appendChild(App.el('span', null, c));
            cbox.appendChild(chip);
          });
          cbox.appendChild(App.el('span', 'mu-p-sim', '组合示意，非整字原形'));
          body.appendChild(cbox);
        }
      }

      /* 与既有玩法的连接：这两条都是真入口 */
      var acts = App.el('div', 'mu-p-acts');
      if (item) {
        var a1 = App.el('button', 'mu-btn mu-btn-primary', obj ? '去骨片空间找这个字' : '看展品导览');
        a1.type = 'button';
        a1.onclick = function () {
          if (obj) { openPlay('bone-float', '浮空骨片区 · 骨片浮空'); }
          else { openIndex(); }
        };
        acts.appendChild(a1);
      } else {
        var a0 = App.el('button', 'mu-btn mu-btn-primary', obj ? '去骨片空间找这个字' : '去造字任务');
        a0.type = 'button';
        a0.onclick = function () {
          if (obj) { openPlay('bone-float', '浮空骨片区 · 骨片浮空'); }
          else { openPlay('bone-build', '造字探索区'); }
        };
        acts.appendChild(a0);
      }
      var a2 = App.el('a', 'mu-btn', '汉字图鉴');
      a2.href = '#/atlas';
      acts.appendChild(a2);
      body.appendChild(acts);

      body.appendChild(App.el('p', 'mu-p-note',
        '数字复原模型：骨版按甲骨的一般形态建模，骨面刻痕取自真实甲骨字形数据；' +
        '不是出土原件的三维扫描，也不冒充原件。'));

      p.appendChild(body);
      if (isSeen) {
        var tail = item ? item.title
                        : (((pool && pool.mean) || (obj && obj.meaning) || '') + '　你从哪一笔看出来的？');
        setTimeout(function () { say('「' + ch + '」收进典藏了。' + tail); }, 120);
      }
    });
  }

  /* ============================================================
     导览 + 实时统计
     ------------------------------------------------------------
     一张清单：十二件骨版按四段列出来，点一项就飞过去并展开展签；
     顶上一条统计：已观展 / 认过字 / 已拼成 / 守字之骨 —— 每次开面板都现算，
     所以点完一件回来，数字就是新的。
     ============================================================ */
  /* 导览的筛选键 = 陈列的四段（卜材 / 卜辞 / 文字 / 发现）。
     原来写死的是王邑地图的五个景物分区（天象/山川/草木/禽兽虫鱼/人居器物），
     环上换成四段陈列之后，那份分区表已经和厅里对不上了 —— 从这里改成读数据文件。 */
  var ZONE_ORDER = ((App.oracleHall && App.oracleHall.sections) || []).map(function (s) {
    return s.name;
  });

  function liveStats() {
    var seen = seenCount();
    var pg = (App.progress && App.progress.summary) ? App.progress.summary() : { total: 0, floatN: 0, boss: null };
    return [
      ['已观展', seen + ' / 12'],
      ['认过字', (pg.total || 0) + ''],
      ['骨片点开', (pg.floatN || 0) + ''],
      ['守字之骨', (pg.boss && pg.boss.cleared) ? '已通过' : '未通过']
    ];
  }

  function openIndex(filterZone) {
    /* 展品清单直接用 3D 那边的 EXHIBITS（ch / zone / meaning） */
    var list = (S.api && S.api.exhibits && S.api.exhibits.length)
      ? S.api.exhibits.slice() : [];
    openPanel(function (p) {
      panelHead(p, '索', '展品导览 · 点一项就过去');
      var body = App.el('div', 'mu-p-body');

      /* 实时统计 */
      var nums = App.el('div', 'mu-p-nums');
      liveStats().forEach(function (kv) {
        var c = App.el('div', 'mu-p-num');
        c.appendChild(App.el('b', null, kv[1]));
        c.appendChild(App.el('span', null, kv[0]));
        nums.appendChild(c);
      });
      body.appendChild(nums);

      /* 分区筛选 */
      var chips = App.el('div', 'mu-p-filter');
      [''].concat(ZONE_ORDER).forEach(function (z) {
        var b = App.el('button', 'mu-btn mu-btn-sm' + ((filterZone || '') === z ? ' on' : ''), z || '全部');
        b.type = 'button';
        b.onclick = function () { openIndex(z); };
        chips.appendChild(b);
      });
      body.appendChild(chips);

      /* 清单 */
      var box = App.el('div', 'mu-index');
      list.filter(function (o) { return !filterZone || o.sec === filterZone; })
        .forEach(function (o) {
          var row2 = App.el('button', 'mu-index-row');
          row2.type = 'button';
          var g = glyphNode(o.ch, 'mu-index-g');
          if (g) { row2.appendChild(g); } else { row2.appendChild(App.el('span', null, o.ch)); }
          var mid = App.el('div', 'mu-index-mid');
          mid.appendChild(App.el('b', null, o.now || o.ch));
          /* 第二行：段名 + 主题。原来写的是"短题·释义"，而主题本身就以短题开头，
             读出来是"卜骨·牛肩胛骨：……"，重复一遍。 */
          mid.appendChild(App.el('span', null,
            (o.sec ? o.sec + '　·　' : '') + (o.title || o.meaning || '')));
          row2.appendChild(mid);
          var st = App.el('span', 'mu-index-st' + (S.seen[o.ch] ? ' is-on' : ''),
            S.seen[o.ch] ? '已观' : '未观');
          row2.appendChild(st);
          row2.onclick = function () {
            closePanel();
            /* 先飞过去（有 3D 时），再展开展签 */
            setTimeout(function () {
              if (S.api && S.api.focusExhibit) { S.api.focusExhibit(o.ch); }
              openExhibit(o.ch, false);
            }, 220);
          };
          box.appendChild(row2);
        });
      body.appendChild(box);

      /* 知识陈设：三块石板 + 环上另外三件（龟甲走序厅那块面板） */
      body.appendChild(App.el('p', 'mu-p-k', '知识陈设'));
      var bd = App.el('div', 'mu-p-acts');
      [['structure', '一片卜辞的结构'], ['periods', '甲骨文的五个时期'],
       ['numbers', '数字说甲骨'], ['bronze', '青铜鼎'], ['graver', '刻刀'],
       ['rubbing', '卜辞拓片']]
        .forEach(function (kv) {
          var b2 = App.el('button', 'mu-btn', kv[1]);
          b2.type = 'button';
          b2.onclick = function () { openBoard(kv[0]); };
          bd.appendChild(b2);
        });
      var bp = App.el('button', 'mu-btn', '龟甲与灼骨');
      bp.type = 'button';
      bp.onclick = function () { openPlastron(); };
      bd.appendChild(bp);
      body.appendChild(bd);

      p.appendChild(body);
    });
  }

  /* ---------- 知识陈设：三块石板的面板 ---------- */
  var BOARDS = {
    structure: {
      title: '一片卜辞的结构',
      kicker: '甲骨文知识厅 · 怎么读一片卜辞',
      lead: '一片完整的卜辞，通常由四段组成。四段不一定都齐，越完整的越少见。',
      rows: [
        ['叙辞', '记时间和占卜者，例如「癸卯卜，殼贞」：癸卯这天灼骨，贞人殼主问。'],
        ['命辞', '要问的事，例如「今岁受年」：今年会有好收成吗。'],
        ['占辞', '商王看完兆纹的判断，例如「吉」「其雨」。'],
        ['验辞', '事后追记应验与否，例如「允雨」：果然下雨了。']
      ],
      note: '这四段的命名来自后世研究者的整理（常用术语见陈梦家《殷虚卜辞综述》一类著作），并非甲骨上写着的标题。'
    },
    periods: {
      title: '甲骨文的五个时期',
      kicker: '甲骨文知识厅 · 分期',
      lead: '董作宾依据字体、世系、称谓等，把殷墟甲骨分成五期。后世虽有修正，五期仍是入门的通用框架。',
      rows: [
        ['一期', '武丁。字大而雄，气象开阔。'],
        ['二期', '祖庚、祖甲。字渐工整，行款趋谨。'],
        ['三期', '廪辛、康丁。字多草率，笔势轻。'],
        ['四期', '武乙、文丁。字复趋劲峭。'],
        ['五期', '帝乙、帝辛。字小而密，最像后世金文。']
      ],
      note: '分期是研究工具，不是甲骨上刻的年份。同一时期的不同刻手，风格也会差很多。'
    },
    numbers: {
      title: '数字说甲骨',
      kicker: '甲骨文知识厅 · 数一数',
      lead: '下面这些数字是学界常用的约数，不同统计口径会略有出入。',
      rows: [
        ['约十五万片', '已出土的有字甲骨总量（含流散海外的），是"片"不是"件"。'],
        ['约四千五百个', '甲骨文里出现的单字总数，按不同字表统计略有差别。'],
        ['约一千三百字', '已被可靠释读的单字，多为常用字；剩下的大多是人名、地名、祭名。'],
        ['一条断代线', '殷墟甲骨主要属于商代晚期，约公元前十四世纪到前十一世纪。']
      ],
      note: '数字随新发现与新研究变动，这里只给量级，不作为精确统计引用。'
    },

    /* ---------- 环上四件陈设里，需要单独讲的三件 ----------
       龟甲那件点开走的是序厅原来的「龟甲与灼骨」面板（openPlastron），
       所以这里只补鼎、刀、拓三块。 */
    bronze: {
      title: '青铜鼎：为什么"鼎"能代表国家',
      kicker: '甲骨文知识厅 · 材料与礼器',
      lead: '展厅里那件是三足两耳的鼎。它既是炊器，也是礼器 —— 这一点决定「鼎」这个字后来的分量。',
      rows: [
        ['字', '「鼎」的甲骨文就是照着这件东西画的：上面两只耳，中间一个腹，下面三条腿。'],
        ['用', '煮肉、盛肉，用于祭祀和宴飨。青铜在当时是极贵的材料。'],
        ['礼', '鼎的数目和大小对应身份（所谓"列鼎"），所以后世把"定鼎"当作建国的代称。'],
        ['与甲骨的关系', '甲骨上的字是用刀刻在骨上的，但商代同时也在铸青铜器，两套文字系统互相印证。']
      ],
      note: '展厅这件是按商周鼎的一般形制做的示意件，不是某件出土器物的复制品。'
    },
    graver: {
      title: '刻刀：字是刻出来的，不是写上去的',
      kicker: '甲骨文知识厅 · 工具',
      lead: '甲骨上的字绝大多数是刀刻的（少数有朱书、墨书痕迹）。刀口一刀接一刀，所以线条多直、少圆转。',
      rows: [
        ['刀', '青铜制，刃薄而窄。展厅那件是示意：细长的身、窄刃、木柄。'],
        ['刻法', '先直后曲、先外后内，一刀一段。写不出毛笔那样的粗细变化，故笔画匀、方折多。'],
        ['留下的痕迹', '字口内窄外宽（刀尖进去的角度造成的），这是判断真伪的一个依据。'],
        ['反证', '少数甲骨上有朱砂或墨写的字，说明当时也有"书而未刻"的做法。']
      ],
      note: '商代刻刀出土实物形制多样，展厅这件只取其共同特征，不作器型依据。'
    },
    rubbing: {
      title: '拓片：把刻辞"复印"下来的老办法',
      kicker: '甲骨文知识厅 · 摹取',
      lead: '拓片不是照相，是把纸压在器物上打墨：纸贴进凹凸处，凸起的地方着墨，凹下去的字口不着墨。',
      rows: [
        ['工序', '洗剔 · 上纸 · 砸实 · 待干 · 打墨 · 揭取。'],
        ['为什么字是白的', '甲骨是凹刻，字口比骨面低，墨只上在骨面上 —— 所以拓出来是黑底白字。'],
        ['比摹本可靠', '拓片保留刀口、崩边、裂纹的形状，是做文字考释和辨伪的一手材料。'],
        ['这一件', '墙上的拓片是**行款示意**：把馆里十二个字按右起竖行排出来，不是某一片出土拓片的摹本。']
      ],
      note: '真拓片会把骨面的裂纹、钻凿的圆槽一起拓进去；这里为了看清字形，只显示了刻辞。'
    }
  };

  /* 展签正文里的两种行内标记：
       「…」 = 原辞例句 → 朱砂 + 细下划线
       **…** = 强调 → 加粗（BOARDS 里 rubbing 那条一直在用，原先会原样显示两个星号）
     全部用文本节点拼装、不拼 innerHTML —— 这些内容将来若挪进数据文件，
     拼字符串就是一个 XSS 口子。 */
  var CN_ORD = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  function inlineNodes(text) {
    var out = [], i = 0, m;
    var re = /「[^」]*」|\*\*[^*]+\*\*/g;
    while ((m = re.exec(text)) !== null) {
      if (m.index > i) { out.push(document.createTextNode(text.slice(i, m.index))); }
      var s = m[0];
      if (s.charAt(0) === '*') {
        out.push(App.el('strong', null, s.slice(2, -2)));
      } else {
        out.push(App.el('em', 'mu-b-q', s));
      }
      i = m.index + s.length;
    }
    if (i < text.length) { out.push(document.createTextNode(text.slice(i))); }
    return out;
  }

  function openBoard(topic) {
    var b = BOARDS[topic];
    if (!b) { say('这块石板还没写完。'); return; }
    openPanel(function (p) {
      panelHead(p, '文', b.kicker);
      var body = App.el('div', 'mu-p-body');
      body.appendChild(App.el('h3', 'mu-p-board-t', b.title));
      body.appendChild(App.el('p', 'mu-p-board-lead', b.lead));

      /* 原来是 <dl> 平铺四条 dt/dd：四条并排时只有粗细之别，眼睛没有落点。
         改成带中文序号的条目 —— 序号给位置，名目给关键词，释义单独成段。 */
      var list = App.el('ol', 'mu-b-list');
      b.rows.forEach(function (kv, i) {
        var li = App.el('li', 'mu-b-item');
        li.appendChild(App.el('span', 'mu-b-num', CN_ORD[i] || String(i + 1)));
        var main = App.el('div', 'mu-b-main');
        main.appendChild(App.el('h4', 'mu-b-k', kv[0]));
        var v = App.el('p', 'mu-b-v');
        inlineNodes(kv[1]).forEach(function (nd) { v.appendChild(nd); });
        main.appendChild(v);
        li.appendChild(main);
        list.appendChild(li);
      });
      body.appendChild(list);

      body.appendChild(App.el('p', 'mu-p-note', b.note));
      p.appendChild(body);
    });
  }

  /* ---------- 文明序厅 ---------- */
  function openPrologue() {
    var at = (App.glyphs && App.glyphs.attribution) || {};
    openPanel(function (p) {
      panelHead(p, '卜', '文明序厅 · 甲骨是什么');
      var body = App.el('div', 'mu-p-body');
      var ps = [
        '甲骨文是商代晚期刻在龟甲与牛肩胛骨上的文字，用来占卜，也用来记事。',
        '先在骨面钻凿，再以火灼，看裂纹（兆）判断吉凶；卜问的内容与应验，常常就刻在兆的旁边。',
        '所以一片骨，既是器物，也是档案。读它，等于读三千年前的一次提问。'
      ];
      ps.forEach(function (t) { body.appendChild(App.el('p', 'mu-p-p', t)); });

      var dl = App.el('dl', 'mu-p-dl');
      row(dl, '字形来源', at.dataset || '甲骨字形数据集');
      row(dl, '授权', at.license || 'CC BY 4.0');
      row(dl, '本项目的改动', at.modifications || '仅缩放、配色与合成');
      body.appendChild(dl);

      var acts = App.el('div', 'mu-p-acts');
      var a1 = App.el('a', 'mu-btn mu-btn-primary', '进甲骨文展厅');
      a1.href = 'javascript:void 0';
      a1.onclick = function (e) { e.preventDefault(); closePanel(); enterZone('gallery'); };
      acts.appendChild(a1);
      var a2 = App.el('a', 'mu-btn', '看玩法说明');
      a2.href = '#/howto';
      acts.appendChild(a2);
      body.appendChild(acts);
      p.appendChild(body);
    });
  }

  /* ---------- 龟甲（序厅里那件） ---------- */
  function openPlastron() {
    openPanel(function (p) {
      panelHead(p, '龜', '序厅 · 龟甲');
      var body = App.el('div', 'mu-p-body');
      body.appendChild(App.el('p', 'mu-p-p',
        '占卜用的不只有牛肩胛骨，还有龟的腹甲。龟甲要先锯开、刮平、钻凿出圆槽，' +
        '再在槽边用火灼，看正面裂开的兆纹判断吉凶。'));
      body.appendChild(App.el('p', 'mu-p-p',
        '所以「甲骨」的「甲」指龟甲，「骨」指兽骨 —— 两样都是卜材，不是一件事。'));
      var dl = App.el('dl', 'mu-p-dl');
      row(dl, '材质', '龟腹甲（此件为艺术化复原）');
      row(dl, '工序', '锯开 · 刮平 · 钻凿 · 灼 · 观兆 · 刻辞');
      row(dl, '模型来源', '按龟腹甲一般形态建模（Blender），非出土原件扫描');
      body.appendChild(dl);
      var acts = App.el('div', 'mu-p-acts');
      var a1 = App.el('a', 'mu-btn mu-btn-primary', '看这块骨怎么灼');
      a1.href = 'javascript:void 0';
      a1.onclick = function (e) {
        e.preventDefault();
        closePanel();
        if (S.api && S.api.heat) { S.api.heat(); }
        say('点一下右边那块骨，它就会亮。');
      };
      acts.appendChild(a1);
      body.appendChild(acts);
      p.appendChild(body);
    });
  }

  /* ---------- 表谱骨版（展厅半空悬着的那件） ---------- */
  function openTablet() {
    openPanel(function (p) {
      panelHead(p, '卜', '表谱骨版 · 竖行排布的形制');
      var body = App.el('div', 'mu-p-body');
      body.appendChild(App.el('p', 'mu-p-p',
        '这块骨上刻的不是一个字，而是一段「成篇」的排布：竖行、右起，一列写到底，再换左边一列。'));
      body.appendChild(App.el('p', 'mu-p-p',
        '甲骨上确实有这样把字排成整齐竖行的刻辞（干支表一类，学界称「表谱刻辞」）。' +
        '这里借它的形制，把馆藏十二字排成四列，演示的是行气、字距，以及手刻的微小抖动 —— ' +
        '不是某一片出土卜辞的摹本。'));
      var dl = App.el('dl', 'mu-p-dl');
      row(dl, '行款', '竖行 · 右起 · 自右向左');
      row(dl, '列数', '四列，每列三字');
      row(dl, '表内十二字', '日月雨 / 山川泉 / 木林牛 / 鱼门鼎');
      row(dl, '性质', '形制演示，非出土原件摹本');
      body.appendChild(dl);

      var box = App.el('div', 'mu-p-seen');
      ['日', '月', '雨', '山', '川', '泉', '木', '林', '牛', '鱼', '门', '鼎'].forEach(function (ch) {
        var b = App.el('button', 'mu-p-seenitem');
        b.type = 'button';
        var g = glyphNode(ch, 'mu-p-seen-g');
        if (g) { b.appendChild(g); }
        b.appendChild(App.el('span', null, ch));
        b.onclick = function () {
          enterZone('gallery');
          openExhibit(ch, false);
        };
        box.appendChild(b);
      });
      body.appendChild(box);

      var acts = App.el('div', 'mu-p-acts');
      var a1 = App.el('a', 'mu-btn mu-btn-primary', '进甲骨文展厅');
      a1.href = 'javascript:void 0';
      a1.onclick = function (e) { e.preventDefault(); closePanel(); enterZone('gallery'); };
      acts.appendChild(a1);
      body.appendChild(acts);
      p.appendChild(body);
    });
  }

  /* ---------- 造字区：拼成之后 ---------- */
  function openBuildDone(word) {
    openPanel(function (p) {
      panelHead(p, word.g, '造字探索区 · 刚拼成的一个字');
      var body = App.el('div', 'mu-p-body');

      var pair = App.el('div', 'mu-p-pair');
      var now = App.el('div', 'mu-p-now');
      now.appendChild(App.el('span', 'mu-p-now-ch', word.g));
      now.appendChild(App.el('span', 'mu-p-now-k', '今字'));
      pair.appendChild(now);
      var ob = App.el('div', 'mu-p-ob');
      var obsvg = glyphNode(word.g, 'mu-p-ob-glyph');
      if (obsvg) { ob.appendChild(obsvg); } else { ob.appendChild(App.el('span', 'mu-p-none', '此字无整字甲骨形')); }
      ob.appendChild(App.el('span', 'mu-p-now-k', '甲骨字形'));
      pair.appendChild(ob);
      body.appendChild(pair);

      var dl = App.el('dl', 'mu-p-dl');
      row(dl, '释义', word.mean || '');
      row(dl, '构件', word.w || '');
      if (word.src) { row(dl, '卜辞', word.src); }
      if (word.lv) { row(dl, '释读', word.lv); }
      body.appendChild(dl);

      var comps = String(word.w || '').split('+').filter(Boolean);
      if (comps.length) {
        var cbox = App.el('div', 'mu-p-comps');
        cbox.appendChild(App.el('span', 'mu-p-k', '你摆上去的'));
        comps.forEach(function (c) {
          var chip = App.el('span', 'mu-p-comp');
          var cg = glyphNode(c, 'mu-p-comp-g');
          if (cg) { chip.appendChild(cg); }
          chip.appendChild(App.el('span', null, c));
          cbox.appendChild(chip);
        });
        cbox.appendChild(App.el('span', 'mu-p-sim', '组合示意，非整字原形'));
        body.appendChild(cbox);
      }

      var acts = App.el('div', 'mu-p-acts');
      var a1 = App.el('a', 'mu-btn mu-btn-primary', '去造字关正式拼一次');
      a1.href = '#/play/bone-build';
      acts.appendChild(a1);
      var a2 = App.el('button', 'mu-btn', '再换一个字');
      a2.type = 'button';
      a2.onclick = function () { closePanel(); resetCurrent(); };
      acts.appendChild(a2);
      body.appendChild(acts);
      p.appendChild(body);
    });
  }

  /* ---------- 考古区：三片都出来了 ---------- */
  function openDigDone() {
    var ds = (S.api && S.api.digState) ? S.api.digState() : { found: 0, total: 3 };
    openPanel(function (p) {
      panelHead(p, '山', '考古任务区 · 三片都出土了');
      var body = App.el('div', 'mu-p-body');
      body.appendChild(App.el('p', 'mu-p-p',
        '土是一层一层刮开的。三片带字的骨分别刻着「山」「川」「泉」——' +
        '它们都归在「山川」这一类，是先民最早认出来的地形。'));
      var box = App.el('div', 'mu-p-seen');
      ['山', '川', '泉'].forEach(function (ch) {
        var b = App.el('button', 'mu-p-seenitem is-on');
        b.type = 'button';
        var g = glyphNode(ch, 'mu-p-seen-g');
        if (g) { b.appendChild(g); }
        b.appendChild(App.el('span', null, ch));
        b.onclick = function () { openExhibit(ch, false); };
        box.appendChild(b);
      });
      body.appendChild(box);
      var acts = App.el('div', 'mu-p-acts');
      var a1 = App.el('a', 'mu-btn mu-btn-primary', '去骨片空间认实物');
      a1.href = '#/play/bone-float';
      acts.appendChild(a1);
      var a2 = App.el('button', 'mu-btn', '再挖一遍');
      a2.type = 'button';
      a2.onclick = function () { closePanel(); resetCurrent(); };
      acts.appendChild(a2);
      body.appendChild(acts);
      p.appendChild(body);
    });
    updateTask();
    void ds;
  }

  /* ---------- BOSS 区：名录里的一尊 ---------- */
  function openBossFace(e) {
    openPanel(function (p) {
      panelHead(p, e.char, '讨伐名录 · ' + (e.alt || e.char) + (e.py ? '（' + e.py + '）' : ''));
      var body = App.el('div', 'mu-p-body');
      if (e.form) {
        body.appendChild(App.el('p', 'mu-p-p', e.form));
      }
      var dl = App.el('dl', 'mu-p-dl');
      var parts = (e.parts || []).map(function (x) {
        return x.n + (x.a ? '（' + x.a + '）' : '');
      });
      if (parts.length) { row(dl, '可拆构件', parts.join(' · ')); }
      if (e.play) { row(dl, '破解', e.play); }
      if (e.glyph) { row(dl, '字形', '字库有此字的甲骨形：' + e.glyph); }
      else { row(dl, '字形', '字库无此字的整字甲骨形，只作名录'); }
      body.appendChild(dl);
      body.appendChild(App.el('p', 'mu-p-note',
        '拆解与形象取自讨伐页的既有数据；馆内只做"拆开看构件"，不替代关卡里的战斗判定。'));
      var acts = App.el('div', 'mu-p-acts');
      var a1 = App.el('a', 'mu-btn mu-btn-primary', '去讨伐这一尊');
      a1.href = '#/play/boss-3d';
      acts.appendChild(a1);
      var a2 = App.el('button', 'mu-btn', '关掉，继续拆');
      a2.type = 'button';
      a2.onclick = closePanel;
      acts.appendChild(a2);
      body.appendChild(acts);
      p.appendChild(body);
    });
  }

  /* ---------- 我的典藏 ---------- */  function openCollection() {
    var st = (App.atlas && App.atlas.stats) ? App.atlas.stats() : null;
    openPanel(function (p) {
      panelHead(p, '贝', '我的典藏区 · 观展与进度');
      var body = App.el('div', 'mu-p-body');

      var nums = App.el('div', 'mu-p-nums');
      [['馆内观展', seenCount() + ' / 12'],
       ['图鉴已识', st ? (st.learned + ' / ' + st.chars) : '—'],
       ['掌握度', st ? (st.percent + '%') : '—']].forEach(function (kv) {
        var c = App.el('div', 'mu-p-num');
        c.appendChild(App.el('b', null, kv[1]));
        c.appendChild(App.el('span', null, kv[0]));
        nums.appendChild(c);
      });
      body.appendChild(nums);

      var keys = Object.keys(S.seen);
      if (!keys.length) {
        body.appendChild(App.el('p', 'mu-p-empty',
          '典藏还空着。去甲骨文展厅点一件骨版，看过就收进来了。'));
      } else {
        body.appendChild(App.el('p', 'mu-p-k', '已收展品'));
        var box = App.el('div', 'mu-p-seen');
        keys.forEach(function (ch) {
          var b = App.el('button', 'mu-p-seenitem');
          b.type = 'button';
          var g = glyphNode(ch, 'mu-p-seen-g');
          if (g) { b.appendChild(g); }
          b.appendChild(App.el('span', null, ch));
          b.onclick = function () {
            openExhibit(ch, false);
            if (S.api && S.area === 'gallery') { S.api.focusExhibit(ch); }
          };
          box.appendChild(b);
        });
        body.appendChild(box);
      }

      /* ---------- 今日所得：三关的东西收到这里 ---------- */
      var pg = (App.progress && App.progress.summary) ? App.progress.summary() : null;
      if (pg && (pg.total || (pg.boss && pg.boss.cleared))) {
        body.appendChild(App.el('p', 'mu-p-k', '今日所得 · 三关收口'));
        var got = App.el('div', 'mu-p-nums');
        [['认过的字', pg.total + ''],
         ['骨片点开', pg.floatN + ''],
         ['守字之骨', (pg.boss && pg.boss.cleared) ? '已通过' : '未通过']
        ].forEach(function (kv) {
          var cc = App.el('div', 'mu-p-num');
          cc.appendChild(App.el('b', null, kv[1]));
          cc.appendChild(App.el('span', null, kv[0]));
          got.appendChild(cc);
        });
        body.appendChild(got);

        if (pg.chars.length) {
          var chips = App.el('div', 'mu-p-seen');
          pg.chars.slice(0, 24).forEach(function (ch) {
            var b2 = App.el('button', 'mu-p-seenitem');
            b2.type = 'button';
            var g2 = glyphNode(ch, 'mu-p-seen-g');
            if (g2) { b2.appendChild(g2); }
            b2.appendChild(App.el('span', null, ch));
            b2.onclick = function () { openExhibit(ch, false); };
            chips.appendChild(b2);
          });
          body.appendChild(chips);
        }
      }

      var acts = App.el('div', 'mu-p-acts');
      var g1 = App.el('button', 'mu-btn', '去第一关');
      g1.type = 'button';
      g1.onclick = function () { openPlay('bone-build', '造字探索区'); };
      acts.appendChild(g1);
      var g2e = App.el('button', 'mu-btn', '去骨片空间');
      g2e.type = 'button';
      g2e.onclick = function () { openPlay('bone-float', '浮空骨片区 · 骨片浮空'); };
      acts.appendChild(g2e);
      var g3 = App.el('button', 'mu-btn', '去守字之骨');
      g3.type = 'button';
      g3.onclick = function () { openPlay('boss-3d', '守字之骨区 · 三阶段'); };
      acts.appendChild(g3);
      var a1 = App.el('a', 'mu-btn mu-btn-primary', '探索档案');
      a1.href = '#/archive';
      acts.appendChild(a1);
      var a2 = App.el('a', 'mu-btn', '汉字图鉴');
      a2.href = '#/atlas';
      acts.appendChild(a2);
      body.appendChild(acts);
      p.appendChild(body);
    });
  }

  function paintProgress() {
    var el = document.getElementById('muProg');
    if (!el) { return; }
    el.textContent = '已观展 ' + seenCount() + '/12';
  }

  /* ---------- 2D 降级展厅 ----------
     3D 挂了也要能看展、能进玩法。这里没有任何 3D 依赖。 */
  function toFallback(title, note) {
    S.fallback = true;
    var stage = S.stage;
    if (!stage) { return; }
    if (S.wrap) { S.wrap.setAttribute('data-fallback', '1'); }
    App.clearNode(stage);
    stage.className = 'mu-stage mu-stage-2d';

    var box = App.el('div', 'mu-fb');
    var head = App.el('div', 'mu-fb-head');
    head.appendChild(App.el('h2', 'mu-fb-title', '平面展厅'));
    head.appendChild(App.el('p', 'mu-fb-note', title + ' —— ' + note));
    box.appendChild(head);

    var hall = App.el('div', 'mu-fb-hall');
    var center = App.el('div', 'mu-fb-center');
    var bone = App.el('img', 'mu-fb-bone');
    bone.src = 'assets/oracle-bone.webp';
    bone.alt = '一片甲骨（实拍，用于平面展厅的中央展位）';
    center.appendChild(bone);
    var plate = App.el('div', 'mu-fb-plate');
    plate.appendChild(App.el('span', 'mu-fb-plate-ch', '卜'));
    plate.appendChild(App.el('span', null, '中央展品 · 点选看展签'));
    plate.tabIndex = 0;
    plate.setAttribute('role', 'button');
    plate.onclick = function () { openExhibit('卜', true); };
    center.appendChild(plate);
    hall.appendChild(center);

    var grid = App.el('div', 'mu-fb-zones');
    ZONES.forEach(function (z) {
      var c = App.el('button', 'mu-fb-zone');
      c.type = 'button';
      var g = glyphNode(z.glyph, 'mu-fb-zone-g');
      if (g) { c.appendChild(g); }
      c.appendChild(App.el('b', null, z.name));
      c.appendChild(App.el('span', null, z.note));
      c.onclick = function () { enterZone(z.id); };
      grid.appendChild(c);
    });
    hall.appendChild(grid);
    box.appendChild(hall);

    /* 十二件展品仍然可以点开看展签。
       ⚠ 这里原来写死的是那十二个常用字（日 月 雨 山 川 泉 木 林 牛 鱼 门 鼎），
       环上换成四段陈列之后，没有 WebGL 的用户会看到一排厅里已经不存在的字。
       改成读同一份数据，两边的陈列永远一致。 */
    var rowWrap = App.el('div', 'mu-fb-row');
    rowWrap.appendChild(App.el('h3', 'mu-fb-h', '甲骨文展厅 · 四段十二件'));
    var list = App.el('div', 'mu-fb-list');
    var fbItems = (App.oracleHall && App.oracleHall.items) || [];
    fbItems.forEach(function (it) {
      var b = App.el('button', 'mu-fb-item');
      b.type = 'button';
      var g = glyphNode(it.ch, 'mu-fb-item-g');
      if (g) { b.appendChild(g); }
      b.appendChild(App.el('span', null, it.now || it.ch));
      b.appendChild(App.el('em', 'mu-fb-item-tag', it.tag || ''));
      if (S.seen[it.ch]) { b.classList.add('is-seen'); }
      b.onclick = function () { openExhibit(it.ch, false); };
      list.appendChild(b);
    });
    rowWrap.appendChild(list);
    box.appendChild(rowWrap);

    stage.appendChild(box);

    if (S.loading) {
      S.loading.classList.add('is-off');
      setTimeout(function () {
        if (S.loading && S.loading.parentNode) { S.loading.parentNode.removeChild(S.loading); }
      }, 400);
    }
    say('三维展厅这次没开起来，不过图上这些还是能点。想看哪一件？');
  }

  /* ---------- 释放 ---------- */
  function teardown() {
    closePlay();
    /* 清声音：环境音垫是常驻振荡器，不 dispose 就会一直响到下一个页面；
       战斗音乐、开关回调同理，一处漏掉就是"离开展馆了还有声音"。 */
    if (S.armAudio) {
      document.removeEventListener('pointerdown', S.armAudio, true);
      document.removeEventListener('keydown', S.armAudio, true);
      S.armAudio = null;
    }
    if (S.offAudio) { try { S.offAudio(); } catch (e) {} S.offAudio = null; }
    if (App.battleMusic) {
      try {
        if (App.battleMusic.isPlaying && App.battleMusic.isPlaying()) { App.battleMusic.stop(0.4); }
        if (App.battleMusic.dispose) { App.battleMusic.dispose(); }
      } catch (e) {}
    }
    if (App.battleSfx && App.battleSfx.release) { try { App.battleSfx.release(); } catch (e) {} }
    if (App.museumAudio) {
      try {
        if (App.museumAudio.duck) { App.museumAudio.duck(false); }
        if (App.museumAudio.dispose) { App.museumAudio.dispose(); }
      } catch (e) {}
    }
    /* 出馆：把站点的 BGM 还回去 */
    if (App.sound && App.sound.resume) { App.sound.resume(); }
    S.alive = false;
    S.ready = false;
    if (S.off) { try { S.off(); } catch (e) {} S.off = null; }
    window.removeEventListener('resize', syncStack);
    if (S.onLeave) { document.removeEventListener('click', S.onLeave, true); S.onLeave = null; }
    if (S.onKey) { document.removeEventListener('keydown', S.onKey); S.onKey = null; }
    if (S.api) {
      try { S.api.dispose(); } catch (e) {}
      S.api = null;
    }
    document.body.classList.remove('mu-lock');
    S.wrap = null;
    S.stage = null;
    S.panel = null;
    S.loading = null;
    S.guideText = null;
    S.selected = null;
    S.area = 'hall';
  }

  /* 路由用的场景构造器 */
  function sceneRoot() { return scene(); }

  App.museum = {
    scene: sceneRoot,
    zones: ZONES,
    teardown: teardown,
    /* 供别处（或深链）调用：进某个展区 / 直接打开某件展签 / 在馆里开一个玩法 */
    enter: enterZone,
    openPlay: openPlay,
    closePlay: closePlay,
    openExhibit: openExhibit,
    /* 给自查脚本用：拿到 3D 实例（只在测试里调，界面代码不走这里） */
    api: function () { return S.api; },
    /* 供自查脚本读状态 */
    debug: function () {
      return {
        ready: S.ready, fallback: S.fallback, area: S.area,
        seen: seenCount(), panel: S.panel ? S.panel.getAttribute('aria-hidden') : null,
        info: S.api ? S.api.info() : null
      };
    }
  };

})(window.App = window.App || {});
