/* ============================================================
   字有骨气 · 模式注册表
   —— 这是整个平台的可插拔点。新增玩法 = 新增一个文件调用 register()，
      不需要改动壳层、路由、设置页或任何其他模式。

   一个模式要声明三件事：
     1) meta      它是谁（名称、一句话、标签、封面色）—— 用于模式选择页
     2) data      它需要什么数据（内容包类型、素材库）
     3) lifecycle 它怎么跑（可选设置项 + 挂载/卸载）

   data 声明示例：
     data: {
       packs:  [{ type: 'cards', role: 'main', label: '字包' }],
       assets: ['glyphs', 'images']
     }
   lifecycle 示例：
     settings: [{ key:'mode', type:'radio', label:'模式', options:[...] }]
     mount(host, ctx)   host 是壳层给的空容器；ctx 见下方 buildContext
     unmount(host)
     serialize() / restore(state)
   ============================================================ */
(function (App) {
  'use strict';

  var registry = [];
  var byId = {};

  function register(spec) {
    if (!spec || !spec.id) throw new Error('mode 必须有 id');
    if (byId[spec.id]) throw new Error('mode id 重复：' + spec.id);
    var m = {
      id: spec.id,
      name: spec.name || spec.id,
      tagline: spec.tagline || '',
      desc: spec.desc || '',
      icon: spec.icon || '戏',
      accent: spec.accent || 'var(--gold)',
      tags: spec.tags || [],
      minPlayers: spec.minPlayers == null ? 1 : spec.minPlayers,
      maxPlayers: spec.maxPlayers == null ? 1 : spec.maxPlayers,
      status: spec.status || 'ready',        /* ready | wip | planning */
      /* 布局：'' 默认（内容列限宽 900px）| 'wide' 占满整个界面。
         整幅图卷这类主打玩法要 wide，否则会被 900px 卡在右侧一角。
         必须在这里显式列出：register 只复制列出的字段，
         漏掉的键在 scenePlay 里读不到（曾因此宽屏规则毫无效果）。 */
      layout: spec.layout || '',
      data: spec.data || {},
      settings: spec.settings || [],
      mount: spec.mount || null,
      unmount: spec.unmount || null,
      serialize: spec.serialize || null,
      restore: spec.restore || null,
      spec: spec
    };
    registry.push(m);
    byId[m.id] = m;
    return m;
  }

  /* 可玩模式（供选择页列出）；planned 的也列出但标为"筹备中" */
  function playable() { return registry.filter(function (m) { return m.status !== 'hidden'; }); }
  function all() { return registry.slice(); }
  function get(id) { return byId[id] || null; }

  /* 壳层调用：把"模式需要的数据"解析成上下文，交给模式。
     这样模式不必了解存储、素材库、主题等平台细节。 */
  function buildContext(mode) {
    var packs = App.packs ? App.packs.forMode(mode) : [];
    var primary = null;
    var req = (mode.data && mode.data.packs) || [];
    for (var i = 0; i < req.length; i++) {
      if (req[i].role === 'main') {
        var cands = packs.filter(function (p) { return p.type === req[i].type; });
        primary = cands[App.packs.activeIndex(req[i].type)] || cands[0] || null;
        break;
      }
    }
    return {
      mode: mode,
      packs: packs,
      primaryPack: primary,
      assets: App.assets || null,
      ui: {
        el: App.el, esc: App.esc, clearNode: App.clearNode,
        toast: App.toast, signed: App.signed, secs: App.secs
      },
      store: App.store,
      nav: {
        /* 模式内部可以请求跳转（例如结算后回首页） */
        home: function () { App.router.go('home'); },
        modes: function () { App.router.go('modes'); },
        replay: function () { App.router.replay(); }
      }
    };
  }

  App.modes = {
    register: register,
    all: all,
    playable: playable,
    get: get,
    buildContext: buildContext,
    count: function () { return registry.length; }
  };

})(window.App = window.App || {});
