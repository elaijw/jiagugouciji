(function (App) {
  'use strict';
  /* ============================================================
     跨关卡进度（三关收口到博物馆"我的典藏区"用）
     ------------------------------------------------------------
     只记三样东西，都落在一个键里，避免三处各写各的：
       build  : 第一关认过的字
       float  : 第二关点开过的骨片字
       boss   : 第三关是否通过 / 用时 / 失误
     ============================================================ */
  if (!App || !App.store) { return; }

  var KEY = 'progress';

  function read() {
    var d = App.store.get(KEY, null);
    if (!d || typeof d !== 'object') { d = {}; }
    if (!Array.isArray(d.build)) { d.build = []; }
    if (!Array.isArray(d.float)) { d.float = []; }
    if (d.boss === undefined) { d.boss = null; }
    return d;
  }

  function write(d) {
    d.updated = Date.now();
    App.store.set(KEY, d);
    App.emit && App.emit('progress', d);
    return d;
  }

  function uniq(list) {
    var seen = {}, out = [];
    for (var i = 0; i < list.length; i++) {
      if (!list[i] || seen[list[i]]) { continue; }
      seen[list[i]] = 1;
      out.push(list[i]);
    }
    return out;
  }

  App.progress = {
    read: read,

    /* kind: 'build' | 'float'；chars 可以是单个字或数组 */
    add: function (kind, chars) {
      var d = read();
      var list = d[kind] || (d[kind] = []);
      (Array.isArray(chars) ? chars : [chars]).forEach(function (c) {
        if (c && list.indexOf(c) < 0) { list.push(c); }
      });
      return write(d);
    },

    boss: function (info) {
      var d = read();
      var prev = d.boss || {};
      d.boss = {
        cleared: !!(info && info.cleared),
        secs: (info && info.secs) || prev.secs || 0,
        wrong: (info && info.wrong != null) ? info.wrong : (prev.wrong || 0),
        at: Date.now()
      };
      return write(d);
    },

    summary: function () {
      var d = read();
      var all = uniq(d.build.concat(d.float));
      return {
        build: d.build, float: d.float, boss: d.boss,
        chars: all,
        buildN: d.build.length,
        floatN: d.float.length,
        total: all.length
      };
    },

    clear: function () { App.store.del(KEY); }
  };

})(window.App = window.App || {});
