/* ============================================================
   字有骨气 · 考绩（reward.js）
   ------------------------------------------------------------
   原站在"结算"这件事上缺一口气：
     三个玩法各自把进度写进本机，成就与评级都从真实进度算——
     但**算的时机是回到壳层渲染**。也就是说，答对的那一刻什么都不会发生，
     玩家要自己走回首页，才看到"哦，我多了个字"。

   这一层补的就是"那一下"：
     认字 / 点亮 / 通关 → 立刻结算成「契」→ 计数器跳一下、飘一行字；
     契攒够 → 开一片「卜骨」→ 摆一桌典礼；
     六片集齐 → 贞人。

   为什么叫"契"：
     商代卜完要在骨上刻"验辞"，记这一卦准不准——最早的记账。
     所以奖励物是刻在骨上的记号，不是金币。这一句能在答辩时讲明白。

   实现上的关键：
     玩法模块一行都不改。`App.store.set` 是唯一写进度的口子，
     这里把它包一层，写完后比对"前后进度差"再结算。
     （玩法里埋钩子要改三个文件，且以后新增玩法会漏掉。）
   ============================================================ */
(function (App) {
  'use strict';

  if (!App || !App.store) { return; }

  var KEY = 'kaoji';

  /* 结算汇率：为什么认字给得多？
     本作的核心动词是"认"，通关只是手段。 */
  var RATE = { char: 10, obj: 5, boss: 30, perfect: 20 };

  /* 六片卜骨。门槛按"一次完整试玩能开第一片"定的：
     首片 60 契 = 6 个新字，一局构字就到。 */
  var BONES = [
    { at: 60,   ch: '日', name: '龟腹甲', line: '贞：翌日其明？',   note: '日出而作，日入而息。' },
    { at: 150,  ch: '月', name: '牛肩胛骨', line: '贞：月有食？',   note: '月有圆缺，商人以月纪时。' },
    { at: 300,  ch: '雨', name: '龟腹甲', line: '贞：今日其雨？',   note: '卜雨是卜辞里最多的一类。' },
    { at: 500,  ch: '田', name: '牛肩胛骨', line: '贞：王其田，无灾？', note: '田猎既是练兵，也是祭祀。' },
    { at: 800,  ch: '戈', name: '龟背甲', line: '贞：伐某方，受有祐？', note: '征伐之前必先卜。' },
    { at: 1200, ch: '龜', name: '整副卜甲', line: '贞：用龜，吉？', note: '龟甲为卜，兽骨为骨——合起来才是"甲骨"。' }
  ];

  /* ---------- 状态 ---------- */
  function load() {
    var s = App.store.get(KEY, null);
    if (!s || typeof s !== 'object') { s = {}; }
    var out = {
      qi: Number(s.qi) || 0,
      bones: Math.min(Number(s.bones) || 0, BONES.length),
      day: s.day || '',
      seenAuth: !!s.seenAuth
    };
    /* 自愈：契已经够、骨片却没开（手改存档 / 版本升级都会撞上），
       静默补齐。不然总览里会出现"还差 -120 契"这种鬼话。 */
    var fixed = false;
    while (out.bones < BONES.length && out.qi >= BONES[out.bones].at) {
      out.bones++; fixed = true;
    }
    if (fixed) { App.store.set(KEY, out); }
    return out;
  }
  function save(s) { App.store.set(KEY, s); }

  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }

  /* ---------- 进度快照 ---------- */
  function snap() {
    if (!App.achievements || !App.achievements.raw) { return null; }
    var r;
    try { r = App.achievements.raw(); } catch (e) { return null; }
    return {
      learned: r.learned || 0,
      obj: r.objDone || 0,
      boss: r.bossCleared || 0,
      perfect: r.bossPerfect || 0
    };
  }

  /* ---------- 结算 ---------- */
  var uiQueue = [];

  function settle(before) {
    var after = snap();
    if (!before || !after) { return; }

    var dc = after.learned - before.learned;
    var dO = after.obj - before.obj;
    var dB = after.boss - before.boss;
    var dP = after.perfect - before.perfect;

    /* 负数说明被清档了，不结算（否则会出现"倒扣"的诡异提示） */
    if (dc < 0 || dO < 0 || dB < 0 || dP < 0) { return; }

    var gain = dc * RATE.char + dO * RATE.obj + dB * RATE.boss + dP * RATE.perfect;
    if (gain <= 0) { return; }

    var s = load();
    var fresh = s.day !== today();
    var mult = fresh ? 2 : 1;
    if (fresh) { s.day = today(); }

    gain *= mult;
    s.qi += gain;

    var opened = [];
    while (s.bones < BONES.length && s.qi >= BONES[s.bones].at) {
      opened.push(BONES[s.bones]);
      s.bones++;
    }
    save(s);

    uiQueue.push({ gain: gain, mult: mult, chars: dc, opened: opened });
    flush();
  }

  /* ---------- 推进 UI ---------- */
  var busy = false;

  function flush() {
    if (busy || !uiQueue.length) { return; }
    var job = uiQueue.shift();
    busy = true;

    bump();
    floatGain(job.gain, job.mult);

    setTimeout(function () {
      if (job.opened.length) {
        showBone(job.opened[0], function () {
          /* 一次开多片时逐片放；余下的塞回队首 */
          if (job.opened.length > 1) {
            uiQueue.unshift({ gain: 0, mult: 1, chars: 0, opened: job.opened.slice(1) });
          }
          busy = false;
          flush();
        });
      } else {
        busy = false;
        flush();
      }
    }, job.opened.length ? 620 : 260);
  }

  /* ---------- 顶栏计数器 ----------
     只放三个数：契、已开卜骨、今日双倍。
     到下一片还差多少，放进点开的"卜骨总览"里说——
     顶上塞一条 2px 的进度线，既看不清也没人看。 */
  function chipHTML() {
    var s = load();
    return '<span class="rw-dot" aria-hidden="true"></span>' +
      '<span class="rw-lab">契</span>' +
      '<b class="rw-num">' + s.qi + '</b>' +
      '<span class="rw-bones">骨 ' + s.bones + '/' + BONES.length + '</span>';
  }

  /* 顶栏每次路由都会重建，所以这里按"有就更新、没有就插入"处理 */
  function mountChip() {
    var right = document.querySelector('.top-right');
    if (!right) { return null; }
    var chip = right.querySelector('.rw-chip');
    if (!chip) {
      chip = document.createElement('button');
      chip.type = 'button';
      chip.setAttribute('aria-label', '考绩：已获契数，点击查看卜骨');
      chip.addEventListener('click', openWall);
      right.insertBefore(chip, right.firstChild);
    }
    chip.innerHTML = chipHTML();
    chip.className = 'rw-chip' + (load().day !== today() ? ' dbl' : '');
    return chip;
  }

  /* 加契时让计数器"被撞一下" */
  function bump() {
    var chip = mountChip();
    if (!chip) { return; }
    if (App.life && App.life.reduced && App.life.reduced()) { return; }
    chip.classList.remove('hit');
    void chip.offsetWidth;      /* 强制回流，同一段动画才能重放 */
    chip.classList.add('hit');
  }

  /* ---------- 飘字 ---------- */
  function floatGain(n, mult) {
    if (App.life && App.life.reduced && App.life.reduced()) { return; }
    var chip = document.querySelector('.rw-chip');
    if (!chip) { return; }
    var r = chip.getBoundingClientRect();

    var el = document.createElement('div');
    el.className = 'rw-float';
    el.textContent = '+' + n + ' 契' + (mult > 1 ? '（今日双倍）' : '');
    el.style.left = (r.left + r.width / 2) + 'px';
    el.style.top = (r.bottom + 6) + 'px';
    document.body.appendChild(el);
    setTimeout(function () {
      if (el.parentNode) { el.parentNode.removeChild(el); }
    }, 1000);
  }

  /* ---------- 骨片刻字（复用 App.oracle 的口径） ---------- */
  function carvedSvg(ch, cls) {
    if (!App.hasGlyph || !App.hasGlyph(ch)) {
      return '<span style="font-size:34px;color:#5b4327">' + ch + '</span>';
    }
    return '<svg class="' + (cls || '') + '" viewBox="0 0 100 100" role="img" ' +
      'aria-label="甲骨文「' + ch + '」">' + App.glyphSvg(ch, 'currentColor') + '</svg>';
  }

  function carveIn(svg) {
    if (!svg || !svg.querySelectorAll) { return; }
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) { return; }
    var paths = svg.querySelectorAll('path');
    for (var i = 0; i < paths.length; i++) {
      var p = paths[i], L = 0;
      try { L = p.getTotalLength(); } catch (e) { L = 0; }
      if (!L || !p.animate) { continue; }
      try {
        p.animate(
          [{ strokeDashoffset: L, strokeDasharray: L + ' ' + L },
           { strokeDashoffset: 0, strokeDasharray: L + ' ' + L }],
          { duration: 420, delay: 160 + i * 60, easing: 'cubic-bezier(.45,.12,.25,1)', fill: 'backwards' }
        );
      } catch (e) { /* 忽略 */ }
    }
  }

  /* ---------- 开卜骨 ----------
     replay=true 是"再翻一遍"：从考绩里点已经拿到的那片时用它，
     措辞要换成"合上"——那片早就收下了，不该再让人"收下"一次。 */
  function showBone(bone, done, replay) {
    var mask = document.createElement('div');
    mask.className = 'rw-mask';
    mask.setAttribute('role', 'dialog');
    mask.setAttribute('aria-modal', 'true');

    var card = document.createElement('div');
    card.className = 'rw-card';
    card.innerHTML =
      '<p class="rw-kicker">' + (replay ? '考 绩 · 再 翻' : '考 绩 · 得 一 片') + '</p>' +
      '<h3 class="rw-title">「' + bone.ch + '」' + bone.name + '</h3>' +
      '<div class="rw-bone">' + carvedSvg(bone.ch, 'rw-bone-glyph') + '</div>' +
      '<p class="rw-line">' + bone.line + '</p>' +
      '<p class="rw-note">' + bone.note + '</p>' +
      '<div class="rw-acts"><button type="button" class="rw-btn" data-close>' +
        (replay ? '合 上' : '收 下') + '</button></div>';

    mask.appendChild(card);
    document.body.appendChild(mask);

    carveIn(card.querySelector('.rw-bone svg'));

    function close() {
      if (mask.parentNode) { mask.parentNode.removeChild(mask); }
      document.removeEventListener('keydown', onKey);
      if (done) { done(); }
    }
    function onKey(e) { if (e.key === 'Escape' || e.key === 'Enter') { close(); } }

    card.querySelector('[data-close]').addEventListener('click', close);
    mask.addEventListener('click', function (e) { if (e.target === mask) { close(); } });
    document.addEventListener('keydown', onKey);
    setTimeout(function () { card.querySelector('[data-close]').focus(); }, 60);
  }

  /* ---------- 卜骨总览 ---------- */
  function openWall() {
    var s = load();
    var mask = document.createElement('div');
    mask.className = 'rw-mask';
    mask.setAttribute('role', 'dialog');
    mask.setAttribute('aria-modal', 'true');

    var wall = '';
    for (var i = 0; i < BONES.length; i++) {
      var b = BONES[i];
      var on = i < s.bones;
      /* 已得的用 <button>：总览不只是战绩，还是一册可以翻回去重读的骨片。
         没得的留在 <div>：点了也没东西可看，别给假的可点暗示。 */
      wall += on
        ? '<button type="button" class="rw-slot on" data-bone="' + i + '"' +
          ' title="「' + b.ch + '」' + b.name + ' —— 再翻一遍" aria-label="翻看「' + b.ch + '」' + b.name + '">' +
          carvedSvg(b.ch, 'rw-bone-glyph') + '</button>'
        : '<div class="rw-slot"><span>还差 ' + (b.at - s.qi) + ' 契</span></div>';
    }

    var nextAt = BONES[Math.min(s.bones, BONES.length - 1)].at;
    var tail = '认字、点亮王邑、通关讨伐都能得契。';
    tail += s.bones >= BONES.length
      ? ' 六片已齐——你在骨上留下的记号，和贞人一样多了。'
      : ' 下一片在 ' + nextAt + ' 契，还差 ' + Math.max(0, nextAt - s.qi) + ' 契。';
    if (s.bones > 0 && s.bones < BONES.length) {
      tail += ' 拿到的那几片，点一下可以再翻。';
    }

    var card = document.createElement('div');
    card.className = 'rw-card';
    card.innerHTML =
      '<p class="rw-kicker">考 绩</p>' +
      '<h3 class="rw-title">已得 ' + s.bones + ' / ' + BONES.length + ' 片卜骨</h3>' +
      '<div class="rw-wall">' + wall + '</div>' +
      '<p class="rw-line">累积 ' + s.qi + ' 契</p>' +
      '<p class="rw-note">' + tail + '</p>' +
      '<div class="rw-acts"><button type="button" class="rw-btn ghost" data-close>关 上</button></div>';

    mask.appendChild(card);
    document.body.appendChild(mask);

    /* 点已得的那片 → 重看它的卜辞；看完回到总览，不用再点一次顶栏 */
    var opened = card.querySelectorAll('[data-bone]');
    for (var k = 0; k < opened.length; k++) {
      opened[k].addEventListener('click', function () {
        var bone = BONES[parseInt(this.getAttribute('data-bone'), 10)];
        if (!bone) { return; }
        close();
        showBone(bone, function () { openWall(); }, true);
      });
    }

    function close() {
      if (mask.parentNode) { mask.parentNode.removeChild(mask); }
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) { if (e.key === 'Escape') { close(); } }
    card.querySelector('[data-close]').addEventListener('click', close);
    mask.addEventListener('click', function (e) { if (e.target === mask) { close(); } });
    document.addEventListener('keydown', onKey);
  }

  /* ---------- 挂到唯一的写入口上 ---------- */
  var WATCH = { bonebuild: 1, wangyi: 1, bossraid: 1 };
  var origSet = App.store.set;

  App.store.set = function (key, val) {
    var before = WATCH[key] ? snap() : null;
    var ok = origSet.apply(App.store, arguments);
    if (ok && before) {
      try { settle(before); } catch (e) { /* 结算失败绝不影响存档 */ }
    }
    return ok;
  };

  /* ---------- 生命周期 ---------- */
  App.on('route', function () {
    /* 头栏每次渲染都会重建，chip 要跟着重挂 */
    setTimeout(mountChip, 0);
  });

  setTimeout(function () {
    mountChip();
    /* 首次运行：把当前进度折算成基础契，
       但不弹飘字——老玩家回来会被一屏提示淹没。 */
    var s = load();
    if (!s.seenAuth) {
      var now = snap();
      if (now) {
        s.qi = now.learned * RATE.char + now.obj * RATE.obj +
               now.boss * RATE.boss + now.perfect * RATE.perfect;
        while (s.bones < BONES.length && s.qi >= BONES[s.bones].at) { s.bones++; }
      }
      s.seenAuth = true;
      save(s);
      mountChip();
    }
  }, 0);

  App.kaoji = {
    state: load,
    bones: BONES,
    /* 调试用：直接加契，验界面 */
    grant: function (n) {
      var s = load(); s.qi += Number(n) || 0;
      var opened = [];
      while (s.bones < BONES.length && s.qi >= BONES[s.bones].at) {
        opened.push(BONES[s.bones]); s.bones++;
      }
      save(s);
      uiQueue.push({ gain: Number(n) || 0, mult: 1, chars: 0, opened: opened });
      flush();
      return s.qi;
    },
    reset: function () { App.store.del(KEY); mountChip(); }
  };

})(window.App = window.App || {});
