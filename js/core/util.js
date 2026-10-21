/* ============================================================
   字有骨气 · 核心工具
   职责：DOM 简写、转义、本地存储封装、命名空间化的存储键、小工具函数。
   说明：不依赖任何库；以传统 script 加载，避免 file:// 下的模块 CORS 限制。
   ============================================================ */
(function (App) {
  'use strict';

  /* ---------- DOM ---------- */
  App.$ = function (id) { return document.getElementById(id); };
  App.$$ = function (sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  };
  /* 用 removeChild 循环清空，语义明确且对动态元素同样有效 */
  App.clearNode = function (el) {
    if (!el) return;
    while (el.firstChild) el.removeChild(el.firstChild);
  };
  App.el = function (tag, cls, text) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (text != null) d.textContent = text;
    return d;
  };
  App.esc = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  /* ---------- 存储 ----------
     全部键统一前缀 ziqu.，避免与其他站点/应用冲突。
     所有读写都包在 try/catch 里：无痕模式、iframe、配额满都可能抛错。 */
  App.STORE_PREFIX = 'ziqu.';
  /* 试玩重置：新一轮进度改用独立存档键。旧存档保留在本地，设置和内容包继续沿用。 */
  var FRESH_PROGRESS_KEYS = { bonebuild: true, wangyi: true, bossraid: true, achieved: true };
  function storeKey(key) {
    return App.STORE_PREFIX + (FRESH_PROGRESS_KEYS[key] ? 'progress-reset-20261012.' : '') + key;
  }
  App.store = {
    get: function (key, fallback) {
      try {
        var raw = localStorage.getItem(storeKey(key));
        if (raw == null) return fallback;
        return JSON.parse(raw);
      } catch (e) { return fallback; }
    },
    set: function (key, val) {
      try {
        localStorage.setItem(storeKey(key), JSON.stringify(val));
        return true;
      } catch (e) { return false; }
    },
    del: function (key) {
      try { localStorage.removeItem(storeKey(key)); return true; }
      catch (e) { return false; }
    },
    /* 本地存储是否可用（无痕模式常不可用） */
    ok: function () {
      try {
        localStorage.setItem(App.STORE_PREFIX + '__t', '1');
        localStorage.removeItem(App.STORE_PREFIX + '__t');
        return true;
      } catch (e) { return false; }
    },
    /* 粗略估算占用字节数，用于图片库的容量告警 */
    bytes: function () {
      try {
        var n = 0;
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (k && k.indexOf(App.STORE_PREFIX) === 0) {
            n += (localStorage.getItem(k) || '').length + k.length;
          }
        }
        return n * 2;   /* UTF-16 */
      } catch (e) { return 0; }
    }
  };

  /* ---------- 通用小工具 ---------- */
  App.uid = function (p) {
    return (p || 'id') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  };
  App.clamp = function (v, lo, hi) { return Math.max(lo, Math.min(hi, v)); };
  App.rand = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };
  App.shuffle = function (arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  };
  App.secs = function (ms) { return (ms / 1000).toFixed(0) + '秒'; };

  /* 数值格式化：＋3 / −2 / 0 */
  App.signed = function (n) {
    return n > 0 ? '＋' + n : (n < 0 ? '−' + Math.abs(n) : '0');
  };

  /* ---------- 图片：读文件并缩放到指定最长边 ---------- */
  App.readScaled = function (file, maxSide, cb, mime, quality) {
    try {
      var r = new FileReader();
      r.onload = function () {
        var im = new Image();
        im.onload = function () {
          try {
            var w = im.width, h = im.height;
            var k = Math.min(1, maxSide / Math.max(w, h));
            w = Math.max(1, Math.round(w * k));
            h = Math.max(1, Math.round(h * k));
            var cv = document.createElement('canvas');
            cv.width = w; cv.height = h;
            var cx = cv.getContext('2d');
            cx.drawImage(im, 0, 0, w, h);
            cb(cv.toDataURL(mime || 'image/png', quality), w, h);
          } catch (e) { cb(im.src || null); }
        };
        im.onerror = function () { cb(null); };
        im.src = String(r.result || '');
      };
      r.onerror = function () { cb(null); };
      r.readAsDataURL(file);
    } catch (e) { cb(null); }
  };

  /* ---------- 轻提示（不打断操作） ---------- */
  App.toast = function (msg, ms) {
    var bar = App.el('div', 'toast');
    bar.textContent = msg;
    document.body.appendChild(bar);
    setTimeout(function () { if (bar.parentNode) bar.parentNode.removeChild(bar); },
      ms || 2600);
  };

  /* ---------- 简易事件总线（壳层与模式之间解耦） ---------- */
  var listeners = {};
  App.on = function (evt, fn) {
    (listeners[evt] = listeners[evt] || []).push(fn);
    return function () { App.off(evt, fn); };
  };
  App.off = function (evt, fn) {
    var a = listeners[evt];
    if (!a) return;
    var i = a.indexOf(fn);
    if (i >= 0) a.splice(i, 1);
  };
  App.emit = function (evt, payload) {
    (listeners[evt] || []).slice().forEach(function (fn) {
      try { fn(payload); } catch (e) { /* 单个监听器出错不影响其他 */ }
    });
  };

})(window.App = window.App || {});
