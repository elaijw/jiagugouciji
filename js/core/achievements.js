/* ============================================================
   字有骨气 · 成就与评级
   ------------------------------------------------------------
   把三个玩法各自的进度汇成一条成长线：
     收集  —— 三个玩法里"学会"的字，去重后 / 102
     评级  —— 由收集度换算的称号（对应甲骨学里的身份）
     成就  —— 13 项，每项都从**真实进度**算，不写死、不伪造

   数据来源（都在本机，键带 ziqu. 前缀）：
     ziqu.wangyi     { done: { 分区: [字] } }     王邑点亮
     ziqu.bossraid   { cleared: [], perfect: [] } 讨伐通关 / 完美通关
     ziqu.bonebuild  { done: [字] }               构字答对

   已解锁的成就 id 另存 ziqu.achieved，用来判断"新达成"并弹提示。
   ============================================================ */
(function (App) {
  'use strict';

  var ACH_KEY = 'achieved';

  /* ---------- 原始进度 ---------- */
  function raw() {
    var wy = App.store.get('wangyi', null) || {};
    var bo = App.store.get('bossraid', null) || {};
    var bb = App.store.get('bonebuild', null) || {};

    var objDone = 0;
    if (wy.done) {
      for (var z in wy.done) {
        if (wy.done.hasOwnProperty(z)) { objDone += (wy.done[z] || []).length; }
      }
    }
    var objTotal = 0;
    (((App.levels || {}).map || {}).zones || []).forEach(function (z) {
      objTotal += (z.objects || []).length;
    });
    var bossTotal = 0;
    (((App.levels || {}).boss || {}).tiers || []).forEach(function (t) {
      bossTotal += (t.list || []).length;
    });

    var st = App.atlas.stats();
    var cleared = (bo.cleared && bo.cleared.length) || 0;
    var perfect = (bo.perfect && bo.perfect.length) || 0;
    var cardDone = (bb.done && bb.done.length) || 0;

    return {
      learned: st.learned, chars: st.chars,
      objDone: objDone, objTotal: objTotal,
      bossCleared: cleared, bossTotal: bossTotal, bossPerfect: perfect,
      cardDone: cardDone,
      /* 三个玩法各玩过没有——用来判"三艺俱全" */
      played: (objDone > 0 ? 1 : 0) + (cleared > 0 ? 1 : 0) + (cardDone > 0 ? 1 : 0),
      modesTotal: App.modes.playable().length
    };
  }

  /* ---------- 成就定义 ----------
     get(s) 返回当前值，need 是目标值；两者都由真实进度算出来。 */
  var ACHS = [
    { id: 'collect1',  icon: '一', name: '初识契文',
      desc: '收集第一个字', need: 1, get: function (s) { return s.learned; } },
    { id: 'collect10', icon: '十', name: '略识之无',
      desc: '收集 10 个字', need: 10, get: function (s) { return s.learned; } },
    { id: 'collect30', icon: '卅', name: '识字渐多',
      desc: '收集 30 个字', need: 30, get: function (s) { return s.learned; } },
    { id: 'collect60', icon: '博', name: '博览甲骨',
      desc: '收集 60 个字', need: 60, get: function (s) { return s.learned; } },
    { id: 'collectAll', icon: '全', name: '通览骨片',
      desc: '把图鉴里的字收齐', need: 'chars', get: function (s) { return s.learned; } },

    { id: 'light1',  icon: '点', name: '第一处灯火',
      desc: '在王邑图卷上点亮 1 处', need: 1, get: function (s) { return s.objDone; } },
    { id: 'light10', icon: '明', name: '图卷初明',
      desc: '拨开 10 处雾', need: 10, get: function (s) { return s.objDone; } },
    { id: 'lightAll', icon: '城', name: '满城灯火',
      desc: '点亮整幅王邑图卷', need: 'objTotal', get: function (s) { return s.objDone; } },

    { id: 'boss1',   icon: '伐', name: '讨伐开始',
      desc: '通关第 1 关', need: 1, get: function (s) { return s.bossCleared; } },
    { id: 'boss10',  icon: '进', name: '一往无前',
      desc: '通关 10 关', need: 10, get: function (s) { return s.bossCleared; } },
    { id: 'bossAll', icon: '终', name: '斩尽骨片',
      desc: '通关全部关卡', need: 'bossTotal', get: function (s) { return s.bossCleared; } },
    { id: 'perfect5', icon: '察', name: '一眼看穿',
      desc: '完美通关 5 关（一次不挑错）', need: 5, get: function (s) { return s.bossPerfect; } },

    { id: 'card10', icon: '契', name: '契文入门',
      desc: '甲骨构字答对 10 张字卡', need: 10, get: function (s) { return s.cardDone; } },
    { id: 'trio',   icon: '三', name: '三艺俱全',
      desc: '三个玩法都玩过', need: 'modesTotal', get: function (s) { return s.played; } }
  ];

  function needOf(a, s) {
    return a.need === 'chars' ? s.chars
      : a.need === 'objTotal' ? s.objTotal
      : a.need === 'bossTotal' ? s.bossTotal
      : a.need === 'modesTotal' ? s.modesTotal
      : a.need;
  }

  /* ---------- 评级 ----------
     称号沿用甲骨学里的身份：贞人是商代掌卜之人。 */
  var RANKS = [
    { at: 1.00, name: '与甲骨共语', note: '图鉴里的字你都认过了' },
    { at: 0.70, name: '贞人门下',   note: '大半骨片上的字难不住你' },
    { at: 0.45, name: '通晓卜辞',   note: '卜辞里的常见字你认得七七八八' },
    { at: 0.25, name: '能读骨片',   note: '已经能连蒙带猜读出几句' },
    { at: 0.08, name: '初识契文',   note: '刚摸到门道' },
    { at: 0.00, name: '未入门',     note: '还没开始收集' }
  ];

  function list() {
    var s = raw();
    return ACHS.map(function (a) {
      var need = needOf(a, s);
      var now = Math.min(a.get(s), need);
      return {
        id: a.id, icon: a.icon, name: a.name, desc: a.desc,
        now: now, need: need, done: need > 0 && now >= need,
        percent: need > 0 ? Math.round(now / need * 100) : 0
      };
    });
  }

  function summary() {
    var s = raw();
    var ratio = s.chars ? s.learned / s.chars : 0;
    var rank = RANKS.filter(function (r) { return ratio >= r.at; })[0] || RANKS[RANKS.length - 1];
    var all = list();
    var got = all.filter(function (a) { return a.done; }).length;
    return {
      raw: s,
      rank: rank,
      percent: Math.round(ratio * 100),
      achieved: got,
      total: all.length,
      /* 离下一级还差多少字 */
      nextRank: (function () {
        for (var i = RANKS.length - 1; i >= 0; i--) {
          if (RANKS[i].at > ratio) { return RANKS[i]; }
        }
        return null;
      })(),
      nextNeed: (function () {
        for (var i = RANKS.length - 1; i >= 0; i--) {
          if (RANKS[i].at > ratio) { return Math.ceil(RANKS[i].at * s.chars); }
        }
        return s.chars;
      })()
    };
  }

  /* ---------- 新达成检测 ----------
     玩法里不埋钩子（那要把三个模块都改一遍）；
     回到壳层渲染时对一次账即可——玩家玩完总要走某条路由。 */
  function check() {
    var all = list();
    var doneIds = all.filter(function (a) { return a.done; })
                      .map(function (a) { return a.id; });
    var seen = App.store.get(ACH_KEY, null);
    if (!seen || Object.prototype.toString.call(seen) !== '[object Array]') {
      /* 第一次运行：把当前已达成的记为"已知"，不弹一排提示 */
      App.store.set(ACH_KEY, doneIds);
      return [];
    }
    var fresh = doneIds.filter(function (id) { return seen.indexOf(id) < 0; });
    if (fresh.length) {
      App.store.set(ACH_KEY, seen.concat(fresh));
    }
    return all.filter(function (a) { return fresh.indexOf(a.id) >= 0; });
  }

  /* 调试/清档用 */
  function reset() { App.store.del(ACH_KEY); }

  App.achievements = {
    list: list,
    summary: summary,
    check: check,
    reset: reset,
    raw: raw
  };

})(window.App = window.App || {});
