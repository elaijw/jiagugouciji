/* ============================================================
   字有骨气 · 通用内容包
   —— 平台不只服务"字包"这一种数据。这里把内容包抽象成带 type 的通用结构：
      cards  字包（构件 + 字卡）
      quiz   题库（题目 + 选项 + 答案）
      atlas  图鉴（条目 + 图 + 说明）
      script 剧本/章节（章节 + 步骤）
   新玩法若引入新类型，只需在此登记一个 schema，不必改壳层。

   每个包：
     { id, type, name, desc, builtin, data:{...}, createdAt, updatedAt }
   ============================================================ */
(function (App) {
  'use strict';

  var KEY = 'packs';                 /* 存储键：ziqu.packs */
  var ACTIVE = 'activePack';         /* 存储键：ziqu.activePack = { cards: id, quiz: id, ... } */

  /* 各类型的结构与校验规则；新类型在此登记 */
  var TYPES = {
    cards: {
      label: '字包',
      empty: function () { return { pieces: [], cards: [] }; },
      /* 校验：返回问题清单（空数组＝通过） */
      validate: function (data) {
        var bad = [];
        if (!data) return ['数据为空'];
        if (!Array.isArray(data.pieces) || !data.pieces.length) bad.push('至少需要 1 个构件');
        if (!Array.isArray(data.cards) || data.cards.length < 2) bad.push('至少需要 2 张字卡');
        var names = {};
        (data.pieces || []).forEach(function (p, i) {
          if (!p.n) bad.push('第 ' + (i + 1) + ' 个构件缺少名称');
          else if (names[p.n]) bad.push('构件名重复：' + p.n);
          else names[p.n] = 1;
        });
        var seen = {};
        (data.cards || []).forEach(function (c, i) {
          if (!c.g) bad.push('第 ' + (i + 1) + ' 张字卡缺少字形');
          else if (seen[c.g]) bad.push('字卡重复：' + c.g);
          else seen[c.g] = 1;
          var parts = String(c.w || '').split('+').filter(Boolean);
          if (!parts.length) bad.push('字卡「' + (c.g || i + 1) + '」没有构件拆分');
          parts.forEach(function (x) {
            if (!names[x]) bad.push('字卡「' + (c.g || '') + '」用到不存在的构件：' + x);
          });
        });
        return bad;
      },
      summary: function (data) {
        return (data.pieces || []).length + ' 构件 · ' + (data.cards || []).length + ' 字卡';
      }
    },
    quiz: {
      label: '题库',
      empty: function () { return { questions: [] }; },
      validate: function (data) {
        var bad = [];
        if (!data || !Array.isArray(data.questions) || !data.questions.length) bad.push('至少需要 1 道题');
        (data.questions || []).forEach(function (q, i) {
          if (!q.q) bad.push('第 ' + (i + 1) + ' 题缺少题干');
          if (!Array.isArray(q.options) || q.options.length < 2) bad.push('第 ' + (i + 1) + ' 题至少需要 2 个选项');
          if (q.answer == null) bad.push('第 ' + (i + 1) + ' 题没有设定答案');
        });
        return bad;
      },
      summary: function (data) { return (data.questions || []).length + ' 道题'; }
    },
    atlas: {
      label: '图鉴',
      empty: function () { return { entries: [] }; },
      validate: function (data) {
        var bad = [];
        if (!data || !Array.isArray(data.entries) || !data.entries.length) bad.push('至少需要 1 个条目');
        (data.entries || []).forEach(function (e, i) { if (!e.name) bad.push('第 ' + (i + 1) + ' 条缺少名称'); });
        return bad;
      },
      summary: function (data) { return (data.entries || []).length + ' 个条目'; }
    },
    script: {
      label: '章节',
      empty: function () { return { chapters: [] }; },
      validate: function (data) {
        var bad = [];
        if (!data || !Array.isArray(data.chapters) || !data.chapters.length) bad.push('至少需要 1 个章节');
        (data.chapters || []).forEach(function (c, i) { if (!c.title) bad.push('第 ' + (i + 1) + ' 章缺少标题'); });
        return bad;
      },
      summary: function (data) { return (data.chapters || []).length + ' 个章节'; }
    }
  };

  /* ---------- 内置包 ---------- */
  function builtinPacks() {
    var d = App.data || {};
    var out = [];
    if (d.BUILTIN_PIECES && d.BUILTIN_POOL) {
      out.push({
        id: 'builtin-cards',
        type: 'cards',
        name: '内置字包（甲骨构字）',
        desc: '项目自带的 ' + d.BUILTIN_PIECES.length + ' 个构件与 ' + d.BUILTIN_POOL.length + ' 张字卡',
        builtin: true,
        data: { pieces: d.BUILTIN_PIECES, cards: d.BUILTIN_POOL }
      });
    }
    return out;
  }

  /* ---------- 读写 ---------- */
  function loadUser() {
    var v = App.store.get(KEY, []);
    return Array.isArray(v) ? v : [];
  }
  function saveUser(list) {
    return App.store.set(KEY, list);
  }
  function all() { return builtinPacks().concat(loadUser()); }
  function byType(type) {
    return all().filter(function (p) { return p.type === type; });
  }
  function get(id) {
    var l = all();
    for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i];
    return null;
  }
  function typeMeta(type) { return TYPES[type] || null; }
  function types() { return Object.keys(TYPES); }

  /* 每种类型当前选中的包（记住用户选择） */
  function activeMap() {
    var v = App.store.get(ACTIVE, {});
    return (v && typeof v === 'object') ? v : {};
  }
  function activeIndex(type) {
    var list = byType(type);
    var id = activeMap()[type];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return i;
    return 0;
  }
  function active(type) {
    var list = byType(type);
    return list[activeIndex(type)] || null;
  }
  function setActive(type, id) {
    var m = activeMap();
    m[type] = id;
    return App.store.set(ACTIVE, m);
  }

  /* 模式所需的数据包：按模式的 data.packs 声明过滤 */
  function forMode(mode) {
    var req = (mode && mode.data && mode.data.packs) || [];
    var out = [];
    req.forEach(function (r) {
      byType(r.type).forEach(function (p) {
        out.push({ pack: p, type: r.type, role: r.role, label: r.label });
      });
    });
    /* 兼容：未声明 data.packs 的模式，给它全部 cards 包 */
    if (!req.length) {
      byType('cards').forEach(function (p) { out.push({ pack: p, type: 'cards', role: 'main', label: '字包' }); });
    }
    return out.map(function (x) { return x.pack; });
  }

  /* 新建 / 更新 / 删除（用户包；内置包不可改） */
  function create(type, name, data) {
    var metas = typeMeta(type);
    if (!metas) throw new Error('未知的内容包类型：' + type);
    var list = loadUser();
    var p = {
      id: App.uid('pk'),
      type: type,
      name: name || ('未命名' + metas.label),
      desc: '',
      builtin: false,
      data: data || metas.empty(),
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    list.push(p);
    if (!saveUser(list)) throw new Error('本地存储不可用，无法保存');
    return p;
  }
  function update(id, patch) {
    var list = loadUser();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) {
        if (patch.name != null) list[i].name = patch.name;
        if (patch.desc != null) list[i].desc = patch.desc;
        if (patch.data != null) list[i].data = patch.data;
        list[i].updatedAt = Date.now();
        saveUser(list);
        return list[i];
      }
    }
    return null;
  }
  function remove(id) {
    var list = loadUser().filter(function (p) { return p.id !== id; });
    saveUser(list);
  }
  function validate(pack) {
    var metas = typeMeta(pack && pack.type);
    if (!metas) return ['未知类型'];
    return metas.validate(pack.data);
  }
  function summary(pack) {
    var metas = typeMeta(pack && pack.type);
    return metas ? metas.summary(pack.data) : '';
  }
  /* 导出／导入（单个或全部） */
  function exportOne(pack) {
    return JSON.stringify({ app: '字有骨气', v: 1, kind: 'pack', pack: pack }, null, 1);
  }
  function exportAll() {
    return JSON.stringify({ app: '字有骨气', v: 1, kind: 'packs', packs: loadUser() }, null, 1);
  }
  function importText(text) {
    var o = JSON.parse(text);
    var list = loadUser();
    var added = 0, skipped = 0;
    var incoming = [];
    if (o && Array.isArray(o.packs)) incoming = o.packs;
    else if (o && o.pack) incoming = [o.pack];
    else if (o && o.type && o.data) incoming = [o];       /* 裸包 */
    if (!incoming.length) throw new Error('文件中没有可导入的内容包');
    incoming.forEach(function (p) {
      if (!p || !p.type || !typeMeta(p.type) || !p.data) { skipped++; return; }
      list.push({
        id: App.uid('pk'),
        type: p.type,
        name: (p.name || '导入的包') + '',
        desc: p.desc || '',
        builtin: false,
        data: p.data,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
      added++;
    });
    if (!saveUser(list)) throw new Error('本地存储不可用，无法保存');
    return { added: added, skipped: skipped };
  }

  App.packs = {
    TYPES: TYPES,
    types: types,
    typeMeta: typeMeta,
    all: all,
    byType: byType,
    get: get,
    active: active,
    activeIndex: activeIndex,
    setActive: setActive,
    forMode: forMode,
    create: create,
    update: update,
    remove: remove,
    validate: validate,
    summary: summary,
    exportOne: exportOne,
    exportAll: exportAll,
    importText: importText
  };

})(window.App = window.App || {});
