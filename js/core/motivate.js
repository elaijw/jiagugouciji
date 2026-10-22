/* ============================================================
   motivate.js —— 激励机制（不改任何玩法的计分规则）
   ------------------------------------------------------------
   只做一件事：把"已经在发生的学习行为"换成看得见的回报。
   三种激励，全部落回既有的「契」货币（reward.js 的 App.kaoji）：

     1. 每日目标：认 1 个字 / 拨开 1 片雾 / 通关 1 关 → 各自领契
     2. 连击奖励：同一局连对 3 / 5 次 → 额外契（每局各一次）
     3. 里程碑：累计认字到 10 / 25 / 50 → 一次性契

   设计原则：
     · 不写进玩法模块，避免动了计分与判定
     · 全部从既有进度差算出来（App.store 里的三个进度键），
       本模块只新增一个自己的键 ziqu.motivate
     · 领过就不再发；跨天重置每日目标
     · 声音关闭、减少动效时只是没有提示音/动画，奖励照发
   ============================================================ */
(function (App) {
  'use strict';

  if (!App || !App.store) { return; }

  var KEY = 'motivate';

  /* 每日目标：id / 名称 / 需要发生几次 / 给多少契 */
  var DAILY = [
    { id: 'char', name: '认识 1 个新字', need: 1, qi: 10 },
    { id: 'zone', name: '拨开 1 片雾',   need: 1, qi: 15 },
    { id: 'boss', name: '通关 1 关',     need: 1, qi: 20 }
  ];

  /* 里程碑：累计认字数 → 契 */
  var MILES = [
    { at: 10, qi: 30, name: '认满 10 个字' },
    { at: 25, qi: 60, name: '认满 25 个字' },
    { at: 50, qi: 120, name: '认满 50 个字' }
  ];

  /* 连击：连对 N 次给多少契（每局一次） */
  var STREAK = { 3: 5, 5: 10 };

  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }

  function load() {
    var s = App.store.get(KEY, null);
    if (!s || typeof s !== 'object') { s = {}; }
    if (s.day !== today()) {
      /* 跨天：今日计数清零，里程碑进度保留 */
      s = { day: today(), today: {}, claimed: s.claimed || {}, miles: s.miles || {} };
    }
    if (!s.today) { s.today = {}; }
    if (!s.claimed) { s.claimed = {}; }
    if (!s.miles) { s.miles = {}; }
    return s;
  }

  function save(s) { App.store.set(KEY, s); }

  /* 现在的事实：从三个玩法进度键里读 */
  function facts() {
    var learned = 0, zones = 0, boss = 0;
    try {
      if (App.atlas && App.atlas.stats) { learned = App.atlas.stats().learned || 0; }
    } catch (e) {}
    try {
      var wy = App.store.get('wangyi', null);
      if (wy && wy.done) {
        for (var z in wy.done) {
          if (!wy.done.hasOwnProperty(z)) { continue; }
          var total = 0;
          ((App.levels && App.levels.map && App.levels.map.zones) || []).forEach(function (zz) {
            if (zz.id === z) { total = (zz.objects || []).length; }
          });
          if (total && (wy.done[z] || []).length >= total) { zones++; }
        }
      }
    } catch (e) {}
    try {
      var bo = App.store.get('bossraid', null);
      if (bo && bo.cleared && bo.cleared.length) { boss = bo.cleared.length; }
    } catch (e) {}
    return { learned: learned, zones: zones, boss: boss };
  }

  /* 把"现在的累计值"和上次看到的比，差值记进今日 */
  function sync() {
    var s = load();
    var f = facts();
    var last = s.lastSeen || null;
    if (last) {
      var dc = Math.max(0, f.learned - (last.learned || 0));
      var dz = Math.max(0, f.zones - (last.zones || 0));
      var db = Math.max(0, f.boss - (last.boss || 0));
      if (dc) { s.today.char = (s.today.char || 0) + dc; }
      if (dz) { s.today.zone = (s.today.zone || 0) + dz; }
      if (db) { s.today.boss = (s.today.boss || 0) + db; }
      if (dc || dz || db) { App.emit && App.emit('motivate', s); }
    }
    s.lastSeen = f;
    save(s);
    return s;
  }

  function goals() {
    var s = load();
    return DAILY.map(function (g) {
      var got = s.today[g.id] || 0;
      return {
        id: g.id, name: g.name, qi: g.qi, need: g.need,
        got: Math.min(got, g.need),
        done: got >= g.need,
        claimed: !!s.claimed[g.id + ':' + s.day]
      };
    });
  }

  function claim(id) {
    var s = load();
    var g = DAILY.filter(function (x) { return x.id === id; })[0];
    if (!g) { return false; }
    var k = g.id + ':' + s.day;
    if (s.claimed[k]) { return false; }
    if ((s.today[g.id] || 0) < g.need) { return false; }
    s.claimed[k] = 1;
    save(s);
    if (App.kaoji && App.kaoji.grant) { App.kaoji.grant(g.qi); }
    if (App.toast) { App.toast('目标达成 · 得 ' + g.qi + ' 契'); }
    if (App.sound && App.sound.pluck) { App.sound.pluck(1.15); }
    return true;
  }

  /* 连击奖励：每局每种档位只发一次；返回本次发的契数 */
  var paidStreak = {};
  function streak(n, gameKey) {
    var qi = STREAK[n];
    if (!qi) { return 0; }
    var k = (gameKey || 'game') + ':' + n;
    if (paidStreak[k]) { return 0; }
    paidStreak[k] = 1;
    if (App.kaoji && App.kaoji.grant) { App.kaoji.grant(qi); }
    if (App.toast) { App.toast('连对 ' + n + ' 次 · 多得 ' + qi + ' 契'); }
    return qi;
  }
  function resetStreak(gameKey) {
    Object.keys(paidStreak).forEach(function (k) {
      if (!gameKey || k.indexOf(gameKey + ':') === 0) { delete paidStreak[k]; }
    });
  }

  /* 里程碑：累计认字数跨过门槛就发一次 */
  function checkMiles() {
    var s = load();
    var learned = facts().learned;
    var out = [];
    MILES.forEach(function (m) {
      if (learned >= m.at && !s.miles[m.at]) {
        s.miles[m.at] = 1;
        if (App.kaoji && App.kaoji.grant) { App.kaoji.grant(m.qi); }
        out.push(m);
      }
    });
    if (out.length) {
      save(s);
      out.forEach(function (m) {
        if (App.toast) { App.toast('里程碑 · ' + m.name + '，得 ' + m.qi + ' 契'); }
      });
      if (App.sound && App.sound.pluck) { App.sound.pluck(1.25); }
    }
    return out;
  }

  function reset() { App.store.del(KEY); paidStreak = {}; }

  App.motivate = {
    DAILY: DAILY, MILES: MILES, STREAK: STREAK,
    sync: sync, goals: goals, claim: claim,
    streak: streak, resetStreak: resetStreak,
    checkMiles: checkMiles, reset: reset, facts: facts
  };
})(window.App = window.App || {});
