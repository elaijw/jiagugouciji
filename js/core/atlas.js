/* ============================================================
   字有骨气 · 汉字图鉴数据层
   ------------------------------------------------------------
   把项目里**已有的四类真实内容**汇成一张可检索的字表，
   并把三个玩法各自的进度并起来算"已解锁"。不放任何编造内容。

     构件      37 个   js/core/data.js 的 BUILTIN_PIECES（带分类）
     合体字    34 张   js/core/data.js 的 BUILTIN_POOL（带构件/释义/卜辞出处）
     王邑实物  61 个   levels.json 的 map.zones[].objects（带分区/释义）
     讨伐字形  21 尊   levels.json 的 boss.tiers[].list（带档位/构件）

   同一个字可能出现在多处（「山」既是构件、又是实物、又是 BOSS），
   各档分别计数；总进度按**去重后的字**算，避免虚高。
   ============================================================ */
(function (App) {
  'use strict';

  var WANGYI_KEY = 'wangyi';
  var BOSS_KEY = 'bossraid';
  var BONE_KEY = 'bonebuild';

  /* 图鉴的四档。顺序即界面上的筛选项顺序 */
  var KINDS = [
    { id: 'piece',  name: '构件',     note: '构字的最小单位，37 个' },
    { id: 'word',   name: '合体字',   note: '由构件拼成，附卜辞出处' },
    { id: 'object', name: '王邑实物', note: '殷商王邑图卷上可点亮的实物' },
    { id: 'boss',   name: '讨伐字形', note: '构件讨伐里逐关推进的对手' },
    { id: 'codex',  name: '讨伐名录', note: 'Boss 形象 · 可拆部件 · 破解玩法，88 尊' }
  ];

  var _cache = null;

  function build() {
    var out = [], seen = {};

    function push(kind, char, extra) {
      if (!char) { return; }
      var key = kind + ':' + char;
      if (seen[key]) { return; }
      seen[key] = 1;
      var e = { kind: kind, char: char, hasGlyph: !!App.hasGlyph(char) };
      for (var k in (extra || {})) {
        if (extra.hasOwnProperty(k)) { e[k] = extra[k]; }
      }
      var parts = (App.glyphs && App.glyphs.parts) || {};
      e.seg = e.seg || (parts[char] ? parts[char].pieceCount : 0);
      out.push(e);
    }

    /* 构件 */
    var catName = {};
    ((App.data && App.data.PIECE_CATS) || []).forEach(function (c) { catName[c.k] = c.n; });
    ((App.data && App.data.BUILTIN_PIECES) || []).forEach(function (p) {
      push('piece', p.n, { cat: catName[p.c] || '', comps: [] });
    });

    /* 合体字（字卡池）：带释义与卜辞出处，图鉴里最"有文化"的一档 */
    ((App.data && App.data.BUILTIN_POOL) || []).forEach(function (w) {
      push('word', w.g, {
        comps: String(w.w || '').split('+').filter(Boolean),
        meaning: w.mean || '',
        source: w.src || '',
        level: w.lv || ''
      });
    });

    /* 王邑实物 */
    var map = (App.levels && App.levels.map) || null;
    if (map) {
      (map.zones || []).forEach(function (z) {
        (z.objects || []).forEach(function (o) {
          push('object', o.char, { zone: z.name, meaning: o.meaning || '' });
        });
      });
    }

    /* 讨伐字形 */
    var boss = (App.levels && App.levels.boss) || null;
    if (boss) {
      (boss.tiers || []).forEach(function (t) {
        (t.list || []).forEach(function (b) {
          push('boss', b.char, {
            tier: t.name, comps: b.comps || [],
            meaning: b.note || '', seg: b.seg || 0
          });
        });
      });
    }

    /* 讨伐名录：docx 字表的每一尊 Boss 形象（形象 / 可拆部件 / 破解玩法）。
       这一档的"图"是 Boss 形象（art），不是甲骨字形——所以不参与 anyGlyphNode；
       hasGlyph 单独由名录里的 glyph 字段决定：字库里有整字甲骨形的才为真。
       playable 说明能不能真打成关卡（stroke 斩笔画 / compound 拆构件 / 空 仅名录）。 */
    var codex = (App.levels && App.levels.bossCodex) || null;
    if (codex) {
      var gname = {};
      (codex.groups || []).forEach(function (g) { gname[g.id] = g.name; });
      (codex.entries || []).forEach(function (c) {
        if (!c || !c.char) { return; }
        push('codex', c.char, {
          art: c.art || '',
          form: c.form || '',
          play: c.play || '',
          parts: c.parts || [],
          py: c.py || '',
          group: gname[c.group] || c.group || '',
          playable: c.playable || '',
          glyphKey: c.glyph || '',
          comps: [],
          hasGlyph: !!c.glyph,
          seg: c.seg || 0
        });
      });
    }
    return out;
  }

  function entries() {
    if (!_cache) { _cache = build(); }
    return _cache;
  }

  /* 已解锁：并入三个玩法各自的进度
       王邑  ziqu.wangyi     = { done: { zoneId: [char,...] } }
       讨伐  ziqu.bossraid   = { cleared: [关卡序号,...] }  → 换算成字
       构字  ziqu.bonebuild  = { done: [字,...] }           → 答对过的字 */
  function learned() {
    var set = {};

    var wy = App.store.get(WANGYI_KEY, null);
    if (wy && wy.done) {
      for (var z in wy.done) {
        if (wy.done.hasOwnProperty(z)) {
          (wy.done[z] || []).forEach(function (c) { set[c] = 1; });
        }
      }
    }

    var bo = App.store.get(BOSS_KEY, null);
    if (bo && Object.prototype.toString.call(bo.cleared) === '[object Array]') {
      var order = [];
      ((App.levels.boss || {}).tiers || []).forEach(function (t) {
        (t.list || []).forEach(function (b) { order.push(b.char); });
      });
      bo.cleared.forEach(function (i) { if (order[i]) { set[order[i]] = 1; } });
    }

    /* 甲骨构字：答对过的字 */
    var bb = App.store.get(BONE_KEY, null);
    if (bb && Object.prototype.toString.call(bb.done) === '[object Array]') {
      bb.done.forEach(function (c) { if (c) { set[c] = 1; } });
    }
    return set;
  }

  function stats() {
    var es = entries(), learn = learned();
    var totalCh = {}, gotCh = {}, byKind = {};
    es.forEach(function (e) {
      totalCh[e.char] = 1;
      if (!byKind[e.kind]) { byKind[e.kind] = { total: 0, learned: 0 }; }
      byKind[e.kind].total++;
      if (learn[e.char]) {
        gotCh[e.char] = 1;
        byKind[e.kind].learned++;
      }
    });
    var total = Object.keys(totalCh).length;
    var got = Object.keys(gotCh).length;
    return {
      entries: es.length,
      chars: total,
      learned: got,
      percent: total ? Math.round(got / total * 100) : 0,
      byKind: byKind,
      learnedSet: learn
    };
  }

  /* 每日一字：按日期确定性选取——同一天所有人看到同一个字，
     不做随机（随机会让"每日"失去意义）。 */
  function daily() {
    var pool = ((App.data && App.data.BUILTIN_POOL) || []);
    if (!pool.length) { return null; }
    var d = new Date();
    var seed = d.getFullYear() * 372 + (d.getMonth() + 1) * 31 + d.getDate();
    var w = pool[seed % pool.length];
    return {
      char: w.g,
      comps: String(w.w || '').split('+').filter(Boolean),
      meaning: w.mean || '',
      source: w.src || '',
      level: w.lv || '',
      date: (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日'
    };
  }

  /* 图鉴里"某一字出现在哪些玩法"——详情面板用 */
  function appearancesOf(ch) {
    return entries().filter(function (e) { return e.char === ch; });
  }

  App.atlas = {
    KINDS: KINDS,
    entries: entries,
    learned: learned,
    stats: stats,
    daily: daily,
    appearancesOf: appearancesOf
  };

})(window.App = window.App || {});
