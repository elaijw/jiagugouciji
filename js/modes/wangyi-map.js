/* ============================================================
   字有骨气 · 玩法模块：殷商王邑（大地图 → 主题小地图 → 点实物学字）

   结构（对应需求「一、二、三」）：

     ① 大地图（renderWorld）
        六张新图里的大地图 `assets/level2-world.jpg` 做成整幅入口画面。
        五个区域的入口**融进地图**：一圈兆纹细环 + 一个小圆点 + 简短主题名，
        低对比、无粗边框、无硬卡片、无阴影。五区**任意顺序**都能进，不设解锁。
        某一区学完，用一层柔光把该区域点亮（不是贴一块方图，避免破坏画面）。

     ② 小地图（renderZone）
        该区的分区插画做背景，把该区每个字物按数据坐标撒成热点。
        **页面下方不放汉字列表**——认字就在图上点实物。
        点中 → 出学习卡（甲骨字形 / 释义 / 构形说明）。
        卡片关掉回到原来位置（滚动位置与缩放都保留）。

     ③ 局部放大（放大镜）
        图很大（2624×1472）缩到手机上，小物件只有几像素。
        所以点空白处会按「离得最近的热点」判定，命中后**自动放大到那个字**，
        再点一次才开卡片。身体局部（目 耳 口 止 又 足）天然极小，放大倍率更高。

   坐标空间（最容易搞错的一条，见 HANDOFF「1.5 两套坐标空间」）：

        只有一个空间：**2624 × 1472**，即六张图自己的像素空间。
        大地图的据点和每个小区热点都用它，`map.viewBox = "0 0 2624 1472"`。
        数据来自 `dev/_l2_calibrate.py`（唯一真源）→ `js/core/levels.json`
        → `js/core/_data.js`。这里不写死任何坐标。

   完成记录（沿用旧键，不清空既有存档）：

        ziqu.wangyi = { done: { zoneId: [已学的字, ...] } }
        旧版本可能还有 seen 字段，读的时候兼容，写的时候只动 done。
   ============================================================ */
