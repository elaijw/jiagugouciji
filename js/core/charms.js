/* ============================================================
   charms.js —— 龟宝配饰（契的第一个"消耗出口"）
   ------------------------------------------------------------
   为什么要这个：
     「契」原本只累计、只当卜骨门槛 —— 是个进度条，不是货币。
     这里给它一个花法：买配饰，挂在龟宝身上，也留在档案里。

   记账分两本（在 reward.js）：
     earned = 累计获得（只增）→ 决定开第几片卜骨
     qi     = 当前余额（可花） → 买这里的东西
   所以花契不会让已开的骨片回退。

   全部用 CSS 画，不新增图片；色只取骨白、朱砂、铜色三种。
   ============================================================ */
(function (App) {
  'use strict';

  if (!App || !App.store) { return; }

  var KEY = 'charms';

  /* 四件：越往后越贵；每件只有一个"视觉符号"，不做换肤 */
  var ITEMS = [
    { id: 'knot',  name: '朱砂结', cost: 40,  glyph: '吉', note: '系在颈上的一枚红结，最早是记事的绳。' },
    { id: 'bone',  name: '骨坠',   cost: 80,  glyph: '卜', note: '一小片卜骨磨成的坠子，兆纹还留着。' },
    { id: 'basket',name: '小竹篓', cost: 120, glyph: '田', note: '装拓片与骨屑的篓，走哪带哪。' },
    { id: 'charm', name: '甲骨符', cost: 200, glyph: '文', note: '刻着半个字的护符，龟宝最得意的一件。' }
  ];

  function load() {
    var s = App.store.get(KEY, null);
    if (!s || typeof s !== 'object') { s = {}; }
    if (!Array.isArray(s.owned)) { s.owned = []; }
    if (!s.equipped) { s.equipped = s.owned.length ? [s.owned[s.owned.length - 1]] : []; }
    if (!Array.isArray(s.equipped)) { s.equipped = []; }
    return s;
  }
  function save(s) { App.store.set(KEY, s); }

  function byId(id) {
    return ITEMS.filter(function (i) { return i.id === id; })[0] || null;
  }

  function owned() { return load().owned.slice(); }
  function equipped() { return load().equipped.slice(); }

  /* 买：先扣契（reward.js 的 spend），成功才记账 */
  function buy(id) {
    var it = byId(id);
    if (!it) { return { ok: false, why: 'no-item' }; }
    var s = load();
    if (s.owned.indexOf(id) >= 0) { return { ok: false, why: 'owned' }; }
    if (!App.kaoji || !App.kaoji.spend) { return { ok: false, why: 'no-wallet' }; }
    var st = App.kaoji.state();
    if ((st.qi || 0) < it.cost) { return { ok: false, why: 'poor', need: it.cost - (st.qi || 0) }; }
    if (!App.kaoji.spend(it.cost)) { return { ok: false, why: 'poor' }; }
    s.owned.push(id);
    if (s.equipped.indexOf(id) < 0) { s.equipped.push(id); }
    save(s);
    if (App.toast) { App.toast('龟宝戴上了「' + it.name + '」'); }
    if (App.sound && App.sound.pluck) { App.sound.pluck(1.05); }
    return { ok: true, item: it };
  }

  function toggleEquip(id) {
    var s = load();
    if (s.owned.indexOf(id) < 0) { return false; }
    var at = s.equipped.indexOf(id);
    if (at >= 0) { s.equipped.splice(at, 1); } else { s.equipped.push(id); }
    save(s);
    return at < 0;
  }

  function equippedItems() {
    return equipped().map(byId).filter(Boolean);
  }

  App.charms = {
    ITEMS: ITEMS,
    byId: byId,
    owned: owned,
    equipped: equipped,
    equippedItems: equippedItems,
    buy: buy,
    toggleEquip: toggleEquip,
    reset: function () { App.store.del(KEY); }
  };
})(window.App = window.App || {});
