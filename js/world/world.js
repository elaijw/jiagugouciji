/* ============================================================
   甲骨奇谭 · 3D 世界：场景外壳 + HUD + 交互
   —— world3d.js 只管渲染和"我在哪"；这里管"看到什么、点了算什么"。

   交互闭环（第一阶段就要能真的走通）：
     走进范围 → 底部浮出「地点名 · 点一下」
     点击 / 按 E → 打开碑文面板
     碑文面板里点一个字 → 真实的甲骨字形 + 释义 + 构形说明
     认过就写进 ziqu.wangyi 存档（与第二关共用同一份进度）
   ============================================================ */
(function (App) {
  'use strict';

  var S = {
    alive: false, api: null, stage: null, wrap: null,
    near: null, panel: null, ready: false, err: null
  };

  /* ---------- 进度：与第二关共用 ziqu.wangyi ---------- */
  function progress() {
    var p = App.store.get('wangyi', null);
    if (!p || typeof p !== 'object') { p = {}; }
    if (!p.done || typeof p.done !== 'object') {
      p.done = (p.seen && typeof p.seen === 'object') ? p.seen : {};
    }
    return p;
  }
  function known(p, zid, ch) {
    return (p.done[zid] || []).indexOf(ch) >= 0;
  }
  function markKnown(zid, ch) {
    var p = progress();
    if (!p.done[zid]) { p.done[zid] = []; }
    if (p.done[zid].indexOf(ch) < 0) {
      p.done[zid].push(ch);
      App.store.set('wangyi', p);
      return true;
    }
    return false;
  }
  function zoneStat(z) {
    var p = progress();
    var objs = z.objects || [];
    var done = objs.filter(function (o) { return known(p, z.id, o.char); }).length;
    return { total: objs.length, done: done, clear: objs.length > 0 && done >= objs.length };
  }
  function worldStat() {
    var zs = (App.levels && App.levels.map && App.levels.map.zones) || [];
    var t = 0, d = 0, c = 0;
    zs.forEach(function (z) {
      var s = zoneStat(z); t += s.total; d += s.done; if (s.clear) { c++; }
    });
    return { zones: zs.length, total: t, done: d, clear: c };
  }
  function zoneData(id) {
    var zs = (App.levels && App.levels.map && App.levels.map.zones) || [];
    for (var i = 0; i < zs.length; i++) { if (zs[i].id === id) { return zs[i]; } }
    return null;
  }

  /* 已认的字摊平成 { char: true }，交给场景把碑面点亮 */
  function paintKnown() {
    var p = progress();
    var known = {};
    Object.keys(p.done || {}).forEach(function (zid) {
      (p.done[zid] || []).forEach(function (ch) { known[ch] = true; });
    });
    if (S.api && S.api.setKnown) { S.api.setKnown(known); }
    return known;
  }

  /* ---------- 三关：顺序、任务、解锁 ----------
     这三关不是"地图上随便点点"，而是一条有先后的路：
       一关 · 发现文字   在天象区把 4 个字都认下来（走近实物 → 看字 → 记进识字簿）
       二关 · 构字探索   在草木 / 山川把 3 组"实体构件"拼回成字
       三关 · BOSS 讨伐  到祭坛进冂门，打一场真的 3D BOSS 战
     前一关没过，后一关的门阙封牌不会升起来，人也过不去。 */
  var LEVELS = [
    { id: 1, name: '第一关 · 发现文字', zones: ['sky'], open: ['sky'],
      lead: '先去天象台 —— 那里立着四件龟甲、腹甲上刻着日、月、雨、火。走到跟前点开它。' },
    { id: 2, name: '第二关 · 构字探索', zones: ['land', 'plant'], open: ['land', 'plant'],
      lead: '草木与山川之间立着三座青铜构件装置。每个字的部件散在环外，按书写次序把它们点回原位 —— 拢起来才是那个字。' },
    { id: 3, name: '第三关 · BOSS 讨伐', zones: ['beast', 'life'], open: ['beast', 'life'],
      lead: '祭坛的冂门开了。青铜转盘后面是一场 3D 讨伐 —— 打赢了，那些困在甲骨里的字就放回来了。' }
  ];
  var ASSEMBLY_CHARS = ['林', '泉', '谷'];

  function save() { return progress(); }
  function commit(p) { App.store.set('wangyi', p); }

  /* 三关进度单独存在 wangyi.stages 里，仍然与第二关共用同一个存档键 */
  function stage() {
    var p = progress();
    if (!p.stages || typeof p.stages !== 'object') {
      p.stages = { cur: 1, cleared: [], asm: {}, boss: {} };
      commit(p);
    }
    if (!p.stages.cleared) { p.stages.cleared = []; }
    if (!p.stages.asm) { p.stages.asm = {}; }
    if (!p.stages.boss) { p.stages.boss = {}; }
    return p.stages;
  }
  function cleared(lv) { return stage().cleared.indexOf(lv) >= 0; }

  /* 每一关的完成条件 —— 都判定在世界里的真实动作上，不是面板里点个确认 */
  function levelProgress(lv) {
    if (lv === 1) {
      var z = zoneData('sky');
      var st = z ? zoneStat(z) : { done: 0, total: 0 };
      return { done: st.done, total: st.total, ok: st.total > 0 && st.done >= st.total };
    }
    if (lv === 2) {
      var n = 0;
      ASSEMBLY_CHARS.forEach(function (c) { if (stage().asm[c]) { n++; } });
      return { done: n, total: ASSEMBLY_CHARS.length, ok: n >= ASSEMBLY_CHARS.length };
    }
    return { done: stage().boss.win ? 1 : 0, total: 1, ok: !!stage().boss.win };
  }
  function currentLevel() {
    for (var i = 0; i < LEVELS.length; i++) {
      if (!cleared(LEVELS[i].id)) { return LEVELS[i].id; }
    }
    return 3;
  }

  /* 门阙开合：把"进度"真的映射到界面与碰撞上 */
  function refreshGates() {
    if (!S.api || !S.api.setGate) { return; }
    S.api.setGate('sky', true);
    LEVELS.forEach(function (L) {
      L.open.forEach(function (zid) {
        if (zid === 'sky') { return; }
        var prev = L.id - 1;
        S.api.setGate(zid, cleared(prev));
      });
    });
  }
  /* 每关完成时把王邑点亮：相应区集体的字也跟着亮 */
  function paintLevelState() { paintKnown(); refreshGates(); goalRefresh(); }

  /* ---------- 字形 ---------- */
  function glyphEl(ch, cls) {
    if (!App.glyphSvg) { return null; }
    var inner = App.glyphSvg(ch, 'currentColor');
    if (!inner) { return null; }
    var sv = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    sv.setAttribute('viewBox', '0 0 ' + ((App.glyphs && App.glyphs.canvas) || 100) + ' ' +
      ((App.glyphs && App.glyphs.canvas) || 100));
    sv.setAttribute('class', cls || '');
    sv.setAttribute('aria-hidden', 'true');
    sv.innerHTML = inner;
    return sv;
  }

  /* ---------- 场景外壳 ---------- */
  function scene() {
    if (S.alive) { teardown(); }
    S.alive = true;
    S.ready = false;
    S.err = null;
    S.near = null;

    var wrap = App.el('div', 'wd-scene');
    S.wrap = wrap;

    var stage = App.el('div', 'wd-stage');
    stage.id = 'wdStage';
    wrap.appendChild(stage);
    S.stage = stage;

    /* 加载态：永远不留白屏 */
    var boot = App.el('div', 'wd-boot');
    boot.appendChild(App.el('p', 'wd-boot-k', '殷商王邑'));
    boot.appendChild(App.el('p', 'wd-boot-t', '正在夯土筑城…'));
    wrap.appendChild(boot);
    S.boot = boot;

    /* ---------- 顶栏 ---------- */
    var bar = App.el('header', 'wd-bar');
    var back = App.el('a', 'wd-back');
    back.href = '#/museum';
    back.setAttribute('aria-label', '回博物馆');
    var bi = glyphEl('邑', 'wd-back-glyph');
    if (bi) { back.appendChild(bi); } else { back.appendChild(App.el('span', null, '邑')); }
    back.appendChild(App.el('span', 'wd-back-t', '回馆'));
    bar.appendChild(back);

    var place = App.el('div', 'wd-place');
    place.appendChild(App.el('b', 'wd-place-name', '殷商王邑'));
    var sub = App.el('span', 'wd-place-sub', '宗庙广场');
    place.appendChild(sub);
    bar.appendChild(place);
    S.sub = sub;

    var acts = App.el('div', 'wd-acts');
    var btnSound = App.el('button', 'wd-btn', '声音');
    btnSound.type = 'button';
    btnSound.onclick = function () {
      var on = !(App.museumAudio && App.museumAudio.isOn && App.museumAudio.isOn());
      if (App.museumAudio) { App.museumAudio.setEnabled(on); }
      btnSound.classList.toggle('is-on', on);
      btnSound.textContent = on ? '声音 开' : '声音';
      App.toast(on ? '环境声已开' : '环境声已关');
    };
    acts.appendChild(btnSound);
    var btnView = App.el('button', 'wd-btn', '重置视角');
    btnView.type = 'button';
    btnView.onclick = function () {
      if (S.api) { S.api.teleport(S.api.state().x, S.api.state().z); }
    };
    acts.appendChild(btnView);
    bar.appendChild(acts);
    wrap.appendChild(bar);

    /* ---------- 底部提示 ---------- */
    var tip = App.el('div', 'wd-tip');
    tip.appendChild(App.el('span', 'wd-tip-k', 'W A S D'));
    tip.appendChild(App.el('span', null, '走'));
    tip.appendChild(App.el('span', 'wd-tip-k', '拖拽'));
    tip.appendChild(App.el('span', null, '转视角'));
    tip.appendChild(App.el('span', 'wd-tip-k', 'E'));
    tip.appendChild(App.el('span', null, '查看'));
    wrap.appendChild(tip);
    S.tip = tip;

    /* ---------- 目标条：当前是第几关、要做什么、做到几成 ---------- */
    var goal = App.el('div', 'wd-goal');
    var goalLv = App.el('b', 'wd-goal-lv', '第一关');
    var goalTxt = App.el('span', 'wd-goal-t', '');
    var goalBar = App.el('i', 'wd-goal-bar');
    var goalFill = document.createElement('i');
    goalFill.className = 'wd-goal-fill';
    goalBar.appendChild(goalFill);
    goal.appendChild(goalLv);
    goal.appendChild(goalTxt);
    goal.appendChild(goalBar);
    goal.appendChild(App.el('button', 'wd-goal-b', '？'));
    goal.lastChild.type = 'button';
    goal.lastChild.onclick = function () { openLevel(currentLevel(), true); };
    wrap.appendChild(goal);
    S.goal = goal; S.goalLv = goalLv; S.goalTxt = goalTxt; S.goalFill = goalFill;

    /* ---------- 靠近提示 ---------- */
    var near = App.el('div', 'wd-near');
    near.hidden = true;
    var nearName = App.el('b', 'wd-near-name', '');
    var nearHint = App.el('span', 'wd-near-hint', '');
    near.appendChild(nearName);
    near.appendChild(nearHint);
    near.onclick = function () { interact(); };
    wrap.appendChild(near);
    S.nearEl = near; S.nearName = nearName; S.nearHint = nearHint;

    /* ---------- 移动端：摇杆 + 查看键 ---------- */
    var stick = App.el('div', 'wd-stick');
    stick.setAttribute('aria-label', '移动摇杆');
    var knob = App.el('i', 'wd-stick-knob');
    stick.appendChild(knob);
    wrap.appendChild(stick);

    var tapBtn = App.el('button', 'wd-tap', '查看');
    tapBtn.type = 'button';
    tapBtn.onclick = function () { interact(); };
    wrap.appendChild(tapBtn);

    var stickOn = false, sxc = 0, syc = 0;
    function stickStart(e) {
      stickOn = true;
      var r = stick.getBoundingClientRect();
      sxc = r.left + r.width / 2;
      syc = r.top + r.height / 2;
      stickMove(e);
      if (stick.setPointerCapture) { try { stick.setPointerCapture(e.pointerId); } catch (er) {} }
    }
    function stickMove(e) {
      if (!stickOn) { return; }
      var dx = e.clientX - sxc, dy = e.clientY - syc;
      var max = 46;
      var d = Math.hypot(dx, dy);
      if (d > max) { dx = dx / d * max; dy = dy / d * max; d = max; }
      knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      if (S.api) { S.api.setMove(dx / max, dy / max); }
    }
    function stickEnd() {
      stickOn = false;
      knob.style.transform = 'translate(0,0)';
      if (S.api) { S.api.setMove(0, 0); }
    }
    stick.addEventListener('pointerdown', stickStart);
    stick.addEventListener('pointermove', stickMove);
    stick.addEventListener('pointerup', stickEnd);
    stick.addEventListener('pointercancel', stickEnd);
    stick.addEventListener('pointerleave', function () { if (stickOn) { stickEnd(); } });

    /* ---------- 面板 ---------- */
    var panel = App.el('aside', 'wd-panel');
    panel.hidden = true;
    panel.setAttribute('aria-hidden', 'true');
    wrap.appendChild(panel);
    S.panel = panel;

    /* 键盘 E / 空格 */
    S.onKey = function (e) {
      if (!S.alive) { return; }
      if (e.key === 'e' || e.key === 'E' || e.key === ' ' || e.key === 'Enter') {
        if (S.shut) { closePanel(); }
        else { interact(); }
        if (e.preventDefault) { e.preventDefault(); }
      }
      if (e.key === 'Escape' && S.shut) { closePanel(); }
    };
    document.addEventListener('keydown', S.onKey);

    /* 离开路由就释放 —— 不等壳层 */
    if (App.on) {
      S.off = App.on('route', function (r) {
        if (!r || r.name !== 'world') { teardown(); }
      });
    }

    requestAnimationFrame(function () {
      if (!S.alive) { return; }
      /* three.min.js 有 594 KB，GitHub Pages 在国内可能要几十秒。
         8 秒还没就绪就把文案换成实话 —— 别让玩家以为"夯土"真的要夯一分钟。 */
      var slowT = setTimeout(function () {
        var t = boot.querySelector('.wd-boot-t');
        if (t && boot.parentNode) { t.textContent = '3D 引擎较大，正在下载…'; }
      }, 8000);
      App.world3d.create(stage, {
        onTap: function () { /* 轻点画面＝空点，不做事，避免走动时误触 */ },
        onHover: function (h) {
          /* 悬停只做视觉提示（world3d 已经把物件本身点亮了），这里补一行字 */
          if (!h) { return; }
          if (h.type === 'zone') { S.nearHintHover = true; }
        },
        onPick: function (hit) {
          if (!hit) { return; }
          if (hit.type === 'char') {
            var sp = spotById('char-' + hit.zone + '-' + hit.char);
            if (sp && (sp.o.task === 'assembly')) {
              openAssembly(hit.zone, hit.char, hit.piece);
            } else {
              openCharBySpot('char-' + hit.zone + '-' + hit.char);
            }
            return;
          }
          if (hit.type === 'zone') { openZone(hit.zone); return; }
          if (hit.type === 'portal') { openAltar(); return; }
        },
        onNear: function (spot) {
          S.near = spot;
          if (!spot) { near.hidden = true; tapBtn.classList.remove('is-on'); return; }
          var HINT = {
            zone: '点一下看这一片',
            dig: '点一下看探方',
            gate: '点一下出城',
            portal: '点一下进冂门',
            altar: '第三关 · 祭坛',
            gatezone: function (s2) {
              return (s2.data && s2.data.level > currentLevel()) ? ('第' + s2.data.level + '关未开 · 先过第' + currentLevel() + '关') : '点一下看这一关';
            },
            char: function (s2) {
              return (s2.data && s2.data.task === 'assembly') ? '点一下拼这个字' : '点一下认这个字';
            }
          };
          var hz = HINT[spot.kind];
          nearHint.textContent = typeof hz === 'function' ? hz(spot) : (hz || '点一下看看');
          if (spot.kind === 'gatezone' && spot.data && spot.data.level > currentLevel()) {
            near.classList.add('is-lock');
          } else {
            near.classList.remove('is-lock');
          }
          nearName.textContent = spot.kind === 'char' ? '「' + spot.name + '」' : spot.name;
          near.hidden = false;
          tapBtn.classList.add('is-on');
        },
        onZone: function (name) {
          S.sub.textContent = name;
        }
      }, function (err, api) {
        clearTimeout(slowT);
        if (!S.alive) { if (api && api.dispose) { api.dispose(); } return; }
        if (err) {
          S.err = err.message;
          if (boot.parentNode) { boot.parentNode.removeChild(boot); }
          var f = App.el('div', 'wd-fail');
          f.appendChild(App.el('b', null, '这台设备没能启用 3D'));
          f.appendChild(App.el('p', null, err.message + '。可以先回博物馆看展品。'));
          var a = App.el('a', 'btn', '回博物馆');
          a.href = '#/museum';
          f.appendChild(a);
          wrap.appendChild(f);
          return;
        }
        S.api = api;
        S.ready = true;
        paintLevelState();
        if (boot.parentNode) { boot.parentNode.removeChild(boot); }
        say('脚下是殷商王邑。先往北到天象台 —— 那里立着四件龟甲，走近点开它。');
        setTimeout(function () { openLevel(currentLevel(), false); }, 900);
        setTimeout(function () {
          if (S.tip) { S.tip.classList.add('is-fade'); }
        }, 7000);
      });
    });

    return wrap;
  }

  function goalRefresh() {
    if (!S.goal) { return; }
    var lv = currentLevel();
    var L = LEVELS[lv - 1] || LEVELS[0];
    var pr = levelProgress(lv);
    S.goalLv.textContent = L.name;
    S.goalTxt.textContent = lv === 1 ? ('认字 ' + pr.done + '/' + pr.total)
      : (lv === 2 ? ('构字 ' + pr.done + '/' + pr.total) : ('BOSS ' + pr.done + '/' + pr.total));
    S.goalFill.style.width = (pr.total ? pr.done / pr.total * 100 : 0) + '%';
    S.goal.classList.toggle('is-clear', !!pr.ok);
  }

  /* ---------- 说一句话（顶部气泡） ---------- */
  var sayT = 0;
  function say(txt) {
    if (!S.wrap) { return; }
    var b = S.wrap.querySelector('.wd-say');
    if (!b) {
      b = App.el('div', 'wd-say');
      S.wrap.appendChild(b);
    }
    b.textContent = txt;
    b.classList.add('is-on');
    clearTimeout(sayT);
    sayT = setTimeout(function () { b.classList.remove('is-on'); }, 5200);
  }

  /* ---------- 交互 ---------- */
  function interact() {
    if (!S.api || S.shut) { return; }
    var st = S.api.state();
    var n = st.near;
    if (!n) { say('走近一点 —— 石刻、构件装置、冂门都要走到跟前才能看。'); return; }
    if (n.kind === 'char') {
      var sp2 = spotById(n.id);
      if (sp2 && sp2.o.task === 'assembly') { openAssembly(sp2.z.id, sp2.o.char, null); return; }
      openCharBySpot(n.id);
      return;
    }
    if (n.kind === 'gatezone') { openLevel(n.data.level || currentLevel(), false); return; }
    if (n.kind === 'portal') { openAltar(); return; }
    if (n.kind === 'altar') { openAltar(); return; }
    if (n.kind === 'gate') { openGate(); return; }
    if (n.kind === 'dig') { openDig(); return; }
    if (n.kind === 'zone') { openZone(n.id.replace(/^zone-/, '')); return; }
  }

  function shutPanel(build) {
    var p = S.panel;
    App.clearNode(p);
    p.hidden = false;
    p.setAttribute('aria-hidden', 'false');
    S.wrap.classList.add('is-panel');
    S.shut = true;
    build(p);
    p.scrollTop = 0;
  }
  function closePanel() {
    if (!S.panel) { return; }
    S.panel.hidden = true;
    S.panel.setAttribute('aria-hidden', 'true');
    S.wrap.classList.remove('is-panel');
    S.shut = false;
  }
  function head(p, ch, kicker, title, sub) {
    var h = App.el('div', 'wd-p-head');
    var gb = App.el('div', 'wd-p-glyph');
    var g = glyphEl(ch, 'wd-p-obglyph');
    if (g) { gb.appendChild(g); } else { gb.appendChild(App.el('span', null, ch)); }
    h.appendChild(gb);
    var meta = App.el('div', 'wd-p-meta');
    meta.appendChild(App.el('p', 'wd-p-kicker', kicker));
    meta.appendChild(App.el('h2', 'wd-p-title', title));
    if (sub) { meta.appendChild(App.el('p', 'wd-p-sub', sub)); }
    h.appendChild(meta);
    var x = App.el('button', 'wd-p-x', '×');
    x.type = 'button';
    x.setAttribute('aria-label', '关闭');
    x.onclick = closePanel;
    h.appendChild(x);
    p.appendChild(h);
  }
  function bar(p, done, total, label) {
    var wrap = App.el('div', 'wd-p-meter');
    var t = App.el('span', 'wd-p-meter-t', label + ' ' + done + ' / ' + total);
    wrap.appendChild(t);
    var b = App.el('span', 'wd-p-meter-bar');
    var f = App.el('i');
    f.style.width = (total ? done / total * 100 : 0) + '%';
    b.appendChild(f);
    wrap.appendChild(b);
    p.appendChild(wrap);
  }

  /* 地点碑：这一片有多少字、认了几个、每个字都能看 */
  function openZone(zid) {
    var z = zoneData(zid);
    if (!z) { return; }
    var st = zoneStat(z);
    shutPanel(function (p) {
      head(p, z.objects.length ? z.objects[0].char : '邑', '王邑 · 地点碑', z.name, z.note || '');
      bar(p, st.done, st.total, '这一片认了');

      var list = App.el('div', 'wd-p-grid');
      (z.objects || []).forEach(function (o) {
        var kn = known(progress(), z.id, o.char);
        var b = App.el('button', 'wd-p-cell' + (kn ? ' is-known' : ''));
        b.type = 'button';
        var g = glyphEl(o.char, 'wd-p-cell-glyph');
        if (g) { b.appendChild(g); }
        b.appendChild(App.el('span', 'wd-p-cell-ch', o.char));
        b.setAttribute('aria-label', o.char + ' · ' + o.meaning);
        b.onclick = function () { openChar(o, z); };
        list.appendChild(b);
      });
      p.appendChild(list);
      p.appendChild(App.el('p', 'wd-p-foot',
        st.clear ? '这一片的字都认全了。石碑已经全亮。' : '点一个字看它的甲骨形与构形。认过的会亮起来。'));
    });
  }

  function spotById(id) {
    /* 字碑的 spot id 是 char-<zone>-<字>；直接从数据里找到那一条 */
    var m = App.levels && App.levels.map;
    var zs = (m && m.zones) || [];
    for (var i = 0; i < zs.length; i++) {
      var objs = zs[i].objects || [];
      for (var k = 0; k < objs.length; k++) {
        if ('char-' + zs[i].id + '-' + objs[k].char === id) {
          var oo = objs[k];
          if (ASSEMBLY_CHARS.indexOf(oo.char) >= 0) { oo.task = 'assembly'; }
          return { o: oo, z: zs[i] };
        }
      }
    }
    return null;
  }
  function openCharBySpot(id) {
    var hit = spotById(id);
    if (!hit) { return; }
    openChar(hit.o, hit.z);
  }

  /* 区 → 关卡：哪个区的字属于第几关。锁关区里的字可以"看"，不能"认" */
  function zoneLevel(zid) {
    for (var i = 0; i < LEVELS.length; i++) {
      if (LEVELS[i].zones.indexOf(zid) >= 0) { return LEVELS[i].id; }
    }
    return 1;
  }
  function zoneUnlocked(zid) { return zoneLevel(zid) <= currentLevel(); }

  /* 单字：点开即认（写进与第二关共用的存档）。
     锁关区里的字点得动、看得清，但不进识字簿 —— 不然绕着门走一圈就全认完了。 */
  function openChar(o, z) {
    if (z && !zoneUnlocked(z.id)) {
      var lv = zoneLevel(z.id);
      if (S.api && S.api.focusItem) { S.api.focusItem(o.char, z.id); }
      say('「' + o.char + '」看得清，但还锁在第' + lv + '关里。先把第' + (lv - 1) + '关过了再来。');
      return;
    }
    var isNew = markKnown(z.id, o.char);
    if (isNew) {
      paintKnown();
      if (App.museumAudio) { App.museumAudio.click(); }
    }
    /* 选中实物时镜头推近看着它 —— 讲解与"在看哪一件"必须一致 */
    if (S.api && S.api.focusItem) { S.api.focusItem(o.char, z.id); }
    if (isNew) { checkLevel(); }
    shutPanel(function (p) {
      head(p, o.char, (z ? z.name + ' · 王邑实物' : '王邑'), o.char, o.meaning || '');
      var pair = App.el('div', 'wd-p-pair');
      var now = App.el('div', 'wd-p-now');
      now.appendChild(App.el('span', 'wd-p-now-ch', o.char));
      now.appendChild(App.el('span', 'wd-p-now-k', '今字'));
      pair.appendChild(now);
      var ob = App.el('div', 'wd-p-ob');
      var g = glyphEl(o.char, 'wd-p-ob-glyph');
      if (g) { ob.appendChild(g); } else { ob.appendChild(App.el('span', 'wd-p-none', '无整字字形')); }
      ob.appendChild(App.el('span', 'wd-p-now-k', '甲骨字形'));
      pair.appendChild(ob);
      p.appendChild(pair);

      var dl = App.el('dl', 'wd-p-dl');
      function row(k, v) {
        if (!v) { return; }
        var d = App.el('div', 'wd-p-row');
        d.appendChild(App.el('dt', null, k));
        d.appendChild(App.el('dd', null, v));
        dl.appendChild(d);
      }
      row('释义', o.meaning);
      row('构形', o.form);
      if (z) { row('王邑分区', z.name); }
      p.appendChild(dl);

      p.appendChild(App.el('p', 'wd-p-foot', isNew
        ? '记下了 —— 「' + o.char + '」进你的识字簿。'
        : '这个字你认过。想再看，随时点回来。'));
      var backB = App.el('button', 'wd-btn wd-p-back', '回到这一片');
      backB.type = 'button';
      backB.onclick = function () { openZone(z.id); };
      p.appendChild(backB);
    });
  }

  /* 探方：从这一片还没认的字里取出三片，认完就亮 */
  function openDig() {
    var p0 = progress();
    var pool = [];
    ((App.levels && App.levels.map && App.levels.map.zones) || []).forEach(function (z) {
      (z.objects || []).forEach(function (o) {
        if (!known(p0, z.id, o.char)) { pool.push({ o: o, z: z }); }
      });
    });
    if (!pool.length) {
      shutPanel(function (p) {
        head(p, '骨', '王邑 · 探方', '发掘中的探方', '土里的字你都已经认过了');
        p.appendChild(App.el('p', 'wd-p-foot',
          '这一片探方已经清完。往北的观星台、西南的人居里，还有没认的字。'));
      });
      return;
    }
    /* 取三片：用字符码做稳定取样，同一次进来看到的顺序不会跳 */
    var R = App.museumTex ? App.museumTex.rng(pool.length * 31 + 7) : Math.random;
    var pick = pool.slice();
    for (var i = pick.length - 1; i > 0; i--) {
      var j = Math.floor(R() * (i + 1));
      var t = pick[i]; pick[i] = pick[j]; pick[j] = t;
    }
    pick = pick.slice(0, 3);

    shutPanel(function (p) {
      head(p, '骨', '王邑 · 探方', '刚出土的三片', '土里露出来的，是三千年前的刻痕');
      p.appendChild(App.el('p', 'wd-p-lead',
        '探方底下露出三片刻辞。点一片，看它是什么字 —— 认下来的就记进识字簿。'));
      var list = App.el('div', 'wd-p-grid wd-p-grid-3');
      pick.forEach(function (it) {
        var b = App.el('button', 'wd-p-bone');
        b.type = 'button';
        var g = glyphEl(it.o.char, 'wd-p-bone-glyph');
        if (g) { b.appendChild(g); }
        b.appendChild(App.el('span', 'wd-p-bone-t', it.z.name));
        b.onclick = function () { openChar(it.o, it.z); };
        list.appendChild(b);
      });
      p.appendChild(list);
    });
  }

  function openGate() {
    shutPanel(function (p) {
      head(p, '门', '王邑 · 城门', '出城回馆', '城门朝南，出去就是博物馆');
      p.appendChild(App.el('p', 'wd-p-foot',
        '王邑在城外，馆里在城内。这一趟先到这里，随时可以再出城。'));
      var a = App.el('a', 'btn', '回博物馆');
      a.href = '#/museum';
      p.appendChild(a);
    });
  }

  /* ---------- 关卡面板 ---------- */
  var HINT = {
    1: '走到跟前点开它 —— 看过就算认下了，字会亮起来。',
    2: '构件散在青铜环外。按书写次序从第一个点到最后一个，它会飞回原位。',
    3: '祭坛的冂门要用字敲开：打赢 BOSS，困在甲骨里的字就放回来。'
  };

  /* 进度写回：App.store.get 每次 JSON.parse 出"新对象"，
     所以"改 stage() 返回的对象、再 commit(progress())"会静默丢档 ——
     commit(progress()) 拿到的是重新解析的旧数据，刚改的那份被扔掉。
     必须同一个对象：改完哪份就 commit 哪份。 */
  function stageMut(fn) {
    var p = progress();
    if (!p.stages || typeof p.stages !== 'object') { p.stages = { cur: 1, cleared: [], asm: {}, boss: {} }; }
    if (!p.stages.cleared) { p.stages.cleared = []; }
    if (!p.stages.asm) { p.stages.asm = {}; }
    if (!p.stages.boss) { p.stages.boss = {}; }
    fn(p.stages);
    commit(p);
  }

  function checkLevel() {
    goalRefresh();
    var lv = currentLevel();
    var pr = levelProgress(lv);
    if (pr.ok && !cleared(lv)) {
      stageMut(function (stg) { stg.cleared.push(lv); });
      refreshGates();
      goalRefresh();
      openLevelClear(lv);
      if (App.museumAudio) { App.museumAudio.unlock ? App.museumAudio.unlock() : App.museumAudio.click(); }
    }
  }

  function openLevel(lv, force) {
    var L = LEVELS[lv - 1];
    if (!L) { return; }
    var locked = lv > currentLevel();
    var pr = levelProgress(lv);
    shutPanel(function (p) {
      head(p, lv === 1 ? '日' : (lv === 2 ? '林' : '龍'), '关卡 ' + lv, L.name,
        locked ? '先把前一关走完' : L.lead);
      bar(p, pr.done, pr.total, locked ? '尚未开启' : '这一关的进度');
      if (locked) {
        p.appendChild(App.el('p', 'wd-p-lead',
          '前面一关还没过，门阙上的骨封牌还堵着。先把第 ' + currentLevel() + ' 关做完 —— 做完了能看见封牌自己升起来。'));
        return;
      }
      p.appendChild(App.el('p', 'wd-p-lead', HINT[lv] || ''));
      var list = App.el('div', 'wd-p-tasks');
      if (lv === 1) {
        var z = zoneData('sky');
        (z && z.objects ? z.objects : []).forEach(function (o) {
          var kn = known(progress(), z.id, o.char);
          var b = App.el('button', 'wd-p-cell' + (kn ? ' is-known' : ''));
          b.type = 'button';
          var g = glyphEl(o.char, 'wd-p-cell-glyph');
          if (g) { b.appendChild(g); }
          b.appendChild(App.el('span', 'wd-p-cell-ch', o.char));
          b.onclick = function () { openChar(o, z); };
          list.appendChild(b);
        });
      } else if (lv === 2) {
        ASSEMBLY_CHARS.forEach(function (c) {
          var sp2 = spotById2(c);
          var done = !!stage().asm[c];
          var b = App.el('div', 'wd-p-task' + (done ? ' is-done' : ''));
          var g = glyphEl(c, 'wd-p-task-glyph');
          if (g) { b.appendChild(g); }
          b.appendChild(App.el('span', 'wd-p-task-t', c + ' · ' + (sp2 ? sp2.z.name : '') +
            (done ? ' · 已拼成' : ' · 未拼')));
          var go = App.el('button', 'wd-btn', '去拼');
          go.type = 'button';
          go.onclick = function () { if (sp2) { openAssembly(sp2.z.id, c, null); } };
          b.appendChild(go);
          list.appendChild(b);
        });
      } else {
        var b3 = App.el('div', 'wd-p-task' + (cleared(3) ? ' is-done' : ''));
        var g3 = glyphEl('龍', 'wd-p-task-glyph');
        if (g3) { b3.appendChild(g3); }
        b3.appendChild(App.el('span', 'wd-p-task-t',
          cleared(3) ? 'BOSS 已讨伐 · 王邑复原' : '祭坛冂门 · 未讨伐'));
        var go3 = App.el('button', 'wd-btn', '去看冂门');
        go3.type = 'button';
        go3.onclick = function () { openAltar(); };
        b3.appendChild(go3);
        list.appendChild(b3);
      }
      p.appendChild(list);
      if (cleared(lv)) {
        p.appendChild(App.el('p', 'wd-p-foot', '这一关已经过了。'));
      }
    });
  }

  function openLevelClear(lv) {
    var L = LEVELS[lv - 1];
    var next = LEVELS[lv];
    shutPanel(function (p) {
      head(p, lv === 1 ? '日' : (lv === 2 ? '林' : '龍'), '通关', L.name + ' · 完成', next ? '下一处已经开了' : '全部三关已通');
      p.appendChild(App.el('p', 'wd-p-lead',
        lv === 1 ? '天象区的四件龟甲都读过了。草木、山川那两座门阙的骨封牌已经升起来 —— 走过去看看。'
          : (lv === 2 ? '三座构件装置都拢回来了。禽兽、人居两地的门阙开了，祭坛的冂门也通了电。'
            : 'BOSS 已被讨平。困在甲骨里的字放回了王邑 —— 你可以继续在城里走，随便看哪一件。')));
      if (next) {
        var b = App.el('button', 'wd-btn', '去「' + next.name + '」');
        b.type = 'button';
        b.onclick = function () { openLevel(next.id, false); };
        p.appendChild(b);
      }
    });
    say((next ? next.name : '王邑') + ' 已开启');
  }

  function spotById2(ch) {
    var zs = (App.levels && App.levels.map && App.levels.map.zones) || [];
    for (var i = 0; i < zs.length; i++) {
      var objs = zs[i].objects || [];
      for (var k = 0; k < objs.length; k++) {
        if (objs[k].char === ch) { return { o: objs[k], z: zs[i] }; }
      }
    }
    return null;
  }

  /* ---------- 构字装置：构件就是三维实体，点它它才归位 ---------- */
  var asmNext = {};
  var asmWrong = 0;

  function openAssembly(zid, ch, piece) {
    if (!zoneUnlocked(zid)) {
      say('这座构字装置还锁在第' + zoneLevel(zid) + '关里。');
      return;
    }
    var done = !!stage().asm[ch];
    if (S.api && S.api.focusItem) { S.api.focusItem(ch, zid); }
    var sp3 = spotById2(ch);
    var next = asmNext[ch] || 0;

    /* 点在某个构件上：次序对了就让它飞回原位，不对就把它顶回去 */
    if (piece != null && !done && sp3) {
      if (piece === next) {
        var finished = S.api ? S.api.assemblePiece(ch, zid, piece) : false;
        asmNext[ch] = piece + 1;
        if (App.museumAudio) { App.museumAudio.click(); }
        if (finished) {
          stageMut(function (stg) { stg.asm[ch] = true; });
          markKnown(zid, ch);
          paintKnown();
          checkLevel();
        }
      } else {
        if (S.api && S.api.shakePiece) { S.api.shakePiece(ch, zid, piece); }
        asmWrong++;
        say(piece < next ? '这块已经归位了' : '还早 —— 按书写次序，从' + orderWord(next + 1) + '开始');
      }
      next = asmNext[ch] || 0;
    }

    var info = S.api && S.api.itemInfo ? S.api.itemInfo(ch, zid) : null;
    var total = info ? info.pieces : 2;
    shutPanel(function (p) {
      head(p, ch, '第二关 · 构字装置', '「' + ch + '」' + (done ? ' · 已拼成' : ''),
        (sp3 && sp3.o.meaning) || '');
      bar(p, Math.min(total, next), total, '归位的构件');
      p.appendChild(App.el('p', 'wd-p-lead', done
        ? '拢起来了。这就是「' + ch + '」完整的甲骨写法 —— 走过去换个角度看，它是立体的。'
        : '这座装置把这个字拆成了 ' + total + ' 个实体构件，正散悬在青铜环外。' +
          '走到环前，按书写次序逐个点它们：点对了，那块构件会在空间里飞回原位。'));
      var dl = App.el('dl', 'wd-p-dl');
      function row(k, v) {
        if (!v) { return; }
        var d = App.el('div', 'wd-p-row');
        d.appendChild(App.el('dt', null, k));
        d.appendChild(App.el('dd', null, v));
        dl.appendChild(d);
      }
      if (sp3) { row('释义', sp3.o.meaning); row('构形', sp3.o.form); row('所在', sp3.z.name); }
      row('操作', '点画面里那些散着的构件；次序不对它会被顶回去');
      p.appendChild(dl);
      if (!done) {
        var re = App.el('button', 'wd-btn wd-p-back', '散开重拼');
        re.type = 'button';
        re.onclick = function () {
          asmNext[ch] = 0;
          if (S.api) { S.api.scatterPieces(ch, zid); }
          openAssembly(zid, ch, null);
        };
        p.appendChild(re);
      }
    });
  }
  function orderWord(n) {
    return ['第一块', '第二块', '第三块', '第四块', '第五块', '第六块'][Math.min(5, n - 1)] || '下一块';
  }

  /* ---------- 祭坛 / 冂门 ---------- */
  function openAltar() {
    if (!cleared(2)) {
      shutPanel(function (p) {
        head(p, '龍', '祭坛 · 未通', '第三关还没开', '冂门后面是一场 3D 讨伐');
        p.appendChild(App.el('p', 'wd-p-lead',
          '冂门的青铜转盘还没通电。先把第二关的三座构字装置拼完 —— 拼完它会自己转起来。'));
        var b = App.el('button', 'wd-btn', '去看第二关');
        b.type = 'button';
        b.onclick = function () { openLevel(2, false); };
        p.appendChild(b);
      });
      return;
    }
    shutPanel(function (p) {
      head(p, '龍', '第三关 · 讨伐', '冂门已开',
        cleared(3) ? 'BOSS 已讨平' : '「龍」把字锁在甲骨里');
      bar(p, cleared(3) ? 1 : 0, 1, 'BOSS');
      p.appendChild(App.el('p', 'wd-p-lead',
        '转盘后面是独立的战斗场景：一条由商代玉龙与甲骨构件化成的「龍」会真的出现在那里。' +
        '用字作答 —— 答对它掉血，答错它反扑。'));
      var b = App.el('button', 'wd-btn wd-btn-main', cleared(3) ? '再打一场' : '穿过冂门');
      b.type = 'button';
      b.onclick = function () {
        closePanel();
        if (App.raid && App.raid.open) { App.raid.open(); }
        else if (location.hash.indexOf('raid') < 0) { location.hash = '#/raid'; }
      };
      p.appendChild(b);
    });
  }

  /* BOSS 战回写： gebracht 的字、通关状态、全地图点亮 */
  function bossWon(words) {
    stageMut(function (stg) { stg.boss.win = true; });
    if (words && words.length) {
      words.forEach(function (w) {
        var sp4 = spotById2(w);
        if (sp4) { markKnown(sp4.z.id, w); }
      });
    }
    refreshGates();
    paintKnown();
    checkLevel();
  }

  /* ---------- 释放 ---------- */
  function teardown() {
    S.alive = false;
    S.shut = false;
    if (S.api && S.api.dispose) { try { S.api.dispose(); } catch (e) {} }
    S.api = null;
    if (S.off) { try { S.off(); } catch (e) {} S.off = null; }
    if (S.onKey) { document.removeEventListener('keydown', S.onKey); S.onKey = null; }
    clearTimeout(sayT);
  }

  App.world = {
    scene: scene,
    teardown: teardown,
    /* 关卡 / 进度（给 BOSS 场景回写、给自动化测试读） */
    levels: LEVELS,
    currentLevel: currentLevel,
    levelProgress: levelProgress,
    cleared: cleared,
    bossWon: bossWon,
    openAltar: openAltar,
    focusItem: function (ch, zone) { if (S.api && S.api.focusItem) { return S.api.focusItem(ch, zone); } },
    itemInfo: function (ch, zone) { return (S.api && S.api.itemInfo) ? S.api.itemInfo(ch, zone) : null; },
    gateState: function () { return (S.api && S.api.gateState) ? S.api.gateState() : null; },
    say: say,
    /* 直达某点：调试与"从博物馆指定城门进来"都要用 */
    teleport: function (x, z) { if (S.api) { S.api.teleport(x, z); } },
    look: function (pitch, dist, yaw) { if (S.api) { S.api.look(pitch, dist, yaw); } },
    /* 自查：某块字碑此刻在屏幕上的像素位置（用来验证"点屏幕→命中字碑"） */
    screenOf: function (ch) { return (S.api && S.api.screenOf) ? S.api.screenOf(ch) : null; },
    /* 诊断出口：拿到 three 场景本体，量包围盒、改材质做二分排查都靠它 */
    _raw: function () { return (S.api && S.api._raw) ? S.api._raw() : null; },
    _state: function () {
      return { ready: S.ready, err: S.err, api: S.api ? S.api.state() : null,
               dbg: S.api && S.api.debug ? S.api.debug() : null,
               scene: S.api ? S.api.sceneInfo() : null };
    }
  };
})(window.App);