(function (App) {
  'use strict';

  var MAP = (App.levels && App.levels.map) || null;
  var STORE_KEY = 'wangyi';
  var SVGNS = 'http://www.w3.org/2000/svg';
  var CV = 100;                      /* 字形画布 */

  /* 触控下限：手指最小可点直径约 44 CSS px。
     热点半径是 SVG 用户单位，会随地图缩放变小，所以实际用时按
     scale = 显示宽 / 2624 反算，保证屏幕上的命中直径不小于这个值。 */
  var TOUCH_MIN_PX = 44;

  /* 缩放区间。1 = 「整幅图完整铺进视口」（contain），这也是进小地图时的初始倍率
     ——需求「一、5」要求先给完整全景。往上最高 6 倍，够把一个作坊看清。 */
  var MAX_ZOOM = 6;

  /* 需要局部放大的字：天然极小，或与宿主（人／鹿）热区挤在一起。
     倍率是在 contain 基准之上的**追加**倍率。 */
  var ZOOM_HINT = {
    '目': 3.4, '口': 3.4, '耳': 3.4, '止': 3.4, '又': 3.4, '足': 3.4,
    '刀': 3.0, '斧': 3.0, '斤': 3.0, '戈': 3.0, '糸': 3.0, '卜': 3.0,
    '玉': 2.8, '贝': 2.8, '矢': 2.8, '弓': 2.6,
    '米': 2.6, '屮': 2.6, '隹': 2.6, '石': 2.4, '水': 2.4, '泉': 2.4
  };

  /* 分区查看（需求「一、5」）：内容多的图不能把几十个热点挤在一屏全景里。
     每个区域 = 一个视角（中心 + 倍率），点一下就跳过去。
     倍率按「手机竖屏下，一屏看得到该区域周边约 1000×1200 用户单位」取。 */
  var REGIONS = {
    beast: [
      { name: '隹·鹿·牛', x: 790, y: 400, z: 2.4 },
      { name: '羊·虎', x: 2040, y: 460, z: 2.4 },
      { name: '豕·犬', x: 900, y: 1160, z: 2.4 },
      { name: '鱼·虫', x: 2030, y: 1120, z: 2.4 }
    ],
    life: [
      { name: '城邑·城门', x: 760, y: 330, z: 2.8 },
      { name: '水井·作坊', x: 420, y: 900, z: 2.8 },
      { name: '兵器·陶铜', x: 1300, y: 800, z: 2.8 },
      { name: '人物·身体', x: 1010, y: 1140, z: 2.8 },
      { name: '匠作·水岸', x: 1850, y: 1080, z: 2.8 }
    ]
  };

  /* 状态：
     view  map | zone
     zone  当前分区
     sel   当前打开学习卡的 [字]
     lens  放大镜状态 { char, x, y, z } 或 null
     showHot 是否显式标出所有可点处
     scroll / zoom 记住小地图的视口，卡片关掉能回到原位置
     flow  构字流程的临时状态 */
  var S = {
    view: 'map', zone: null, sel: null, lens: null, showHot: false,
    scroll: { left: 0, top: 0 }, zoom: 1,
    /* lite：演示点亮。说明页写了「演示或展示时，可以一次点亮全部 61 处」，
       落地成一个显式开关——打开时**只在画面上**把所有实物当作已学，
       存档一个字都不写；关掉就回到玩家自己的进度。 */
    lite: false,
    /* manual：玩家自己放大过（按钮 / 双指 / 滚轮）。
       自己放大之后，再点一次就直接开卡，不必「先点放大、再点开卡」两步。 */
    manual: false,
    /* hint：手势提示是否已经因为一次真实交互而收起 */
    hint: false,
    region: null,
    flow: null, drag: null
  };

  /* 进小地图时把窗口滚到地图顶端（只做一次，之后不再跟玩家抢滚动条）。
     需求「一、5」：**进入地图时优先完整显示全景**——光把图缩到 contain 还不够，
     手机竖屏下顶栏 + 工具条 + 区域栏能占掉半屏，图会被顶到首屏之外。 */
  var scrollToMapOnce = false;
  /* 当前小地图的「按真实可用高度重算 + 重落缩放」入口，交给 window resize 用 */
  var refitViewport = null;
  var dropResize = null;

  function svgEl(tag) { return document.createElementNS(SVGNS, tag); }
  function uid() { return 'wy' + (uid.n = (uid.n || 0) + 1); }

  /* ============================================================
     完成记录
     ============================================================ */
  function progress() {
    var p = App.store.get(STORE_KEY, null);
    if (!p || typeof p !== 'object') { p = {}; }
    if (!p.done || typeof p.done !== 'object') {
      p.done = (p.seen && typeof p.seen === 'object') ? p.seen : {};
    }
    return p;
  }
  function save(p) { App.store.set(STORE_KEY, p); }
  function doneList(p, zid) { return p.done[zid] || []; }
  function isDone(p, zid, ch) { return doneList(p, zid).indexOf(ch) >= 0; }
  /* P2：刚点亮的区域只播一次雾散；收尾只播一次 */
  var fogLitOnce = {};
  var finaleShown = false;

  function markDone(zid, ch) {
    var p = progress();
    if (!p.done[zid]) { p.done[zid] = []; }
    if (p.done[zid].indexOf(ch) < 0) {
      p.done[zid].push(ch); save(p);
      fogLitOnce[zid] = true;      /* 回大地图时这一片播雾散 */
    }
    return p;
  }
  function zoneStat(p, z) {
    var total = (z.objects || []).length;
    var done = (z.objects || []).filter(function (o) { return isDone(p, z.id, o.char); }).length;
    return { total: total, done: done, clear: total > 0 && done >= total };
  }
  function worldStat(p) {
    var zones = (MAP && MAP.zones) || [];
    var total = 0, done = 0, clear = 0;
    zones.forEach(function (z) {
      var s = zoneStat(p, z);
      total += s.total; done += s.done;
      if (s.clear) { clear += 1; }
    });
    return { zones: zones.length, total: total, done: done, clear: clear };
  }

  /* 演示点亮用的「假进度」：每个分区的每个实物都算已学。
     只在读画面时用，绝不交给 markDone——否则一次演示就会把 61 个字
     真写进存档，把玩家的真实进度冲掉。 */
  function liteProgress() {
    var seen = {};
    ((MAP && MAP.zones) || []).forEach(function (z) {
      seen[z.id] = (z.objects || []).map(function (o) { return o.char; });
    });
    return { done: seen };
  }
  /* 画面上的进度：演示中读假进度，平时读真实存档 */
  function readProgress() { return S.lite ? liteProgress() : progress(); }

  /* ============================================================
     挂载
     ============================================================ */
  function mount(host) {
    S.view = 'map'; S.zone = null; S.sel = null; S.lens = null;
    S.showHot = false; S.scroll = { left: 0, top: 0 }; S.zoom = 1;
    S.manual = false; S.hint = false; S.region = null; S.lite = false;
    S.flow = null; S.drag = null;

    var root = App.el('div', 'scene wangyi');
    host.appendChild(root);

    /* 转屏 / 改窗口大小：重算视口高度并重落缩放（窄屏那条 contain 基准依赖它） */
    var onResize = function () {
      if (!refitViewport) { return; }
      if (S.view !== 'zone' || !S.zone) { return; }
      refitViewport();
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    dropResize = function () {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      dropResize = null;
      refitViewport = null;
    };

    if (!MAP || !MAP.zones || !MAP.zones.length) {
      root.appendChild(App.el('p', 'lead', '地图数据缺失（js/core/levels.json）。'));
      return;
    }

    function render() {
      App.clearNode(root);
      if (S.view === 'zone' && S.zone) { renderZone(root); return; }
      renderWorld(root);
    }

    /* ----------------------------------------------------------
       ① 大地图：唯一选图入口
       ---------------------------------------------------------- */
    function renderWorld(el) {
      var p = readProgress();
      var st = worldStat(p);

      var head = App.el('header', 'wy2-head');
      var copy = App.el('div', 'wy2-head-copy');
      copy.appendChild(App.el('p', 'wy2-kicker', '第二关 · 殷商王邑'));
      copy.appendChild(App.el('h2', 'wy2-title', '五片王邑，点一处进去'));
      copy.appendChild(App.el('p', 'wy2-lead',
        '这是一座三千年前的王邑。五片区域任意顺序进入：点图中的实物认甲骨文，认得的字就记在这一片名下。一片认完，这一片的雾就散开。'));
      head.appendChild(copy);

      var meter = App.el('div', 'wy2-head-meter');
      var mline = App.el('p', 'wy2-meter-line');
      mline.appendChild(App.el('strong', null, st.clear + ' / ' + st.zones));
      mline.appendChild(App.el('span', null, ' 片雾已散'));
      meter.appendChild(mline);
      var bar = App.el('span', 'wy2-meter');
      var fill = App.el('i', 'wy2-meter-fill');
      fill.style.width = (st.zones ? st.clear / st.zones * 100 : 0) + '%';
      bar.appendChild(fill);
      meter.appendChild(bar);
      meter.appendChild(App.el('p', 'wy2-meter-words', st.done + ' / ' + st.total + ' 个字已学'));
      head.appendChild(meter);
      el.appendChild(head);

      /* 地图本体：位置百分比全部以**图片区域**为基准，
         所以图片外侧的 letterbox 不会让据点漂移。 */
      var board = App.el('div', 'wy2-board');
      var art = App.el('div', 'wy2-board-art');
      /* 重绘版：内联 SVG 场景（会动）；?map=paint 可退回原来的静态插画 */
      /* 底图照旧用原画；上面叠一层"按区域裁切的同一张画"来做动效。
         ?map=paint 只留静态底图（关掉动态层）。 */
      art.style.backgroundImage = 'url("' + (MAP.worldImage || MAP.bgImage) + '")';
      var dynamicOn = !/[?&]map=paint\b/.test(location.search) && !!App.worldMap;
      if (dynamicOn) {
        var paint = App.el('div', 'wy2-paint');
        paint.innerHTML = App.worldMap.html();
        art.appendChild(paint);
      }
      art.setAttribute('role', 'img');
      art.setAttribute('aria-label',
        '殷商王邑大地图，其上标有五个可进入的主题区域：天象、山川、草木、禽兽虫鱼、人居器物');
      /* 动态层：云影 / 水光 / 浮尘，全部在图片之上、据点之下 */
      var sky = App.el('div', 'wy2-sky');
      sky.setAttribute('aria-hidden', 'true');
      art.appendChild(sky);

      var river = App.el('div', 'wy2-river');
      river.setAttribute('aria-hidden', 'true');
      art.appendChild(river);

      var dust = App.el('div', 'wy2-dust');
      dust.setAttribute('aria-hidden', 'true');
      for (var mi = 0; mi < 12; mi++) {
        var mote = App.el('span', 'wy2-mote');
        mote.style.left = (8 + Math.random() * 84) + '%';
        mote.style.top = (14 + Math.random() * 74) + '%';
        mote.style.animationDuration = (9 + Math.random() * 8).toFixed(1) + 's';
        mote.style.animationDelay = (-Math.random() * 9).toFixed(1) + 's';
        mote.style.opacity = '0';
        dust.appendChild(mote);
      }
      art.appendChild(dust);

      /* 指针视差：只写两个 CSS 变量，交给 transform；不做逐帧布局 */
      var reduced = false;
      try { reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
      if (!reduced && window.matchMedia && window.matchMedia('(pointer: fine)').matches) {
        var raf = 0, nx = 0, ny = 0;
        art.addEventListener('pointermove', function (ev) {
          var r = art.getBoundingClientRect();
          if (!r.width || !r.height) { return; }
          nx = ((ev.clientX - r.left) / r.width - 0.5) * 2;
          ny = ((ev.clientY - r.top) / r.height - 0.5) * 2;
          if (raf) { return; }
          raf = requestAnimationFrame(function () {
            raf = 0;
            art.style.setProperty('--wx', nx.toFixed(3));
            art.style.setProperty('--wy', ny.toFixed(3));
          });
        });
        art.addEventListener('pointerleave', function () {
          art.style.setProperty('--wx', '0');
          art.style.setProperty('--wy', '0');
        });
      }

      var layer = App.el('div', 'wy2-board-layer');
      art.appendChild(layer);

      var pct = function (v, total) { return (v / total * 100) + '%'; };
      var AX = 2624, AY = 1472;

      (MAP.zones || []).forEach(function (z, i) {
        var w = z.world || { x: AX / 2, y: AY / 2, r: 300 };
        var s = zoneStat(p, z);

        /* 区域点亮：一层柔光，不是贴一块方图——贴方图会在地图上切出硬边 */
        var glow = App.el('span', 'wy2-glow' + (s.clear ? ' on' : '') + (s.done ? ' partial' : ''));
        glow.style.left = pct(w.x, AX);
        glow.style.top = pct(w.y, AY);
        glow.style.width = pct(w.r * 2, AX);
        glow.style.height = pct(w.r * 2, AY);
        layer.appendChild(glow);

        /* P2：薄雾覆盖。未探索=浓雾；学了一部分=薄雾；学完=散尽 */
        var justLit = !!fogLitOnce[z.id];
        if (justLit) { delete fogLitOnce[z.id]; }
        var fog = App.el('span', 'wy2-fog'
          + (s.clear ? ' off' : (s.done ? ' thin' : ''))
          + (justLit ? ' dissolving' : ''));
        fog.style.left = pct(w.x, AX);
        fog.style.top = pct(w.y, AY);
        fog.style.width = pct(w.r * 2.9, AX);
        fog.style.height = pct(w.r * 2.9, AY);
        fog.setAttribute('aria-hidden', 'true');
        layer.appendChild(fog);
        if (justLit) {
          glow.className += ' just-lit';
          if (App.sound && App.sound.pluck) { App.sound.pluck(1.1); }
        }

        var pin = App.el('button', 'wy2-pin' + (s.clear ? ' lit' : '')
          + (w.x > AX * 0.62 ? ' flip' : ''));
        pin.type = 'button';
        pin.style.left = pct(w.x, AX);
        pin.style.top = pct(w.y, AY);
        pin.appendChild(App.el('span', 'wy2-pin-ring', ('0' + (i + 1)).slice(-2)));
        var txt = App.el('span', 'wy2-pin-txt');
        txt.appendChild(App.el('b', null, z.name));
        txt.appendChild(App.el('span', null,
          s.clear ? '雾已散' : (s.done ? '雾散中 ' + s.done + ' / ' + s.total : s.total + ' 个字')));
        pin.appendChild(txt);
        pin.setAttribute('aria-label',
          '进入' + z.name + '（' + s.done + ' / ' + s.total + ' 个字已学）');
        pin.onclick = function () { enterZone(z); };
        layer.appendChild(pin);
      });

      board.appendChild(art);
      el.appendChild(board);

      /* P2：五片皆明收尾——短、可跳过、只播一次 */
      if (st.zones && st.clear >= st.zones && !finaleShown) {
        finaleShown = true;
        var fin = App.el('div', 'wy2-finale');
        fin.appendChild(App.el('div', 'wy2-finale-core', '五片皆明'));
        fin.appendChild(App.el('p', 'wy2-finale-sub', '五片雾，一处一处散开了。'));
        var skip = App.el('button', 'btn sm wy2-finale-skip', '跳过');
        skip.type = 'button';
        skip.onclick = function () {
          if (fin.parentNode) { fin.parentNode.removeChild(fin); }
        };
        fin.appendChild(skip);
        el.appendChild(fin);
        if (App.sound && App.sound.pluck) { App.sound.pluck(1.2); }
        setTimeout(function () {
          if (fin.parentNode) { fin.parentNode.removeChild(fin); }
        }, 2600);
      }

      /* 龟宝只做轻向导：占一行文字位，绝不压在地图上 */
      var guide = App.el('aside', 'wy2-guide');
      var mascot = App.el('img', 'wy2-guide-mascot');
      mascot.src = 'assets/guibao-side.png';
      mascot.alt = '';
      mascot.setAttribute('aria-hidden', 'true');
      guide.appendChild(mascot);
      var gcopy = App.el('div', 'wy2-guide-copy');
      if (st.clear >= st.zones && st.zones) {
        gcopy.appendChild(App.el('b', null, '五片雾都散了'));
        gcopy.appendChild(App.el('span', null, '五片雾都散了。想再看一遍，随时点回去。'));
      } else if (st.done === 0) {
        var _gb = (App.copy && App.copy.pick) ? App.copy.pick('partner', 0) : '';
        gcopy.appendChild(App.el('b', null, _gb || '龟宝：先挑一片顺眼的'));
        gcopy.appendChild(App.el('span', null, '五个区域都能进。进去后点图上看得见的东西。'));
      } else {
        gcopy.appendChild(App.el('b', null, '龟宝：还差 ' + (st.total - st.done) + ' 个字'));
        gcopy.appendChild(App.el('span', null,
          '已拨开 ' + st.clear + ' 片雾。点还覆着雾的地方，继续认。'));
      }
      guide.appendChild(gcopy);
      /* 演示开关与重置：两个都往右下角靠，所以先包一层带 auto 外边距的行 */
      var acts = App.el('div', 'wy2-acts');

      var lite = App.el('button', 'wy2-reset wy2-lite' + (S.lite ? ' on' : ''),
        S.lite ? '演示中 · 回真实进度' : '演示：点亮全图');
      lite.type = 'button';
      lite.setAttribute('aria-pressed', S.lite ? 'true' : 'false');
      lite.title = '给评委演示时，一次点亮全部 ' + st.total + ' 处；只在屏幕上亮，不改存档';
      lite.onclick = function () {
        S.lite = !S.lite;
        App.toast(S.lite
          ? '演示点亮：' + st.total + ' 处全亮，存档没动'
          : '已回到你的真实进度');
        render();
      };
      acts.appendChild(lite);

      var reset = App.el('button', 'wy2-reset', '重置本关进度');
      reset.type = 'button';
      reset.onclick = function () {
        if (!window.confirm('重置第二关的学习记录？其它两关的进度不受影响。')) { return; }
        App.store.del(STORE_KEY);
        S.lite = false;
        render();
      };
      acts.appendChild(reset);
      guide.appendChild(acts);
      el.appendChild(guide);

      var credit = App.el('p', 'wy2-credit',
        (MAP.bgCredit || '') + '　字形数据：Oracle Bone Glyphs v0.3（Li & Bian，CC BY 4.0）。');
      el.appendChild(credit);
    }

    /* 每片一个极淡的环境色调与进区音高：差别要小，但换地方时能感觉到 */
    var ZONE_TONE = {
      sky:   { tint: 'rgba(247, 223, 168, .10)', pitch: 1.22 },
      land:  { tint: 'rgba(216, 193, 154, .10)', pitch: 1.00 },
      plant: { tint: 'rgba(168, 196, 154, .09)', pitch: 1.14 },
      beast: { tint: 'rgba(201, 162, 122, .10)', pitch: 0.90 },
      life:  { tint: 'rgba(185, 160, 122, .09)', pitch: 0.80 }
    };

    function enterZone(z) {
      S.zone = z; S.view = 'zone'; S.sel = null; S.lens = null;
      var tone = ZONE_TONE[z && z.id];
      if (tone && App.sound && App.sound.pluck) { App.sound.pluck(tone.pitch); }
      if (App.sound && App.sound.ambient && z && z.id) { App.sound.ambient(z.id); }
      S.showHot = false; S.zoom = 1; S.scroll = { left: 0, top: 0 };
      S.manual = false; S.region = null;
      S.flow = null;
      scrollToMapOnce = true;      /* 进图一次性的对齐，见 renderZone 末尾 */
      render();
    }
    function backToWorld() {
      if (App.sound && App.sound.ambientStop) { App.sound.ambientStop(); }
      S.view = 'map'; S.zone = null; S.sel = null; S.lens = null; S.flow = null;
      render();
    }
    function redrawZone() {
      /* 只重画小地图这一屏，保留 S.scroll / S.zoom */
      App.clearNode(root);
      renderZone(root);
    }

    /* ----------------------------------------------------------
       小地图上的一层「活气」
       ----------------------------------------------------------
       五张主题小地图是静态插画（assets/level2-0*.jpg）。它们画的都是会动的
       事情 —— 天在下雨、火在烧、水在流、谷屑在飘 —— 画面上却一动不动，
       整屏读起来就是一页印刷品：说明你看的是图，不是地方。
       这一层在同一套用户坐标（2624×1472）里铺极少量的动效：
         glow    日月晕、火塘暖光、雪顶反光（缓慢呼吸）
         rain    雨丝 / 瀑布（下落，负延迟铺满整个画面，不会"等雨来"）
         ember   火星（上升 + 横向飘）
         shimmer 水面微光（短亮线错落明灭）
         ripple  水面涟漪（一圈扩散）
         mote    浮尘 / 谷屑
       数量克制（每片 25~40 个节点），全部 pointer-events:none，
       prefers-reduced-motion 下只剩静止的几团柔光。
       坐标全部照 assets 里那五张图量的（见 dev 里的网格图），
       所以缩放、滚动、切区域时永远贴着实物。
       ---------------------------------------------------------- */
    var MOTION = {
      sky: {
        glows: [
          { x: 335, y: 245, rx: 300, ry: 285, color: '#f7dfa8', a0: .10, a1: .26, dur: 8.4 },
          { x: 2210, y: 195, rx: 180, ry: 175, color: '#f4e8c4', a0: .05, a1: .14, dur: 11.5 },
          /* 火塘：快一倍的心跳，才有"烧"的意思 */
          { x: 1330, y: 1180, rx: 235, ry: 190, color: '#efa04a', a0: .10, a1: .26, dur: 1.9 }
        ],
        rain: [
          { x0: 185, x1: 700, y0: 590, y1: 990, n: 7 },
          { x0: 900, x1: 1265, y0: 470, y1: 990, n: 5 },
          { x0: 1600, x1: 2265, y0: 600, y1: 990, n: 7 }
        ],
        embers: { x: 1330, y: 1250, spread: 78, n: 7 },
        motes: { x0: 220, x1: 2400, y0: 880, y1: 1330, n: 5, tone: '#a98a5f' }
      },
      land: {
        wet: [{ x: 1500, y: 1190, rx: 520, ry: 120 }],
        glows: [
          { x: 690, y: 125, rx: 165, ry: 100, color: '#fffdf2', a0: .05, a1: .16, dur: 9.6 },
          { x: 960, y: 160, rx: 130, ry: 80, color: '#fffdf2', a0: .04, a1: .13, dur: 12.4 },
          /* 泉脚的水汽 */
          { x: 240, y: 860, rx: 100, ry: 76, color: '#fffaf0', a0: .08, a1: .2, dur: 5.2 }
        ],
        /* 瀑布：落差短、速度快，和雨区分开 */
        rain: [
          { x0: 205, x1: 278, y0: 700, y1: 810, n: 5, len: [26, 46], fall: [80, 130], dur: [.85, 1.25] }
        ],
        motes: { x0: 200, x1: 2500, y0: 850, y1: 1330, n: 5, tone: '#b1936a' }
      },
      plant: {
        wet: [{ x: 1850, y: 540, rx: 430, ry: 110 }],
        shimmer: [
          { x: 1420, y: 520, len: 130, tilt: -4 },
          { x: 1665, y: 556, len: 162, tilt: -3 },
          { x: 1905, y: 505, len: 119, tilt: -5 },
          { x: 2150, y: 540, len: 148, tilt: -3 },
          { x: 2320, y: 470, len: 103, tilt: -6 },
          { x: 1540, y: 470, len: 112, tilt: -4 }
        ],
        ripples: [
          { x: 1700, y: 545, r: 82 },
          { x: 2120, y: 500, r: 70 }
        ],
        motes: { x0: 120, x1: 2500, y0: 260, y1: 1150, n: 8, tone: '#c9a874' }
      },
      beast: {
        wet: [{ x: 1300, y: 950, rx: 500, ry: 130 }],
        shimmer: [
          { x: 800, y: 860, len: 140, tilt: -3 },
          { x: 1055, y: 940, len: 175, tilt: -2 },
          { x: 1355, y: 1000, len: 130, tilt: -3 },
          { x: 1650, y: 1055, len: 159, tilt: -2 },
          { x: 1900, y: 1000, len: 113, tilt: -4 },
          { x: 1460, y: 820, len: 124, tilt: -3 },
          { x: 1180, y: 1020, len: 150, tilt: -2 },
          { x: 1790, y: 900, len: 108, tilt: -5 }
        ],
        ripples: [
          { x: 820, y: 880, r: 88 },
          { x: 1520, y: 960, r: 100 },
          { x: 1880, y: 1080, r: 72 }
        ],
        motes: { x0: 160, x1: 2500, y0: 500, y1: 1300, n: 5, tone: '#b09368' }
      },
      life: {
        wet: [{ x: 2390, y: 900, rx: 270, ry: 165 }],
        shimmer: [
          { x: 2280, y: 700, len: 119, tilt: -8 },
          { x: 2405, y: 825, len: 100, tilt: -7 },
          { x: 2330, y: 985, len: 130, tilt: -9 },
          { x: 2500, y: 1085, len: 94, tilt: -6 }
        ],
        ripples: [
          { x: 2320, y: 775, r: 66 },
          { x: 2465, y: 1020, r: 78 }
        ],
        motes: { x0: 260, x1: 2050, y0: 620, y1: 1320, n: 6, tone: '#b3966b' }
      }
    };

    /* 固定的伪随机：每次重画（点一下字卡就重画一次）雨丝和水光不能换位置，
       否则一眨眼整片雨就"跳"一下。 */
    function motionRnd(seedStr) {
      var h = 2166136261;
      for (var i = 0; i < seedStr.length; i++) {
        h ^= seedStr.charCodeAt(i);
        h = (h * 16777619) >>> 0;
      }
      var s = h || 1;
      return function (a, b) {
        s = (s * 1664525 + 1013904223) >>> 0;
        return a + (b - a) * (s / 4294967296);
      };
    }

    /* 光晕与水光：一律走 CSS radial-gradient 的 div。
       为什么不用 SVG 的 <radialGradient>：在同一条 <svg> 里，元素自己用
       fill="url(#id)" 取渐变，实测只画得出很淡的一小片（同样位置换 solid
       立刻正常），排查成本高于收益。CSS 渐变这条路本项目已经走通（.wy2-glow）。
       div 用百分比定位在 stage 上，缩放 / 拖动时跟着画面一起走。 */
    function buildAtmos(z) {
      var cfg = MOTION[z.id];
      if (!cfg || (!cfg.wet && !cfg.glows)) { return null; }
      var wrap = App.el('div', 'wy2-atmos');
      function place(cls, x, y, rx, ry, dur, delay, bg) {
        var d = App.el('div', cls);
        d.style.left = ((x - rx) / 2624 * 100) + '%';
        d.style.top = ((y - ry) / 1472 * 100) + '%';
        d.style.width = (rx * 2 / 2624 * 100) + '%';
        d.style.height = (ry * 2 / 1472 * 100) + '%';
        d.style.background = bg;
        d.style.animationDuration = dur + 's';
        d.style.animationDelay = delay + 's';
        wrap.appendChild(d);
      }
      (cfg.glows || []).forEach(function (g, i) {
        var rgb = hexToRgb(g.color);
        place('m-glowblob', g.x, g.y, g.rx, g.ry, g.dur, -(i * 2.3),
          'radial-gradient(ellipse at center, rgba(' + rgb + ',.62) 0%,'
          + ' rgba(' + rgb + ',.3) 42%, rgba(' + rgb + ',.08) 64%,'
          + ' rgba(' + rgb + ',0) 78%)');
        /* 强弱由 CSS 变量给：每团光的呼吸幅度不一样 */
        var el = wrap.lastChild;
        el.style.setProperty('--a0', String(g.a0));
        el.style.setProperty('--a1', String(g.a1));
      });
      (cfg.wet || []).forEach(function (w, i) {
        place('m-wetblob', w.x, w.y, w.rx, w.ry, 15 + i * 3.5, -(i * 4.5), '');
      });
      return wrap;
    }

    function hexToRgb(hex) {
      var h = String(hex).replace('#', '');
      if (h.length === 3) { h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; }
      var n = parseInt(h, 16);
      return ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255);
    }

    function buildMotion(z) {
      var cfg = MOTION[z.id];
      if (!cfg) { return null; }
      var rnd = motionRnd('wy2m-' + z.id);
      var AX2 = 2624, AY2 = 1472;
      var m = svgEl('svg');
      m.setAttribute('class', 'wy2-motion');
      m.setAttribute('viewBox', '0 0 ' + AX2 + ' ' + AY2);
      m.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      m.setAttribute('aria-hidden', 'true');
      m.setAttribute('focusable', 'false');
      function num(v) { return String(Math.round(v * 100) / 100); }

      (cfg.rain || []).forEach(function (band) {
        var lo = band.len || [26, 44];
        var fa = band.fall || [180, 300];
        var du = band.dur || [1.9, 2.9];
        for (var i = 0; i < band.n; i++) {
          var x = rnd(band.x0, band.x1);
          var y = rnd(band.y0, band.y1);
          var ln = svgEl('line');
          ln.setAttribute('class', 'm-drop');
          ln.setAttribute('x1', num(x));
          ln.setAttribute('y1', num(y));
          ln.setAttribute('x2', num(x - rnd(4, 9)));
          ln.setAttribute('y2', num(y + rnd(lo[0], lo[1])));
          ln.style.setProperty('--o', num(rnd(.2, .42)));
          ln.style.setProperty('--fall', num(rnd(fa[0], fa[1])) + 'px');
          ln.style.animationDuration = num(rnd(du[0], du[1])) + 's';
          ln.style.animationDelay = num(-rnd(0, du[1])) + 's';
          m.appendChild(ln);
        }
      });

      if (cfg.embers) {
        var em = cfg.embers;
        for (var k = 0; k < em.n; k++) {
          var c = svgEl('circle');
          c.setAttribute('class', 'm-ember');
          c.setAttribute('cx', num(em.x + rnd(-em.spread, em.spread)));
          c.setAttribute('cy', num(em.y + rnd(-6, 34)));
          c.setAttribute('r', num(rnd(3.5, 7)));
          c.style.setProperty('--o', num(rnd(.5, .95)));
          c.style.setProperty('--dx', num(rnd(-48, 48)) + 'px');
          c.style.setProperty('--rise', num(-rnd(160, 300)) + 'px');
          c.style.animationDuration = num(rnd(2.2, 3.6)) + 's';
          c.style.animationDelay = num(-rnd(0, 3.6)) + 's';
          m.appendChild(c);
        }
      }

      (cfg.shimmer || []).forEach(function (s) {
        var half = s.len / 2;
        var rad = (s.tilt || 0) * Math.PI / 180;
        var ln = svgEl('line');
        ln.setAttribute('class', 'm-shimmer');
        ln.setAttribute('x1', num(s.x - Math.cos(rad) * half));
        ln.setAttribute('y1', num(s.y - Math.sin(rad) * half));
        ln.setAttribute('x2', num(s.x + Math.cos(rad) * half));
        ln.setAttribute('y2', num(s.y + Math.sin(rad) * half));
        ln.style.setProperty('--o', num(rnd(.5, .8)));
        ln.style.setProperty('--dx', num(rnd(-14, 14)) + 'px');
        ln.style.animationDuration = num(rnd(5.2, 8.4)) + 's';
        ln.style.animationDelay = num(-rnd(0, 8)) + 's';
        m.appendChild(ln);
      });

      (cfg.ripples || []).forEach(function (r) {
        var e = svgEl('ellipse');
        e.setAttribute('class', 'm-ripple');
        e.setAttribute('cx', num(r.x));
        e.setAttribute('cy', num(r.y));
        e.setAttribute('rx', num(r.r));
        e.setAttribute('ry', num(r.r * .3));
        e.style.setProperty('--o', num(rnd(.5, .75)));
        e.style.animationDuration = num(rnd(5.6, 8.2)) + 's';
        e.style.animationDelay = num(-rnd(0, 8)) + 's';
        m.appendChild(e);
      });

      if (cfg.motes) {
        var mo = cfg.motes;
        for (var j = 0; j < mo.n; j++) {
          var d = svgEl('circle');
          d.setAttribute('class', 'm-mote');
          d.setAttribute('cx', num(rnd(mo.x0, mo.x1)));
          d.setAttribute('cy', num(rnd(mo.y0, mo.y1)));
          d.setAttribute('r', num(rnd(2.4, 4.4)));
          d.style.setProperty('--tone', mo.tone);
          d.style.setProperty('--o', num(rnd(.22, .42)));
          d.style.setProperty('--dx', num(rnd(-90, 130)) + 'px');
          d.style.setProperty('--dy', num(-rnd(50, 140)) + 'px');
          d.style.animationDuration = num(rnd(13, 22)) + 's';
          d.style.animationDelay = num(-rnd(0, 20)) + 's';
          m.appendChild(d);
        }
      }

      return m;
    }

    /* ----------------------------------------------------------
       ② 小地图：点实物学字
       ---------------------------------------------------------- */
    function renderZone(el) {
      var p = readProgress();
      var z = S.zone;
      var s = zoneStat(p, z);
      var AX = 2624, AY = 1472;

      /* 环境色调：只给场景一层很淡的径向底，不盖地图插画 */
      var tone = ZONE_TONE[z && z.id];
      if (tone) {
        /* 挂到真正的 .scene 上，否则被壳层的容器盖住，样式不生效 */
        var host = (el.closest && el.closest('.scene')) || document.querySelector('.scene') || el;
        /* 先清掉上一片留下的类，否则会一直挂着 wy2-zone-sky */
        Array.prototype.slice.call(host.classList).forEach(function (c) {
          if (/^wy2-zone-/.test(c)) { host.classList.remove(c); }
        });
        host.classList.add('wy2-zone', 'wy2-zone-' + z.id);
        host.style.setProperty('--wy2-tone', tone.tint);
      }

      /* 顶栏：返回 + 片名 + 进度。做得薄，把纵向空间留给地图。 */
      var top = App.el('header', 'wy2-zone-top');
      var back = App.el('button', 'btn sm wy2-back', '← 大地图');
      back.type = 'button';
      back.onclick = backToWorld;
      top.appendChild(back);

      var zhead = App.el('div', 'wy2-zone-head');
      zhead.appendChild(App.el('b', null, z.name));
      zhead.appendChild(App.el('span', null,
        s.clear ? '这一片已学完 · 大地图上的雾已散'
                : '已学 ' + s.done + ' / ' + s.total
                  + ' · 点图上看得见的实物'));
      top.appendChild(zhead);

      var zbar = App.el('span', 'wy2-zone-meter');
      var zfill = App.el('i', 'wy2-zone-fill');
      zfill.style.width = (s.total ? s.done / s.total * 100 : 0) + '%';
      zbar.appendChild(zfill);
      top.appendChild(zbar);

      /* 工具条：缩放（− / + / 全景）+ 标出可点处。
         「已学」状态也要清楚但克制——用**小小的印记**，不用扎眼的红圈。 */
      var tools = App.el('div', 'wy2-tools');
      var zOut = App.el('button', 'btn sm wy2-zbtn', '−');
      zOut.type = 'button';
      zOut.setAttribute('aria-label', '缩小');
      zOut.onclick = function () { zoomBy(1 / 1.6, null, true); };
      tools.appendChild(zOut);

      var zPct = App.el('span', 'wy2-zpct', Math.round(S.zoom * 100) + '%');
      tools.appendChild(zPct);

      var zIn = App.el('button', 'btn sm wy2-zbtn', '+');
      zIn.type = 'button';
      zIn.setAttribute('aria-label', '放大');
      zIn.onclick = function () { zoomBy(1.6, null, true); };
      tools.appendChild(zIn);

      var zFit = App.el('button', 'btn sm wy2-tool' + (S.zoom <= 1.02 ? ' on' : ''),
        '全景');
      zFit.type = 'button';
      zFit.disabled = S.zoom <= 1.02;
      zFit.onclick = function () { setZoom(1, null, true); };
      tools.appendChild(zFit);

      var hotBtn = App.el('button', 'btn sm wy2-tool' + (S.showHot ? ' on' : ''),
        S.showHot ? '收起提示' : '标出可点处');
      hotBtn.type = 'button';
      hotBtn.onclick = function () { S.showHot = !S.showHot; redrawZone(); };
      tools.appendChild(hotBtn);
      top.appendChild(tools);
      el.appendChild(top);

      /* 分区查看（内容多的图）：点一下跳到一个区域，省得在一屏全景里找 */
      var regions = REGIONS[z.id];
      if (regions && regions.length) {
        var rbar = App.el('div', 'wy2-regions');
        rbar.appendChild(App.el('span', 'wy2-regions-label', '按区域看'));
        regions.forEach(function (rg, ri) {
          var on = S.region === ri;
          var b = App.el('button', 'wy2-region' + (on ? ' on' : ''), rg.name);
          b.type = 'button';
          b.onclick = function () {
            S.region = (S.region === ri) ? null : ri;
            if (S.region === null) { setZoom(1, null, true); }
            else { setZoom(rg.z, { x: rg.x, y: rg.y }, true); }
          };
          rbar.appendChild(b);
        });
        el.appendChild(rbar);
      }

      /* 学习卡会盖在地图上方，所以先建地图，卡片挂到 el 最后 */
      /* is-fit：全景下视口不需要滚动，可以 overflow:hidden —— 于是能给画面
         挂一个极缓的推镜（见 modes.css 的 wy2mPan），而不会长出滚动条。 */
      var viewport = App.el('div', 'wy2-viewport' + (S.showHot ? ' show-hots' : '')
        + (S.zoom <= 1.02 ? ' is-fit' : ''));
      var stage = App.el('div', 'wy2-stage');
      var img = App.el('img', 'wy2-art');
      var artSrc = z.art || MAP.worldImage || MAP.bgImage;
      img.src = artSrc;
      img.alt = z.name + '：' + (z.note || '主题小地图') + '（点图上的实物可以认甲骨文）';
      img.draggable = false;
      stage.appendChild(img);

      /* 全景时图按 contain 铺进视口，两侧必然留边。那不是 bug，是**装裱**：
         画心压在一片绫（视口的纤维底）上，中间一道界格，边上一点影。
         这一层只负责"裱边靠外收一点暗"，不画任何内容
         （曾经想用"同一张图放大糊满"当环境光，糊到 42 仍有竖直接缝，已弃）。 */
      if (S.zoom <= 1.02) {
        var veil = App.el('div', 'wy2-veil');
        veil.setAttribute('aria-hidden', 'true');
        viewport.appendChild(veil);
      }

      var atmos = buildAtmos(z);
      if (atmos) { stage.appendChild(atmos); }
      var motion = buildMotion(z);
      if (motion) { stage.appendChild(motion); }

      var svg = svgEl('svg');
      svg.setAttribute('class', 'wy2-hotspots');
      svg.setAttribute('viewBox', '0 0 ' + AX + ' ' + AY);
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      svg.setAttribute('aria-label', z.name + ' · ' + (z.objects || []).length + ' 个可点实物');

      var objs = (z.objects || []).map(function (o, i) {
        return { o: o, i: i, done: isDone(p, z.id, o.char) };
      });

      objs.forEach(function (it) {
        var o = it.o;
        var g = svgEl('g');
        g.setAttribute('class', 'wy2-spot' + (it.done ? ' done' : '')
          + (S.lens && S.lens.char === o.char ? ' focus' : ''));
        g.setAttribute('transform', 'translate(' + o.x + ',' + o.y + ')');

        var hit = svgEl('circle');
        hit.setAttribute('r', o.r || 70);
        hit.setAttribute('class', 'wy2-hit');
        g.appendChild(hit);

        var ring = svgEl('circle');
        ring.setAttribute('r', o.r || 70);
        ring.setAttribute('class', 'wy2-ring');
        g.appendChild(ring);

        if (it.done) {
          /* 已学：一枚小小的朱砂印记。克制、静态（不做动画），但看得见。
             半径给一个用户单位下限，缩到全景时也还剩一个点。 */
          var seal = svgEl('g');
          seal.setAttribute('class', 'wy2-seal');
          var sc = svgEl('circle');
          sc.setAttribute('r', Math.max(42, (o.r || 70) * 0.34));
          sc.setAttribute('class', 'wy2-seal-bg');
          seal.appendChild(sc);
          var st = svgEl('text');
          st.setAttribute('class', 'wy2-seal-text');
          st.setAttribute('text-anchor', 'middle');
          st.setAttribute('dominant-baseline', 'central');
          st.textContent = o.char;
          seal.appendChild(st);
          g.appendChild(seal);
        }
        svg.appendChild(g);
      });

      stage.appendChild(svg);
      viewport.appendChild(stage);
      el.appendChild(viewport);

      /* 手势提示：进图先给一句，一有真实交互就收起（不挡地图、不闪烁） */
      var ghint = App.el('p', 'wy2-gesture' + (S.hint ? ' used' : ''));
      ghint.appendChild(App.el('b', null, '看全图'));
      ghint.appendChild(App.el('span', null,
        '整幅已经铺满这一屏。拖动可移动，点「+ / −」或双指捏合放大，'
        + '放大后点实物就出字卡。'));
      el.appendChild(ghint);

      if (!objs.length) {
        el.appendChild(App.el('p', 'lead', '这一片还没有学习点。'));
        return;
      }

      /* 窄屏布局助手：站点顶栏是 position:sticky，滚上去不会消失，
         所有「剩余高度」都得先把它减掉，否则工具条会被压在它下面看不见。 */
      function stickyHeadH() {
        var h = document.querySelector('header.top, .top');
        if (!h) { return 0; }
        var r = h.getBoundingClientRect();
        return Math.round(Math.min(r.height, (window.innerHeight || 800) * 0.4)) || 0;
      }
      function docY(node) {
        var r = node.getBoundingClientRect();
        return r.top + (window.pageYOffset || document.documentElement.scrollTop || 0);
      }

      /* 窄屏：视口高度按「进图后顶栏 + 分区栏 + 工具条之下的剩余空间」实测取值。
         CSS 里那条 clamp() 只能估，估大了就把整幅全景顶到首屏之外
         （实测 390×780 时视口 540px，图的上沿落在 y=708，整幅在屏幕外）。
         这里量一次真实剩余高度，宁可矮一点，也要「一眼看全」。 */
      function fitViewportHeight() {
        var vp = root.querySelector('.wy2-viewport');
        if (!vp) { return; }
        if (window.innerWidth > 620) { vp.style.height = ''; return; }
        var head = stickyHeadH();
        var ztop = root.querySelector('.wy2-zone-top');
        var vpOff = 0;
        if (ztop) {
          vpOff = Math.round(vp.getBoundingClientRect().top - ztop.getBoundingClientRect().top);
        }
        var ih = window.innerHeight || 800;
        var avail = ih - head - vpOff - 16;
        avail = Math.max(190, Math.min(avail, ih - head - 50));
        /* 全景态让视口贴着图高，别在图上下一人留一大片空白；
           一旦放大就用满剩余空间（不然放大后没有可拖动的余量）。 */
        var vw = vp.clientWidth || 360;
        var hug = Math.round(vw * AY / AX);
        var want = (S.zoom <= 1.02 && hug < avail) ? hug : avail;
        vp.style.height = Math.max(150, want) + 'px';
      }

      /* ---- 视口与放大 ----
         stage 的宽高都写成像素：图片按 100%/100% 拉伸，
         svg 也显式给同样的像素宽高 + meet，于是两者永远严丝合缝。
         这样「放大后热点还在实物上」不需要任何额外换算。

         基准是 **contain**：zoom=1 时整幅图完整铺进视口（需求「一、5」：
         进地图先给完整全景）。之前用的是 fill-height，会把图横向裁掉。 */
      function fitScale(vp) {
        var vw = vp.clientWidth || 900;
        var vh = vp.clientHeight || 500;
        return Math.min(vw / AX, vh / AY);
      }
      function sizeFor(vp, zf) {
        var bs = fitScale(vp);
        return { w: Math.round(AX * bs * zf), h: Math.round(AY * bs * zf) };
      }
      function applyZoom(anchor) {
        /* 每次都从 DOM 现取视口：setZoom 会整屏重画，闭包里的旧节点已经脱离文档，
           继续用它会量到 0 宽高（那正是"缩回全景后 scrollTop 卡在 84"的根因）。 */
        var vp = root.querySelector('.wy2-viewport');
        if (!vp) { return; }
        viewport = vp;
        var vw = vp.clientWidth || 900;
        var vh = vp.clientHeight || 500;
        var size = sizeFor(vp, S.zoom);
        var w = size.w, h = size.h;
        if (anchor === undefined) { anchor = S.anchor; }
        stage.style.width = w + 'px';
        stage.style.height = h + 'px';
        svg.setAttribute('width', String(w));
        svg.setAttribute('height', String(h));
        if (anchor) {
          var s = w / AX;
          S.scroll.left = clamp(anchor.x * s - vw / 2, 0, Math.max(0, w - vw));
          S.scroll.top = clamp(anchor.y * s - vh / 2, 0, Math.max(0, h - vh));
        } else {
          S.scroll.left = Math.max(0, (w - vw) / 2);
          S.scroll.top = Math.max(0, (h - vh) / 2);
        }
        vp.scrollLeft = S.scroll.left;
        vp.scrollTop = S.scroll.top;
      }
      function setZoom(zf, anchor, manual) {
        S.zoom = Math.max(1, Math.min(MAX_ZOOM, zf));
        S.anchor = anchor || (S.lens ? { x: S.lens.x, y: S.lens.y } : null);
        if (manual) { S.manual = true; }
        if (S.zoom <= 1.02) {
          S.zoom = 1; S.anchor = null; S.lens = null; S.manual = false; S.region = null;
        }
        redrawZone();
        /* 重画后 viewport 是新节点：必须**先定尺寸、再落滚动**，
           否则会把上一轮的旧 scrollTop 落到新节点上（会 scrollTop=84 却无处可滚）。
           缩回全景时锚点为空，applyZoom 会把滚动归零。 */
        requestAnimationFrame(function () {
          var vp = root.querySelector('.wy2-viewport');
          if (!vp) { return; }
          viewport = vp;
          applyZoom(S.anchor);
        });
      }
      function zoomBy(f, anchor, manual) {
        S.region = null;
        setZoom(S.zoom * f, anchor, manual);
      }
      /* 视口坐标 → 图上的用户坐标（2624×1472 空间） */
      function screenToUser(clientX, clientY) {
        var r = svg.getBoundingClientRect();
        if (!r.width) { return null; }
        var scale = Math.min(r.width / AX, r.height / AY);
        var dispW = AX * scale, dispH = AY * scale;
        var offX = r.left + (r.width - dispW) / 2;
        var offY = r.top + (r.height - dispH) / 2;
        return { x: (clientX - offX) / scale, y: (clientY - offY) / scale };
      }
      /* 点击判定：最近者优先 ----
         手机上图缩得很小，小物件只有几像素，逐像素去点不现实。
         所以按落点找**最近的热点**（超出容忍距离就不认），
         命中后自动放大到它，再点一次才开卡片。 */
      window.__wyDbg = window.__wyDbg || { taps: [], picks: [] };
      function pickAt(clientX, clientY) {
        var u = screenToUser(clientX, clientY);
        if (!u) { return null; }
        var ux = u.x, uy = u.y;
        var r = svg.getBoundingClientRect();
        var scale = Math.min(r.width / AX, r.height / AY);
        if (ux < -40 || uy < -40 || ux > AX + 40 || uy > AY + 40) { return null; }

        /* 手指容差：把 44px 换算成用户单位，并给一点余量 */
        var tolPx = 26;
        var tol = tolPx / scale;
        var best = null, bd = Infinity;
        objs.forEach(function (it) {
          var o = it.o;
          var d = Math.sqrt(Math.pow(o.x - ux, 2) + Math.pow(o.y - uy, 2));
          var reach = Math.max(o.r || 70, tol);
          if (d <= reach && d < bd) { bd = d; best = it; }
        });
        return best;
      }

      function onTap(ev) {
        var it = pickAt(ev.clientX, ev.clientY);
        if (!it) {
          if (window.__wyDbg) {
            window.__wyDbg.taps.push({ x: Math.round(ev.clientX), y: Math.round(ev.clientY),
              hit: null, zoom: S.zoom, lens: S.lens ? S.lens.char : null });
          }
          return;
        }
        var o = it.o;
        var sameAsLens = !!(S.lens && S.lens.char === o.char);
        if (window.__wyDbg) {
          window.__wyDbg.taps.push({
            x: Math.round(ev.clientX), y: Math.round(ev.clientY),
            hit: o.char, zoom: S.zoom, lens: S.lens ? S.lens.char : null,
            same: sameAsLens, willCard: !!(S.zoom > 1 && sameAsLens)
          });
        }
        /* 两种情况下这一下就是「打开学习卡」：
           ① 已经由点击放大到它（lens 命中同一个字）；
           ② 玩家自己放过（按钮 / 双指 / 滚轮），已经处在放大状态。 */
        var openNow = (S.zoom > 1.02) && (sameAsLens || S.manual);
        if (window.__wyDbg) {
          var last = window.__wyDbg.taps[window.__wyDbg.taps.length - 1];
          last.openNow = openNow;
        }
        if (openNow) {
          try {
            openCard(it);
            if (window.__wyDbg) { window.__wyDbg.taps[window.__wyDbg.taps.length - 1].ok = 1; }
          } catch (err) {
            if (window.__wyDbg) {
              window.__wyDbg.taps[window.__wyDbg.taps.length - 1].ok = 0;
              window.__wyDbg.err = String((err && err.stack) || err);
            }
          }
          return;
        }
        var zf = ZOOM_HINT[o.char] || 2.6;
        S.lens = { char: o.char, x: o.x, y: o.y };
        S.region = null;
        setZoom(zf, { x: o.x, y: o.y });
      }

      /* ---- 手势：拖动交给浏览器原生滚动；缩放三路都要有
         （按钮 / 双指捏合 / Ctrl+滚轮），否则手机上没有"明显"的放大入口 ---- */
      var ptrs = {};
      var pinch = null;
      var liveZoom = 1;
      var downAt = null;
      var drag = null;
      function dist2(a, b) {
        return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));
      }
      function ptrList() {
        var a = [];
        for (var k in ptrs) { if (ptrs.hasOwnProperty(k)) { a.push(ptrs[k]); } }
        return a;
      }
      function markHintUsed() {
        if (S.hint) { return; }
        S.hint = true;
        var h = root.querySelector('.wy2-gesture');
        if (h) { h.classList.add('used'); }
      }
      /* 捏合过程中直接改 DOM 尺寸，不整屏重画（重画会打断手势） */
      function applyLive(zf, cx, cy) {
        var vp = viewport;
        if (!vp) { return; }
        var size = sizeFor(vp, zf);
        var ratio = size.w / (stage.offsetWidth || size.w);
        var sc = { left: vp.scrollLeft, top: vp.scrollTop };
        var r = vp.getBoundingClientRect();
        var lx = cx - r.left, ly = cy - r.top;
        stage.style.width = size.w + 'px';
        stage.style.height = size.h + 'px';
        svg.setAttribute('width', String(size.w));
        svg.setAttribute('height', String(size.h));
        vp.scrollLeft = clamp((sc.left + lx) * ratio - lx, 0, Math.max(0, size.w - vp.clientWidth));
        vp.scrollTop = clamp((sc.top + ly) * ratio - ly, 0, Math.max(0, size.h - vp.clientHeight));
      }

      viewport.addEventListener('pointerdown', function (ev) {
        downAt = { x: ev.clientX, y: ev.clientY, t: Date.now() };
        ptrs[ev.pointerId] = { x: ev.clientX, y: ev.clientY };
        /* 桌面端：overflow:auto 的容器鼠标拖不动，得自己实现拖动看图 */
        if (ev.pointerType === 'mouse' && S.zoom > 1.02) {
          drag = { x: ev.clientX, y: ev.clientY,
                   left: viewport.scrollLeft, top: viewport.scrollTop };
          viewport.style.cursor = 'grabbing';
          try { viewport.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
        }
        var a = ptrList();
        if (a.length === 2) {
          drag = null;
          pinch = { d: Math.max(1, dist2(a[0], a[1])), z0: S.zoom,
                    cx: (a[0].x + a[1].x) / 2, cy: (a[0].y + a[1].y) / 2 };
          liveZoom = S.zoom;
        }
      });
      viewport.addEventListener('pointermove', function (ev) {
        if (!ptrs[ev.pointerId]) { return; }
        ptrs[ev.pointerId] = { x: ev.clientX, y: ev.clientY };
        if (drag) {
          viewport.scrollLeft = drag.left - (ev.clientX - drag.x);
          viewport.scrollTop = drag.top - (ev.clientY - drag.y);
          markHintUsed();
          return;
        }
        if (!pinch) { return; }
        var a = ptrList();
        if (a.length < 2) { return; }
        var d = Math.max(1, dist2(a[0], a[1]));
        liveZoom = clamp(pinch.z0 * d / pinch.d, 1, MAX_ZOOM);
        applyLive(liveZoom, (a[0].x + a[1].x) / 2, (a[0].y + a[1].y) / 2);
        markHintUsed();
      });
      function endPointer(ev) {
        if (drag) {
          drag = null;
          viewport.style.cursor = '';
          try { viewport.releasePointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
        }
        if (pinch && ptrList().length <= 2) {
          pinch = null;
          S.zoom = liveZoom;
          S.manual = S.zoom > 1.02;
          S.region = null;
          S.lens = null;               /* 捏合之后要重新点一次选字，避免误开 */
          S.anchor = screenToUser(ev.clientX, ev.clientY);
          if (S.zoom <= 1.02) { S.zoom = 1; S.anchor = null; S.manual = false; }
          redrawZone();
          requestAnimationFrame(function () {
            var vp = root.querySelector('.wy2-viewport');
            if (!vp) { return; }
            viewport = vp;
            applyZoom(S.anchor);
          });
        }
        delete ptrs[ev.pointerId];
      }
      viewport.addEventListener('pointerup', function (ev) {
        endPointer(ev);
        if (pinch) { return; }
        if (!downAt) { return; }
        var moved = Math.abs(ev.clientX - downAt.x) + Math.abs(ev.clientY - downAt.y);
        var quick = Date.now() - downAt.t < 700;
        downAt = null;
        if (moved > 12 || !quick) { return; }   /* 是拖动/长按，不算点选 */
        markHintUsed();
        onTap(ev);
      });
      viewport.addEventListener('pointercancel', function (ev) {
        pinch = null;
        drag = null;
        viewport.style.cursor = '';
        delete ptrs[ev.pointerId];
        downAt = null;
      });
      viewport.addEventListener('scroll', function () {
        S.scroll.left = viewport.scrollLeft;
        S.scroll.top = viewport.scrollTop;
        markHintUsed();
      });
      /* Ctrl/⌘ + 滚轮（触控板捏合同源）缩放；普通滚轮继续滚页面 */
      var wheelAt = 0;
      viewport.addEventListener('wheel', function (ev) {
        if (!(ev.ctrlKey || ev.metaKey)) { return; }
        ev.preventDefault();
        var now = Date.now();
        if (now - wheelAt < 140) { return; }
        wheelAt = now;
        S.region = null;
        zoomBy(ev.deltaY > 0 ? 1 / 1.25 : 1.25, screenToUser(ev.clientX, ev.clientY), true);
      }, { passive: false });

      /* ---- 学习卡 ---- */
      function openCard(it) {
        S.sel = it.o.char;
        buildCard(it);
      }
      function buildCard(it) {
        S.sel = it.o.char;
        var prev = root.querySelector('.wy2-card-wrap');
        if (prev) { prev.parentNode.removeChild(prev); }
        var wrap = App.el('div', 'wy2-card-wrap');
        var card = App.el('div', 'wy2-card');
        card.setAttribute('role', 'dialog');
        card.setAttribute('aria-modal', 'true');
        card.setAttribute('aria-label', it.o.char + ' 的学习卡');

        var closeX = App.el('button', 'wy2-card-x', '✕');
        closeX.type = 'button';
        closeX.setAttribute('aria-label', '关闭学习卡');
        closeX.onclick = closeCard;
        card.appendChild(closeX);

        var form = App.el('div', 'wy2-card-form');
        var g = svgEl('svg');
        g.setAttribute('viewBox', '0 0 ' + CV + ' ' + CV);
        g.setAttribute('class', 'wy2-card-glyph');
        if (App.hasGlyph(it.o.char)) { g.innerHTML = App.glyphSvg(it.o.char, 'currentColor'); }
        form.appendChild(g);
        form.appendChild(App.el('span', 'wy2-card-zone', z.name));
        if (it.done) { form.appendChild(App.el('span', 'wy2-card-done', '已学')); }
        card.appendChild(form);

        var info = App.el('div', 'wy2-card-info');
        var row = App.el('div', 'wy2-card-row');
        row.appendChild(App.el('b', 'wy2-card-char', it.o.char));
        row.appendChild(App.el('span', 'wy2-card-kind', kindOf(it.o.char)));
        info.appendChild(row);
        info.appendChild(App.el('p', 'wy2-card-mean', it.o.meaning || ''));
        if (it.o.form) {
          info.appendChild(App.el('p', 'wy2-card-form-note', it.o.form));
        }
        var gl = (App.glyphs && App.glyphs.parts) ? App.glyphs.parts[it.o.char] : null;
        if (gl && gl.sourceChar && gl.sourceChar !== it.o.char) {
          info.appendChild(App.el('p', 'wy2-card-src',
            '数据集中的字形对应「' + gl.sourceChar + '」（glyphId ' + gl.glyphId + '）'));
        }
        if (gl && gl.isFallback) {
          info.appendChild(App.el('p', 'wy2-card-src', '※ 数据集未收录此字，借用其形代用。'));
        }

        var acts = App.el('div', 'wy2-card-acts');
        var learn = App.el('button', 'btn primary', it.done ? '再练一次笔画' : '练一练：把笔画拼回去');
        learn.type = 'button';
        learn.onclick = function () { startFlow(it); };
        acts.appendChild(learn);
        var later = App.el('button', 'btn sm', '先看别的');
        later.type = 'button';
        later.onclick = closeCard;
        acts.appendChild(later);
        info.appendChild(acts);
        card.appendChild(info);

        wrap.appendChild(card);
        wrap.onclick = function (ev) { if (ev.target === wrap) { closeCard(); } };
        root.appendChild(wrap);
        closeX.focus();
      }
      function closeCard() {
        S.sel = null;
        var wrap = root.querySelector('.wy2-card-wrap');
        if (wrap) { wrap.parentNode.removeChild(wrap); }
        /* 回到原位置：滚动与缩放都没动过，确认一下就好 */
        var vp = root.querySelector('.wy2-viewport');
        if (vp) { vp.scrollLeft = S.scroll.left; vp.scrollTop = S.scroll.top; }
      }

      /* ---- 先落一次缩放；视口尺寸此时未必可靠，下一帧再按真实尺寸重算 ----
         窄屏还要先把视口高度压到「屏幕剩下的地方」，否则全景会被顶出首屏。 */
      fitViewportHeight();
      applyZoom();
      refitViewport = function () {
        fitViewportHeight();
        var vp = root.querySelector('.wy2-viewport');
        if (!vp) { return; }
        viewport = vp;
        applyZoom();
      };
      requestAnimationFrame(function () {
        var vp = root.querySelector('.wy2-viewport');
        if (!vp) { return; }
        viewport = vp;
        fitViewportHeight();
        applyZoom();
        /* 进这一片的第一帧：把窗口滚到「分区顶栏」贴住站点顶栏，
           使标题 / 缩放按钮 / 按区域看 / 整幅地图**同时**在第一屏里。
           只滚一次；之后玩家自己上下滚，我们不再插手。 */
        if (scrollToMapOnce) {
          scrollToMapOnce = false;
          var head = stickyHeadH();
          var zt = root.querySelector('.wy2-zone-top');
          if (zt) {
            var target = Math.max(0, docY(zt) - head - 6);
            window.scrollTo(0, target);
            fitViewportHeight();
            applyZoom();
          }
        }
      });

      /* 键盘可达：Tab 到热点时给个明显轮廓（热点在 svg 里，用按钮代理太绕，
         这里给整张图一个可聚焦的入口，回车打开最近未学的字） */
      window.__wyDbg = window.__wyDbg || { taps: [] };
      window.__wyDbg.pickAt = pickAt;
      window.__wyDbg.state = function () {
        return { view: S.view, zoom: S.zoom, lens: S.lens ? S.lens.char : null,
                 sel: S.sel, zone: S.zone ? S.zone.id : null,
                 manual: S.manual, region: S.region, hint: S.hint,
                 scroll: { left: S.scroll.left, top: S.scroll.top },
                 showHot: S.showHot, flow: S.flow ? S.flow.obj.char : null };
      };
      var focusBtn = App.el('button', 'wy2-focus-helper',
        '键盘：认下一个还没学的字');
      focusBtn.type = 'button';
      focusBtn.onclick = function () {
        var next = null;
        objs.some(function (it) { if (!it.done) { next = it; return true; } return false; });
        if (!next) { next = objs[0]; }
        S.lens = { char: next.o.char, x: next.o.x, y: next.o.y };
        setZoom(ZOOM_HINT[next.o.char] || 2.6, { x: next.o.x, y: next.o.y });
        setTimeout(function () { openCard(next); }, 60);
      };
      el.appendChild(focusBtn);

      if (s.clear) {
        var done = App.el('aside', 'wy2-zone-clear');
        done.appendChild(App.el('span', 'wy2-clear-seal', '雾已散'));
        done.appendChild(App.el('span', null,
          '「' + z.name + '」' + s.total + ' 个字都认过了，大地图上这一片亮了。'));
        var nxt = App.el('button', 'btn sm', '回大地图看点亮 →');
        nxt.type = 'button';
        nxt.onclick = backToWorld;
        done.appendChild(nxt);
        el.appendChild(done);
      }

      if (S.flow) { renderFlow(el, S.flow); }
    }

    function kindOf(ch) {
      var BODY = '人大女子目耳口止又足力';
      var NATURE = '日月雨火山丘谷石土泉川水田木林竹禾米屮豕鹿牛羊犬虎虫鱼隹';
      if (BODY.indexOf(ch) >= 0) { return '人体'; }
      if (NATURE.indexOf(ch) >= 0) { return '自然'; }
      return '器物';
    }

    /* ----------------------------------------------------------
       ③ 把笔画拼回去（本关的记录「学过了」由这一步落下）
       沿用原来的拖拽判定，只是把它收进学习卡之后。
       ---------------------------------------------------------- */
    function startFlow(it) {
      S.flow = {
        obj: it.o, zone: S.zone,
        placed: [], pool: shuffle(rangeOf(App.glyphStrokeCount(it.o.char))),
        verdict: '把下面的笔画拖进上面的格子里，摆回原来的位置。'
      };
      redrawZone();
      var el = root.querySelector('.wy2-flow');
      if (el) { el.scrollIntoView({ block: 'nearest' }); }
    }

    function renderFlow(host, flow) {
      var ch = flow.obj.char;
      var strokes = App.glyphStrokes(ch);
      var n = strokes.length;
      var box = App.el('section', 'wy2-flow');

      var head = App.el('div', 'wy2-flow-head');
      head.appendChild(App.el('b', null, '拼一拼「' + ch + '」'));
      head.appendChild(App.el('span', 'wy2-flow-count', n + ' 笔'));
      var x = App.el('button', 'btn sm', '收起');
      x.type = 'button';
      x.onclick = function () { S.flow = null; redrawZone(); };
      head.appendChild(x);
      box.appendChild(head);

      var wrap = App.el('div', 'wy2-flow-body');
      var ref = App.el('div', 'wy2-flow-ref');
      var rg = svgEl('svg');
      rg.setAttribute('viewBox', '0 0 ' + CV + ' ' + CV);
      rg.setAttribute('class', 'wy2-flow-refglyph');
      if (App.hasGlyph(ch)) { rg.innerHTML = App.glyphSvg(ch, 'currentColor'); }
      ref.appendChild(rg);
      ref.appendChild(App.el('span', null, '甲骨文原字'));
      wrap.appendChild(ref);

      var stageWrap = App.el('div', 'wy2-flow-stagewrap');
      var stage = svgEl('svg');
      stage.setAttribute('viewBox', '0 0 ' + CV + ' ' + CV);
      stage.setAttribute('class', 'wy2-flow-stage');
      var guide = svgEl('g');
      guide.setAttribute('class', 'wy2-flow-guide');
      if (App.hasGlyph(ch)) { guide.innerHTML = App.glyphSvg(ch, 'currentColor'); }
      stage.appendChild(guide);
      var placedG = svgEl('g');
      placedG.setAttribute('class', 'wy2-flow-placed');
      stage.appendChild(placedG);
      stageWrap.appendChild(stage);
      wrap.appendChild(stageWrap);
      box.appendChild(wrap);

      var tray = App.el('div', 'wy2-flow-tray');
      tray.appendChild(App.el('span', 'wy2-flow-tray-label', '笔画'));
      var pool = App.el('div', 'wy2-flow-pool');
      tray.appendChild(pool);
      box.appendChild(tray);

      var verdict = App.el('p', 'wy2-flow-verdict', flow.verdict);
      box.appendChild(verdict);
      host.appendChild(box);

      function paintPlaced() {
        App.clearNode(placedG);
        flow.placed.forEach(function (i) {
          var g = svgEl('g');
          g.setAttribute('class', 'wy2-flow-stroke');
          g.innerHTML = App.glyphStrokeSvg(ch, i, 'currentColor');
          placedG.appendChild(g);
        });
      }
      function paintPool() {
        App.clearNode(pool);
        flow.pool.forEach(function (i) {
          if (flow.placed.indexOf(i) >= 0) { return; }
          var c = strokes[i].c;
          var w = Math.max(c[2] - c[0], 1e-3);
          var h = Math.max(c[3] - c[1], 1e-3);
          var pad = Math.max(w, h) * 0.35 + 2;
          var b = App.el('div', 'wy2-piece');
          b.setAttribute('data-i', String(i));
          /* 把这一笔的画布包围盒写上：自动化测试靠它算出"该放哪儿"，
             也方便人工排查某一块为什么摆不进去。 */
          b.setAttribute('data-c', c.join(','));
          var sg = svgEl('svg');
          sg.setAttribute('viewBox', (c[0] - pad) + ' ' + (c[1] - pad) + ' ' +
            (w + pad * 2) + ' ' + (h + pad * 2));
          sg.setAttribute('class', 'wy2-piece-svg');
          sg.innerHTML = App.glyphStrokeSvg(ch, i, 'currentColor');
          b.appendChild(sg);
          attachDrag(b, i, c);
          pool.appendChild(b);
        });
        if (!pool.children.length) {
          pool.appendChild(App.el('span', 'wy2-flow-empty', '都摆上去了'));
        }
      }
      function attachDrag(node, idx, c) {
        var tx = (c[0] + c[2]) / 2, ty = (c[1] + c[3]) / 2;
        var tol = Math.max(16, Math.max(c[2] - c[0], c[3] - c[1]) * 0.55);
        node.setAttribute('data-target', tx + ',' + ty);
        node.setAttribute('data-tol', String(tol));
        node.addEventListener('pointerdown', function (ev) {
          ev.preventDefault();
          node.classList.add('dragging');
          try { node.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
          function move(e) {
            node.style.transform = 'translate(' + (e.clientX - ev.clientX) + 'px,' +
              (e.clientY - ev.clientY) + 'px)';
          }
          function up(e) {
            node.removeEventListener('pointermove', move);
            node.removeEventListener('pointerup', up);
            node.removeEventListener('pointercancel', up);
            node.classList.remove('dragging');
            node.style.transform = '';
            var r = stage.getBoundingClientRect();
            var px = (e.clientX - r.left) / r.width * CV;
            var py = (e.clientY - r.top) / r.height * CV;
            var d = Math.sqrt(Math.pow(px - tx, 2) + Math.pow(py - ty, 2));
            if (d <= tol) {
              flow.placed.push(idx);
              paintPlaced(); paintPool(); check();
            } else {
              var dx = tx - px, dy = ty - py;
              var hz = dx > 8 ? '右' : (dx < -8 ? '左' : '');
              var vt = dy > 8 ? '下' : (dy < -8 ? '上' : '');
              verdict.className = 'wy2-flow-verdict no';
              verdict.textContent = '✘ 没到位——这一笔该往「' + ((vt + hz) || '原处附近') +
                '」挪。已摆 ' + flow.placed.length + ' / ' + n + ' 笔。';
            }
          }
          node.addEventListener('pointermove', move);
          node.addEventListener('pointerup', up);
          node.addEventListener('pointercancel', up);
        });
      }
      function check() {
        if (flow.placed.length < n) {
          verdict.className = 'wy2-flow-verdict';
          verdict.textContent = '已摆 ' + flow.placed.length + ' / ' + n + ' 笔';
          return;
        }
        var p = markDone(flow.zone.id, ch);
        var s = zoneStat(p, flow.zone);
        verdict.className = 'wy2-flow-verdict ok';
        verdict.textContent = '✔ 拼成了「' + ch + '」，已记进「' + flow.zone.name + '」。'
          + (s.clear ? '这一片学完了，大地图上已经点亮。'
                     : '这一片还差 ' + (s.total - s.done) + ' 个字。');
        /* 记录落下后，重画小地图（印记与进度条跟着变） */
        setTimeout(function () { S.flow = null; redrawZone(); }, 1400);
      }

      paintPlaced(); paintPool();
      if (!n) {
        verdict.className = 'wy2-flow-verdict no';
        verdict.textContent = '这个字没有可拆的笔画。';
      }
    }

    render();
  }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function rangeOf(n) { var a = []; for (var i = 0; i < n; i++) { a.push(i); } return a; }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function unmount() {
    S.view = 'map'; S.zone = null; S.sel = null; S.lens = null;
    S.showHot = false; S.zoom = 1; S.flow = null; S.drag = null;
    S.manual = false; S.region = null;
    S.scroll = { left: 0, top: 0 };
    scrollToMapOnce = false;
    if (dropResize) { dropResize(); }
  }

  App.modes.register({
    id: 'wangyi-map',
    name: '殷商王邑',
    tagline: '在大地图上挑一片，点实物认甲骨文',
    desc: '五片主题区域任意顺序进入：在分区插画上点实物认甲骨文，认得的字就记下来。一片认完，大地图上对应的那一片的雾便散开，最终看清整座王邑。',
    icon: '邑',
    accent: 'var(--bronze)',
    tags: ['五片任意进入', '61 个学习点', '点亮大地图'],
    layout: 'wide',
    minPlayers: 1, maxPlayers: 1,
    status: 'ready',
    data: { packs: [], assets: [] },
    mount: mount,
    unmount: unmount
  });

})(window.App = window.App || {});
