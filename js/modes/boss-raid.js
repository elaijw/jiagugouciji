/* ============================================================
   字有骨气 · 玩法模块：构件讨伐（BOSS 战）

   核心逻辑：拆字为武，组构为招，繁笔破防。

   界面（本版重做）
     · 选关：**线性关卡**。21 关排成一条路径，逐关推进，通关即解锁下一关。
     · 作战：**横版对战**。左侧龟宝代表玩家，中间是动态观察提示，右侧是甲骨字形 BOSS；
       上有阶段 HUD，下有构件选择、精简战报与操作。
     · 战斗逻辑与上一版完全一致，只换了排布与外观。

   三档 BOSS（与关卡顺序一致：一阶 6 → 二阶 6 → 终极 9）
     一阶 合体字（涉 鸣 焚 逐 安 家）身体＝构件拼成，拆构件
     二阶 独体字（山 人 木 日 月 水）身上无构件，直接拆笔画
     终极 繁复字（象 龍 鳥 鼓 馬 龜 舞 車 虎）图画型古字，只能斩笔画

   战斗三阶段
     1 构件压制 → 2 构件崩坏（构件攻击失效）→ 3 笔画终局（斩断全部笔画即杀）

   数据在 js/core/levels.json 的 boss 段，代码不写死任何字表。
   ============================================================ */
(function (App) {
  'use strict';

  var BOSS = (App.levels && App.levels.boss) || null;
  var SVGNS = 'http://www.w3.org/2000/svg';
  var CV = 100;
  /* 构件池铺几个。原先铺的是 BOSS.palette 全部 37 个，玩家要在 37 个长得极像的
     甲骨构件里扫，扫完还得往下滚过整片池子才够得着下一步的按钮
     （"改用笔画"因此几乎找不到）；后来收到 12 个，仍嫌多——一阶六关的正确项
     都只有 2 个，12 个里挑 2 个还是要来回比对七八眼。
     现在定 **4** 个：这一阶的正确项恒为 2，所以铺出来就是 2 个真的 + 2 个干扰，
     一屏看全、不用滚，也正好落在"一眼扫完、还得想一想"的区间。
     定宽仍然是关键——池子大小不随正确项个数变，所以"池子里有几个"
     不泄露"答案有几个"；只给正确项才是报答案。 */
  var POOL_SIZE = 4;
  var STORE_KEY = 'bossraid';

  /* ---------- 三档 Boss 形象 ----------
     形象是"这一阶的东西长什么样"的示意（骨色纸面 · 单线墨描），
     负责身份与压迫感；**身上真正可拆的仍然是甲骨字形本身**（真字形 SVG）。
     关系是：怪是躯体，字形是刻在它胸前骨版上的纹路——
     所以字形不是被形象替代，而是被形象承载。
     三张图由同一次生成切出，笔触同源，是一家人。 */
  var TIER_ART = {
    grunt: {
      src: 'assets/boss-01-grunt.png',
      name: '拼合之兽',
      note: '身体由方块拼接，接缝就是它的弱点——拆掉一块，它就不成形。'
    },
    solo: {
      src: 'assets/boss-02-solo.png',
      name: '独体之兽',
      note: '一整块浑然的身体，找不出一条可拆的缝，只能拆笔画。'
    },
    elite: {
      src: 'assets/boss-03-elite.png',
      name: '图画之兽',
      note: '棘刺蔓生、纹路纠缠，构件在它身上彻底混同——只能一段段斩。'
    }
  };
  function tierArt(id) { return TIER_ART[id] || null; }

  /* ---------- 讨伐名录：按「字」取专属形象 ----------
     js/core/boss-codex.json → levels.json 的 bossCodex 段，每个字一张形象。
     取法：**先按字，取不到再回退到本档的通用形象**。
     这样往后往名录里加字，不必动这里的代码——只要有 art，作战与结算就自动换上。 */
  var CODEX = (App.levels && App.levels.bossCodex) || null;
  var CODEX_ENTRIES = (CODEX && CODEX.entries) || [];
  /* 名录的字头照抄 docx 原表，写的是繁体（龜 鳴 車 馬 鳥），而关卡表里
     写的是简体（龟 鸣 车 马 鸟）——只按字头索引，一半关卡都取不到自己的形象，
     只能退回本档那张通用图。所以**两个名字都收**；整字优先于别名，
     免得往后有别名撞上另一个字的字头。 */
  var ART_BY_CHAR = (function () {
    var m = {};
    function put(k, c) { if (k && !m[k]) { m[k] = c; } }
    CODEX_ENTRIES.forEach(function (c) { if (c && c.char && c.art) { put(c.char, c); } });
    CODEX_ENTRIES.forEach(function (c) { if (c && c.alt && c.art) { put(c.alt, c); } });
    return m;
  })();
  /* 取名录条目（原样返回，结算要用它的 form / parts / play） */
  function codexOf(ch) { return ch ? (ART_BY_CHAR[ch] || null) : null; }

  /* ---------- 代用表：docx 字表里没有、因而从来没出过形象的那几关 ----------
     第三关 21 关里有 12 关的字不在《Boss（象形会意假借）.docx》（去掉十二生肖后
     88 尊）里——一阶 焚；二阶 山 人 日 月 水；终极 龍 鳥 鼓 馬 舞 虎。
     它们原先一律回退到 assets/boss-0X-*.png 那三张【早期卡通】档位通用图，
     画风与 88 尊不是一套（红眼、粗轮廓、无骨白平涂），并排看很跳。
     数据在 js/core/boss-art-swap.json → levels.json 的 boss.artSwap，
     由 dev/_build_bosscodex.py 生成。

     取用顺序：名录专属形象 → 本表代用 → 本档通用图。
     借来的形象一律带 swapped 标记：界面因此**说得清它是借的**，
     不会把它冒充成本关的原生形象（需求「二、1 / 二、2」）。
     这张表是数据不是代码——往后补了专属形象，只要把对应那行删掉即可。 */
  var SWAP = (BOSS && BOSS.artSwap && BOSS.artSwap.entries) || {};
  function swapOf(ch) { return ch ? (SWAP[ch] || null) : null; }
  /* 条目里的 group 存的是 id（picto / huiyi / jiajie），直接印出来就是
     给玩家看天书。图鉴那边已经有一份 id→中文名的表，这里照同一份来。 */
  var GROUP_NAME = (function () {
    var m = {};
    ((CODEX && CODEX.groups) || []).forEach(function (g) {
      if (g && g.id && g.name) { m[g.id] = g.name; }
    });
    return m;
  })();
  function groupName(id) { return GROUP_NAME[id] || id || ''; }
  function charArt(ch) {
    var c = codexOf(ch);
    if (c && c.art) {
      return {
        src: c.art,
        /* 形象说明是「巨龟，甲壳如岩、头尾可缩、四足如柱」这样的句子，
           标签只取头一个短句当名字用。 */
        name: String(c.form || ch).split(/[，,、]/)[0].slice(0, 10),
        note: c.form || ''
      };
    }
    /* 名录里没有这一尊，看代用表。name 用**本关自己的描述**（tiers[].list[].note），
       所以标签读得出「这是本关的那尊」；note 借的是「为什么要借这一尊」，
       进 alt 与结算页的说明都靠它。 */
    var s = swapOf(ch);
    if (s && s.art) {
      return {
        src: s.art,
        name: s.name || String(ch),
        note: s.why || '',
        swapped: true,
        from: s.of || '',
        tie: s.tie || ''
      };
    }
    return null;
  }
  /* 形象的显示名。代用的在后面缀一个「· 代用」——只有 10px 的小标注、
     手机上本来就不显示，但它在桌面端把「这张是借的」说清楚了，
     不会让人把独角犀当成虎。 */
  function artLabel(a) {
    if (!a) { return ''; }
    return a.name + (a.swapped ? ' · 代用' : '');
  }
  function bossArtOf() {
    return charArt(S.boss && S.boss.char) || tierArt(S.tier && S.tier.id);
  }

  /* 构件 → 击破效果。对应设计稿：止封走位、口封印技能、水火消属性。 */
  var EFFECT = {
    '止': ['封走位', '止——它的腿。斩断之后，这尊东西再也挪不动一步。'],
    '口': ['封印技能', '口——它的喉咙。击碎之后，吼叫与呼召全部封住。'],
    '水': ['消水属性', '水——它的水脉。断开之后，水属性攻击当场失效。'],
    '火': ['消火属性', '火——它的火种。熄灭之后，火属性攻击当场失效。'],
    '宀': ['破甲', '宀——它的屋顶。掀掉之后，护甲露出一整片裂口。'],
    '木': ['断筋骨', '木——它的骨干。折了之后，整个形体开始塌。'],
    '隹': ['断羽翼', '隹——它的翅膀。扯下之后，再飞不起来。'],
    '豕': ['断冲撞', '豕——它的冲力。卸了之后，只剩原地打转。'],
    '女': ['乱心神', '女——它的依凭。散去之后，身形晃了一下。']
  };
  function effectOf(ch) {
    return EFFECT[ch] || ['削弱', ch + '——被拆了下来，形体缺了一块。'];
  }

  /* ---------- 小工具 ---------- */
  function svgEl(tag) { return document.createElementNS(SVGNS, tag); }
  function parts(name) { return (App.glyphs && App.glyphs.parts) ? App.glyphs.parts[name] : null; }

  /* 单笔的 path（可指定描边粗细，用来做更宽的点击热区） */
  function strokePath(ch, i, color, mul) {
    var g = parts(ch);
    if (!g || !g.pieces[i]) { return ''; }
    return '<g transform="' + g.transform + '"><path d="' + g.pieces[i].d +
      '" fill="none" stroke="' + color + '" stroke-width="' +
      (g.strokeWidth * (mul || 1)) + '" stroke-linecap="round" stroke-linejoin="round"/></g>';
  }

  /* 把 N 个构件并排拼成一个身体：每个缩到 1/N 宽 */
  function compLayout(i, n) {
    var s = 1 / n;
    return 'translate(' + (i * CV * s).toFixed(3) + ',0) scale(' + s.toFixed(5) + ')';
  }

  /* ---------- 关卡表：把三档拍平成一串线性关卡 ---------- */
  function levelList() {
    var out = [];
    (BOSS && BOSS.tiers ? BOSS.tiers : []).forEach(function (t) {
      (t.list || []).forEach(function (b) { out.push({ tier: t, data: b }); });
    });
    return out;
  }
  function levelCount() { return levelList().length; }

  /* ---------- 关卡进度（存在本机） ---------- */
  function prog() {
    var p = App.store.get(STORE_KEY, null);
    if (!p || typeof p !== 'object' || !Array.isArray(p.cleared)) { p = { cleared: [] }; }
    if (!Array.isArray(p.perfect)) { p.perfect = []; }
    return p;
  }
  function saveProg(p) { App.store.set(STORE_KEY, p); }
  function isCleared(i) { return prog().cleared.indexOf(i) >= 0; }
  /* 完美通关：合体 BOSS 阶段一一次都没挑错 */
  function isPerfect(i) { return prog().perfect.indexOf(i) >= 0; }
  function unlocked(i) { return i <= 0 || isCleared(i - 1); }
  function markCleared(i, perfect) {
    var p = prog();
    if (p.cleared.indexOf(i) < 0) { p.cleared.push(i); }
    if (perfect && p.perfect.indexOf(i) < 0) { p.perfect.push(i); }
    saveProg(p);
  }
  function clearedCount() { return prog().cleared.length; }

  var S = {
    view: 'track',      /* track（线性选关）| fight | win */
    idx: 0,             /* 当前关卡序号（0 基） */
    boss: null, tier: null,
    phase: 1, hp: 100, broken: [], cut: [], miss: 0, log: [], hint: false,
    showNames: false,  /* 构件池"显示名字"总开关（触屏用，见 renderPool） */
    /* 这一场战斗真正铺出来的那 12 个构件。进关时抽一次就冻住——
       render() 每打一下就重绘一次，若每次重抽，池子会在玩家指头底下跳。 */
    pool: [],
    /* 这一手打在怪身上的效果。由命中处写入、由 render() 取走一次就清空——
       因此它只会在"刚刚打中"的那一次渲染里出现，别的原因引起的重绘不会重放。 */
    fx: null, fxView: null,
    /* 笔画终局的首次演示（需求「二、4」）：只在该玩家第一次进终局时亮一次，
       对着「本次该打的那一段」指一下，几秒后自己收走，不常驻、不挡操作。
       是否已经看过记在存档里（prog().tipStroke），换一关不会再演一遍。 */
    demo: false
  };

  /* ============================================================
     挂载
     ============================================================ */
  function mount(host, ctx) {
    hardReset();
    var root = App.el('div', 'scene boss-raid');
    host.appendChild(root);

    if (!BOSS || !BOSS.tiers || !BOSS.tiers.length) {
      root.appendChild(App.el('p', 'lead', 'BOSS 数据缺失（js/core/levels.json 的 boss 段）。'));
      return;
    }


    /* ---------- DSH 打击反馈（可整体关闭：App.juice.cfg.enabled=false） ---------- */
    function juicePoint() {
      return root.querySelector('.bd-figure') || root.querySelector('.bd-plate') || root;
    }
    function emitJuice() {
      if (!App.juice) { return; }
      var fx = S.fxView;
      var hp = Math.round(S.hp);
      var dmg = S.__jHp == null ? 0 : Math.max(0, S.__jHp - hp);
      S.__jHp = hp;

      if (fx) {
        if (fx.kind === 'miss') {
          /* 远端已有「砸空了」标签，这里只轻震一下，不再叠数字，避免重复提示 */
          App.juice.shake(juicePoint(), 0.45, 150);
        } else {
          App.juice.hit(juicePoint(), {
            kind: fx.kind === 'cut' ? 'cut' : 'break',
            text: dmg > 0 ? '-' + dmg : '',
            power: fx.kind === 'cut' ? 0.7 : 1,
            freeze: fx.kind === 'cut' ? 60 : 70
          });
        }
      }

      /* 阶段切换：骨片开裂 + 色调过渡 */
      if (S.__jPhase !== S.phase) {
        if (S.phase >= 2 && App.juice.stageBreak) {
          App.juice.stageBreak(root.querySelector('.scene') || root, S.phase);
        }
        S.__jPhase = S.phase;
      }
      /* 通关：一次收束 */
      if (S.view === 'win' && S.__jView !== 'win' && App.juice.finale) {
        App.juice.finale(root.querySelector('.scene') || root);
      }
      S.__jView = S.view;
    }

    function render() {
      /* 命中特效只活一次：拿到 fxView 就把 S.fx 清掉。
         否则「显示名字」这类无关重绘会把上一次的"封走位"再飘一遍。 */
      S.fxView = S.fx;
      S.fx = null;
      emitJuice();          /* DSH：数字/裂纹/震屏/顿帧/阶段/收束 */
      App.clearNode(root);
      if (S.view === 'fight' && S.boss) { renderFight(root); return; }
      if (S.view === 'win' && S.boss) { renderWin(root); return; }
      renderTrack(root);
    }

    function hardReset() {
      S.view = 'track'; S.idx = 0; S.boss = null; S.tier = null;
      S.phase = 1; S.hp = 100; S.broken = []; S.cut = []; S.miss = 0;
      S.log = []; S.hint = false; S.pool = []; S.fx = null; S.fxView = null;
      S.demo = false;
    }

    /* 形体崩坏度：让形象跟着战况走，而不是从头到尾摆一张不变的画。
       五度 —— 0 完好 · 1 缺了一块 · 2 构件错乱 ·
       3 剥落得只剩纹路 · 4 全断。
       度数**直接由已经打出来的进度算**，不另存一份状态：
       这样怪像、左侧拆解条、右侧完整度条，说的永远是同一件事。 */
    function figureStage() {
      if (S.phase === 3) {
        var t = strokeTotal();
        var r = t ? S.cut.length / t : 0;
        return r >= 0.999 ? 4 : (r >= 0.5 ? 3 : 2);
      }
      if (S.phase === 2) { return 2; }
      var n = pieceCount();
      var q = n ? S.broken.length / n : 0;
      return q >= 0.5 ? 1 : 0;
    }

    function say(kind, title, text) {
      S.log.unshift({ kind: kind, title: title, text: text });
      S.log = S.log.slice(0, 6);
    }

    /* 进入某一关 */
    function enter(i) {
      var L = levelList();
      if (i < 0 || i >= L.length || !unlocked(i)) { return; }
      S.idx = i;
      S.boss = L[i].data;
      S.tier = L[i].tier;
      S.view = 'fight';
      S.phase = 1; S.hp = 100; S.broken = []; S.cut = []; S.miss = 0;
      S.log = []; S.hint = false; S.showNames = false;
      S.fx = null; S.fxView = null;
      /* 每进一次关重抽一遍候选：重打时池子会换，靠记位置蒙答案就不成立了。
         但一场之内冻住，池子不会在玩家指头底下跳。 */
      S.pool = buildPool();
      say('sys', '第 ' + (i + 1) + ' 关 · 讨伐开始',
        '一尊 ' + segOf(S.boss) + ' 段的古字挡在面前。拆开它，就知道是哪个字了。');
      render();
    }

    /* 第一个"未通关且已解锁"的关卡序号；全通则返回 -1 */
    function firstOpen() {
      var L = levelList();
      for (var i = 0; i < L.length; i++) {
        if (!isCleared(i) && unlocked(i)) { return i; }
      }
      return -1;
    }

    /* ============================================================
       一、讨伐榜（选关）

       为什么不是一圈珠子：
         · 原来 21 关串在一枚骨片轮廓上，三档（6 / 6 / 9）在环上分不开，
           玩家看不出"这一关比上一关难在哪"；
         · 环上每颗珠子只有 66px，序号、字形、状态、本阶说明全挤在一起。
       现在按**三阶分成三块榜**（一阶一块骨版）：左边是本阶的怪（Boss 形象），
       右边是阶名、这一阶的打法说明、本阶进度，以及这一阶的关卡行。
       分组本身就是信息——玩家一眼能看出难度是三段递进的。
       ============================================================ */
    function renderTrack(el) {
      var L = levelList();
      var p = prog();
      var next = firstOpen();

      var head = App.el('div', 'bo-head');
      head.appendChild(App.el('h3', 'bo-title', '构件讨伐'));
      head.appendChild(App.el('span', 'bo-sub', '拆字为武 · 组构为招 · 繁笔破防'));
      el.appendChild(head);

      var bar = App.el('div', 'bo-progress');
      bar.appendChild(App.el('span', 'bo-progtext',
        '已通关 ' + p.cleared.length + ' / ' + L.length
        + '　完美 ' + p.perfect.length));
      var meter = App.el('span', 'bo-progmeter');
      var fill = App.el('i', 'bo-progfill');
      fill.style.width = (L.length ? Math.round(p.cleared.length / L.length * 100) : 0) + '%';
      meter.appendChild(fill);
      bar.appendChild(meter);
      bar.appendChild(App.el('span', 'bo-prognext',
        next >= 0 ? '下一关 · 第 ' + (next + 1) + ' 关' : '全部通关'));
      el.appendChild(bar);

      el.appendChild(App.el('p', 'lead',
        '一阶一阶往下打：拆得动构件的就拆构件；构件混同、拆不动的图画型古字，'
        + '只能进笔画终局。通关一关，解锁下一关。'));

      var board = App.el('div', 'bo-board');
      var base = 0;
      (BOSS.tiers || []).forEach(function (t) {
        var items = t.list || [];
        var art = tierArt(t.id);
        var done = 0;
        for (var k = 0; k < items.length; k++) { if (isCleared(base + k)) { done++; } }
        var isNow = next >= 0 && next >= base && next < base + items.length;

        var band = App.el('section', 'bo-tier' +
          (done === items.length && items.length ? ' cleared' : '') +
          (isNow ? ' current' : ''));

        /* 左：本阶的怪（Boss 形象）。它只是身份与压迫感，
           真正可拆的字形在战斗里、挂在它胸前的骨版上。 */
        var artBox = App.el('div', 'bo-tier-art');
        var artImg = null, artName = null;
        if (art) {
          artImg = App.el('img', 'bo-tier-img');
          artImg.src = art.src;
          artImg.alt = art.name + '——' + art.note;
          artImg.draggable = false;
          /* 图万一加载不出来就把这一栏整块收掉，别留一格空白 */
          artImg.onerror = function () { band.classList.add('no-art'); };
          artBox.appendChild(artImg);
          artName = App.el('span', 'bo-tier-artname', art.name);
          artBox.appendChild(artName);
        } else {
          band.classList.add('no-art');
        }
        band.appendChild(artBox);
        /* 指针落到某道关（或键盘聚焦）时，把这一阶的**通则形象**换成
           **这一关自己要打的那尊**——名录里那 88 张形象，从选关页就能
           一张张看过去，不必先进战斗去认。移开就还原成这一阶的写法图。
           只对已解锁的关卡生效：没解锁的，连它长什么样都还不该先看到。 */
        function showArtOf(ch) {
          var a = charArt(ch) || art;
          if (!a) { return; }
          if (!artImg) {
            artImg = App.el('img', 'bo-tier-img');
            artImg.draggable = false;
            artImg.onerror = function () { band.classList.add('no-art'); };
            artBox.insertBefore(artImg, artName);
            band.classList.remove('no-art');
          }
          if (artImg.getAttribute('src') !== a.src) { artImg.src = a.src; }
          artImg.alt = a.name + '——' + a.note;
          if (!artName) {
            artName = App.el('span', 'bo-tier-artname', a.name);
            artBox.appendChild(artName);
          }
          artName.textContent = artLabel(a);
        }
        function resetArt() {
          if (!art) { return; }
          if (artImg) { artImg.src = art.src; artImg.alt = art.name + '——' + art.note; }
          if (artName) { artName.textContent = art.name; }
        }

        /* 右：阶名 · 打法 · 本阶进度 · 关卡行 */
        var main = App.el('div', 'bo-tier-main');
        var th = App.el('div', 'bo-tier-head');
        var parts = String(t.name || '').split(' · ');
        th.appendChild(App.el('span', 'bo-tier-no', parts[0] || ''));
        th.appendChild(App.el('h4', 'bo-tier-name', parts[1] || t.name || ''));
        th.appendChild(App.el('span', 'bo-tier-prog',
          '已通关 ' + done + ' / ' + items.length));
        main.appendChild(th);
        main.appendChild(App.el('p', 'bo-tier-note', t.note || ''));

        var row = App.el('div', 'bo-tier-beads');
        items.forEach(function (b, k) {
          var i = base + k;
          var open = unlocked(i);
          var dn = isCleared(i);
          var meta = dn ? (isPerfect(i) ? '完美通关' : '已通关')
                        : (open ? ((b.comps && b.comps.length)
                                   ? '构件 ' + b.comps.length + ' 块'
                                   : (b.seg || 0) + ' 笔')
                                 : '未解锁');

          var bead = App.el('button', 'bo-bead bo-spoiler' +
            (dn ? ' done' : '') + (isPerfect(i) ? ' perfect' : '') +
            (open ? '' : ' locked') + (i === next ? ' next' : ''));
          bead.setAttribute('title', '第 ' + (i + 1) + ' 关 · ' + meta
            + (open ? '　' + t.name : ''));
          bead.setAttribute('aria-label', '第 ' + (i + 1) + ' 关（' + meta + '）');

          bead.appendChild(App.el('span', 'bo-beadnum', String(i + 1)));

          var gw = App.el('div', 'bo-beadglyphwrap');
          var sv = svgEl('svg');
          sv.setAttribute('viewBox', '0 0 ' + CV + ' ' + CV);
          sv.setAttribute('class', 'bo-beadglyph');
          if (t.kind === 'compound' && b.comps && b.comps.length) {
            sv.innerHTML = (b.comps || []).map(function (c, kk) {
              return '<g transform="' + compLayout(kk, b.comps.length) + '">' +
                App.glyphSvg(c, 'currentColor') + '</g>';
            }).join('');
          } else if (App.hasGlyph(b.char)) {
            sv.innerHTML = App.glyphSvg(b.char, 'currentColor');
          }
          gw.appendChild(sv);
          /* 现代字依旧不直接印在甲骨形上：悬停/聚焦/按住才浅浅浮出；
             已通关的先前揭晓过，常显。 */
          gw.appendChild(App.el('span',
            'bo-beadname bo-spoiler-a' + (dn ? ' shown' : ''), b.char));
          bead.appendChild(gw);

          if (open) {
            bead.onclick = function () { enter(i); };
            /* 悬停/聚焦就把左边的怪换成这一关的——已解锁才有这个待遇 */
            bead.addEventListener('pointerenter', function () { showArtOf(b.char); });
            bead.addEventListener('pointerleave', resetArt);
            bead.addEventListener('focus', function () { showArtOf(b.char); });
            bead.addEventListener('blur', resetArt);
          } else {
            bead.disabled = true;
          }
          row.appendChild(bead);
        });
        main.appendChild(row);
        band.appendChild(main);
        board.appendChild(band);

        base += items.length;
      });
      el.appendChild(board);

      var side = App.el('div', 'wy-side');
      if (next >= 0 && p.cleared.length) {
        var cont = App.el('button', 'btn primary', '继续第 ' + (next + 1) + ' 关');
        cont.onclick = function () { enter(next); };
        side.appendChild(cont);
      } else if (next === 0) {
        var st = App.el('button', 'btn primary', '从第 1 关开始');
        st.onclick = function () { enter(0); };
        side.appendChild(st);
      }

      var back = App.el('button', 'btn sm', '回到玩法列表');
      back.onclick = function () { ctx.nav.modes(); };
      side.appendChild(back);
      el.appendChild(side);
    }

    /* ============================================================
       二、横版作战
       ============================================================ */
    function isCompound() {
      return !!(S.boss && S.tier && S.tier.kind === 'compound' && (S.boss.comps || []).length);
    }
    function pieceCount() {
      if (isCompound()) { return S.boss.comps.length; }
      return App.glyphStrokeCount(S.boss.char) || 1;
    }
    function strokeTotal() {
      if (isCompound()) {
        return (S.boss.comps || []).reduce(function (n, c) {
          return n + (App.glyphStrokeCount(c) || 0);
        }, 0);
      }
      return App.glyphStrokeCount(S.boss.char) || 1;
    }
    /* 段数（笔画数）。合体字在数据集里没有完整甲骨形，levels.json 里记的 seg 是 0，
       必须由各构件的段数相加得到——否则界面上会出现"一尊 ? 段的古字"。 */
    function segOf(b) {
      if (b && b.comps && b.comps.length) {
        return b.comps.reduce(function (n, c) {
          return n + (App.glyphStrokeCount(c) || 0);
        }, 0);
      }
      return (b && b.seg) || (App.glyphStrokeCount(b && b.char) || 0);
    }

    /* 结算用的字形。合体字在数据集里本来就没有整字甲骨形——这是真实情况，
       全站一贯的退法是「构件组合示意」（见 shell.js 的 anyGlyphNode，
       那里也标了 .dc-composednote）。这里必须照做，否则结算卡左侧的
       字形位会是一个空框：玩家刚打完一场，却什么也没看到。 */
    function winGlyph() {
      var b = S.boss;
      if (App.hasGlyph(b.char)) {
        return { composed: false, html: App.glyphSvg(b.char, 'currentColor') };
      }
      var comps = (b.comps || []).filter(function (c) { return App.hasGlyph(c); });
      if (!comps.length) { return null; }
      var n = comps.length;
      return {
        composed: true,
        html: comps.map(function (c, ci) {
          return '<g transform="' + compLayout(ci, n) + '">'
            + App.glyphSvg(c, 'currentColor') + '<title>' + c + '</title></g>';
        }).join('')
      };
    }

    /* 裁紧字形格：拼合体是各构件按 1/n 缩放并排的，墨迹只占格子中间一条横带，
       不裁的话下方会空掉一大块，「字形是主角」这件事在视觉上就不成立。
       量不到（元素未布局等）就原样返回，不影响渲染。 */
    function tightenGlyphBox(sv) {
      try {
        var bb = sv.getBBox();
        if (!bb || bb.width < 2 || bb.height < 2) { return; }
        var pad = 6;
        sv.setAttribute('viewBox',
          (bb.x - pad).toFixed(2) + ' ' + (bb.y - pad).toFixed(2) + ' ' +
          (bb.width + pad * 2).toFixed(2) + ' ' + (bb.height + pad * 2).toFixed(2));
        /* 格子不再保持正方，高度按 viewBox 的宽高比走 */
        sv.style.height = 'auto';
      } catch (e) { /* 量不到就退回整格 */ }
    }

    function compIndex(ci, j) {
      var n = 0;
      for (var i = 0; i < ci; i++) { n += App.glyphStrokeCount(S.boss.comps[i]); }
      return n + j;
    }
    function hitAll(c, mul) {
      var g = parts(c);
      if (!g || !g.pieces) { return ''; }
      return g.pieces.map(function (p, i) { return strokePath(c, i, 'rgba(0,0,0,0)', mul); }).join('');
    }

    /* 我方面板上的进度：用真实数据，不放没有机制支撑的假血条 */
    function myProgress() {
      if (S.phase === 3) { return { now: S.cut.length, all: strokeTotal(), label: '斩断进度' }; }
      return { now: S.broken.length, all: pieceCount(), label: '拆解进度' };
    }

    /* 龟宝用当前战况给出陪伴式提示：只提醒观察方向，不替玩家报答案。 */
    function guibaoCue() {
      var latest = S.log[0];
      if (S.phase === 2) {
        return { title: '换一种观察方法', text: '构件已经混在一起了。跟我改用笔画，把这个字形逐段看清。', tone: 'alert' };
      }
      if (S.phase === 3) {
        if (latest && latest.kind === 'cut') {
          return { title: '这段纹路断开了', text: '再观察整体轮廓，找一段清晰的线条继续拆解。', tone: 'action' };
        }
        return { title: '逐笔观察', text: '点选 Boss 身上一段清晰的纹路，看看它如何组成整个字形。', tone: 'action' };
      }
      if (latest && latest.kind === 'miss') {
        return { title: '再观察一次', text: '这块不在它的构形里。别着急，看看整体轮廓，再试另一块。', tone: 'gentle' };
      }
      if (latest && latest.kind === 'break') {
        return { title: '找到一块了', text: '留意形体留下的空缺，再想想还有什么部分组成它。', tone: 'success' };
      }
      if (isCompound()) {
        return { title: '先看构形', text: '观察这个甲骨字形，判断它可能由哪些字形构件组成。', tone: 'action' };
      }
      return { title: '先看轮廓', text: '这是一个整体象形。点选一笔试着拆解，观察线条如何组合。', tone: 'action' };
    }

    /* 龟宝嘴边那一句：把 cue 压到最短，只留一个动作或一句判断。
       误选 / 命中这类要当场看见的反馈也走这里——紧贴着龟宝出，
       不必等玩家把视线挪到战报上才发现自己点错了。 */
    function guibaoLine() {
      var fx = S.fxView;
      if (S.phase === 3) {
        if (fx && fx.kind === 'cut') { return '接着斩下一段'; }
        return S.cut.length ? '照这个走，一段一段来' : '从这里开始，逐段斩';
      }
      if (S.phase === 2) { return '构件混同了，改用笔画'; }
      if (fx && fx.kind === 'miss') { return '这块不在它的构形里'; }
      if (fx && fx.kind === 'break') { return '拆下一块，继续'; }
      if (S.phase >= 3 && App.copy && App.copy.pick) {
        var gline = App.copy.pick('guardian', 0);
        if (gline) { return gline; }
      }
      return isCompound() ? '看它由哪几块拼成' : '点一笔试着拆';
    }

    function renderFight(el) {
      var b = S.boss;

      /* —— 顶部 HUD —— */
      var hud = App.el('div', 'bd-hud');
      var hudL = App.el('div', 'bd-hud-left');
      var back = App.el('button', 'btn sm ghost', '← 关卡');
      back.onclick = function () { S.view = 'track'; S.boss = null; render(); };
      hudL.appendChild(back);
      hudL.appendChild(App.el('span', 'bd-lv',
        '第 ' + (S.idx + 1) + ' 关 / ' + levelCount()));
      hudL.appendChild(App.el('span', 'bd-tier', S.tier.name));
      hud.appendChild(hudL);

      var ph = App.el('div', 'bd-phases');
      ['构件压制', '构件崩坏', '笔画终局'].forEach(function (name, i) {
        var d = App.el('span', 'bd-phase' + (S.phase === i + 1 ? ' on' : '') +
          (S.phase > i + 1 ? ' done' : ''));
        d.appendChild(App.el('i', 'bd-phdot'));
        d.appendChild(App.el('b', null, name));
        ph.appendChild(d);
      });
      hud.appendChild(ph);
      el.appendChild(hud);

      /* —— 横版战场：龟宝是玩家化身，中央区域显示当前观察提示 —— */
      var field = App.el('div', 'bd-field' +
        (S.phase === 2 ? ' broken' : '') + (S.phase === 3 ? ' final' : '') +
        /* 合体 BOSS 阶段一：身上那块不可点，只能用构件池 */
        (isCompound() && S.phase === 1 ? ' pool-only' : ''));
      field.setAttribute('role', 'group');
      field.setAttribute('aria-label', '第 ' + (S.idx + 1) + ' 关战斗场景');
      var cue = guibaoCue();

      /* 左：龟宝代表玩家行动，显示真实拆解进度，不伪造玩家血量。 */
      var hero = App.el('section', 'bd-hero');
      var mp = myProgress();
      var heroHead = App.el('div', 'bd-player-head');
      heroHead.appendChild(App.el('span', 'bd-player-kicker', '玩家化身'));
      heroHead.appendChild(App.el('strong', 'bd-player-name', '龟宝'));
      hero.appendChild(heroHead);

      /* 龟宝嘴边那一句短提示（需求「二、5」：提示改成小气泡 / 靠近龟宝的短句）。
         排在龟宝**正上方**、跟他在同一条流里——不是悬在栏顶的一张卡。
         和中央那张提示卡说的是同一件事，但这里只留最短的一句动词句；
         误选时它当场变成"这块不在它的构形里"，不用去战报里翻。 */
      hero.appendChild(App.el('div',
        'bd-hero-bubble tone-' + cue.tone, guibaoLine()));

      var avatarWrap = App.el('div', 'bd-hero-portrait mood-' + cue.tone);
      var avatar = App.el('img', 'bd-avatar');
      avatar.src = 'assets/guibao-side.png';
      avatar.alt = '龟宝，正在代表玩家观察甲骨字形';
      avatar.draggable = false;
      avatarWrap.appendChild(avatar);
      hero.appendChild(avatarWrap);

      var progress = App.el('div', 'bd-player-progress');
      var progressHead = App.el('div', 'bd-progress-head');
      progressHead.appendChild(App.el('span', 'bd-progress-label', mp.label));
      progressHead.appendChild(App.el('strong', 'bd-progress-value', mp.now + ' / ' + mp.all));
      progress.appendChild(progressHead);
      var hbar = App.el('span', 'bd-progress-track');
      hbar.setAttribute('role', 'progressbar');
      hbar.setAttribute('aria-label', mp.label);
      hbar.setAttribute('aria-valuemin', '0');
      hbar.setAttribute('aria-valuemax', String(mp.all));
      hbar.setAttribute('aria-valuenow', String(mp.now));
      var hfill = App.el('i', 'bd-progress-fill player');
      hfill.style.width = Math.round(mp.now / Math.max(1, mp.all) * 100) + '%';
      hbar.appendChild(hfill);
      progress.appendChild(hbar);
      hero.appendChild(progress);
      field.appendChild(hero);

      /* 中：远景（纯装饰，不接收指针事件，不挡 BOSS 的点击） */
      var sky = App.el('div', 'bd-scene');
      sky.appendChild(App.el('span', 'bd-sun'));
      sky.appendChild(App.el('span', 'bd-cloud c1'));
      sky.appendChild(App.el('span', 'bd-cloud c2'));
      sky.appendChild(App.el('span', 'bd-hill h1'));
      sky.appendChild(App.el('span', 'bd-hill h2'));
      field.appendChild(sky);

      /* 龟宝的战斗提示随阶段、命中和误选变化；不依赖颜色传达信息。 */
      var guide = App.el('section', 'bd-field-guide ' + cue.tone);
      guide.setAttribute('aria-live', 'polite');
      guide.setAttribute('aria-atomic', 'true');
      guide.appendChild(App.el('span', 'bd-guide-kicker', '龟宝的观察提示'));
      guide.appendChild(App.el('h3', 'bd-guide-title', cue.title));
      guide.appendChild(App.el('p', 'bd-guide-copy', cue.text));
      /* 阶段二把"改用笔画"这一手搬到眼前来。
         原来它挂在页面最底部的 .bd-actions 里——而阶段二正好还摊着一整片
         点不动的构件池，按钮被推到屏幕之外，玩家找不到下一步（实测反馈：
         "不太好发现"）。现在它长在提示卡正文下面：玩家正在读的就是这张卡。
         卡片本身在战场正中，不用滚。 */
      if (S.phase === 2) {
        var gcta = App.el('div', 'bd-guide-cta');
        var gbtn = App.el('button', 'btn primary bd-guide-btn',
          '和龟宝一起改用笔画');
        gbtn.onclick = function () { toPhase3(); };
        gcta.appendChild(gbtn);
        gcta.appendChild(App.el('span', 'bd-guide-ctahint',
          '构件这一手已经用尽，接下来逐段看清这个字形'));
        guide.appendChild(gcta);
      }
      var guideFoot = App.el('div', 'bd-guide-foot');
      guideFoot.appendChild(App.el('span', null,
        S.phase === 3 ? '笔画终局' : (S.phase === 2 ? '阶段转换' : '观察与判断')));
      guideFoot.appendChild(App.el('span', null, '不用抢时间，仔细看字形'));
      guide.appendChild(guideFoot);
      field.appendChild(guide);

      /* 右：BOSS 形象 */
      var bossSide = App.el('div', 'bd-boss bo-spoiler');
      bossSide.setAttribute('role', 'group');
      bossSide.setAttribute('aria-label', '甲骨字形 Boss');
      var bh = App.el('div', 'bd-side-head');
      /* BOSS 名同样不直说：先给一个「?」，指针落到 BOSS 一侧才浅浅浮出。
         副标题换成中性的笔画数——写 b.note 里那句（"水与止缺一不可"）等于报构件。 */
      var nm = App.el('span', 'bd-side-name');
      nm.appendChild(App.el('i', 'bd-ask', '？'));
      nm.appendChild(App.el('i', 'bo-spoiler-a', b.char));
      bh.appendChild(nm);
      bh.appendChild(App.el('span', 'bd-side-role', segOf(b) + ' 段笔画'));
      bossSide.appendChild(bh);
      var bbar = App.el('span', 'bd-sidebar');
      bbar.setAttribute('role', 'progressbar');
      bbar.setAttribute('aria-label', 'Boss 形体完整度');
      bbar.setAttribute('aria-valuemin', '0');
      bbar.setAttribute('aria-valuemax', '100');
      bbar.setAttribute('aria-valuenow', String(Math.max(0, Math.round(S.hp))));
      var bfill = App.el('i', 'bd-sidefill boss');
      bfill.style.width = Math.max(0, S.hp) + '%';
      bbar.appendChild(bfill);
      bossSide.appendChild(bbar);
      bossSide.appendChild(App.el('span', 'bd-hpnum',
        '形体完整度 ' + Math.max(0, Math.round(S.hp)) + '%'));

      /* 怪像 + 字形：形象是"这是什么东西"，字形是"身上刻着什么"。
         两者**并排**——形象不压在字形上，字形尺寸一点没动，
         仍然是可点、可拆的那个游戏对象。

         但形象**不是一张挂着的画**：它就是这个怪的身体，所以它会随战况变。
         fig-stage-N 给它的崩坏度（拆掉几块 / 构件错乱 / 剥落到只剩纹路），
         is-hit 是刚落下的那一下——每打中一次，整尊抖一次，并在它身上
         飘出这一手的名字（"封走位""斩断一段"）。玩家因此看得见自己的
         这一下**落在了这尊东西的身上**，而不是只在战报里多了一行字。 */
      var stage = figureStage();
      var figArt = bossArtOf();
      var figure = App.el('div', 'bd-figure fig-stage-' + stage +
        (figArt ? '' : ' no-art') + (S.fxView ? ' is-hit' : ''));
      if (figArt) {
        var figMedia = App.el('div', 'bd-figure-media');
        var figShot = App.el('div', 'bd-figure-shot');
        var figImg = App.el('img', 'bd-figure-art');
        figImg.src = figArt.src;
        figImg.alt = figArt.name + '——' + figArt.note;
        figImg.draggable = false;
        /* 图挂了就退回"只有字形"的样子（.no-art），绝不留一只空框 */
        figImg.onerror = function () { figure.classList.add('no-art'); };
        figShot.appendChild(figImg);
        /* 第二层：同一张图，反相 + screen，把褐墨的刻痕抬成暖光。
           ——为什么非要二层：深色战场上骨白的身亮得很，可**褐墨的线整片
           沉进底色里**。实体型的兽还好，靠身就认得出；线描多的（涉的水波、
           雷的闪电、云气）就只剩一团白，认不出是什么东西。
           同图反相之后，骨白的身沉下去、褐墨的线浮上来；再用 screen 叠回去，
           身还是骨白的形，身上的刻痕却亮了起来——正是这游戏要玩家盯着的纹路。

           这一层刻意用 <img> 而不是 CSS 变量取图：background-image 里的
           url() 是**按样式表所在目录**解析的（css/…），写相对路径会 404，
           而且不报错、只是什么都不显示——很难查。用同源的 img 最稳。 */
        var figGlow = App.el('img', 'bd-figure-glow');
        figGlow.src = figArt.src;
        figGlow.alt = '';
        figGlow.draggable = false;
        figGlow.setAttribute('aria-hidden', 'true');
        figShot.appendChild(figGlow);
        figMedia.appendChild(figShot);
        figMedia.appendChild(App.el('span', 'bd-figure-tag', artLabel(figArt)));
        figure.appendChild(figMedia);
      }

      var plate = App.el('div', 'bd-plate');
      var sv = svgEl('svg');
      sv.setAttribute('viewBox', '0 0 ' + CV + ' ' + CV);
      sv.setAttribute('class', 'bd-body');
      sv.innerHTML = bodyMarkup();
      plate.appendChild(sv);
      figure.appendChild(plate);

      /* 命中飘字：挂在 .bd-figure 上（它 position:relative），
         所以即使这一档没有形象图，这一下也照样报得出来。 */
      if (S.fxView) {
        figure.appendChild(App.el('span',
          'bd-figure-fx ' + S.fxView.kind, S.fxView.label));
      }
      bossSide.appendChild(figure);
      field.appendChild(bossSide);

      field.appendChild(App.el('span', 'bd-ground'));
      el.appendChild(field);

      /* 笔画终局的首次演示层：在战报与构件池之前插进战场里，
         且只挂在 .bd-plate 内（跟着字形走，不覆盖别处）。
         位置由那段笔画自己的 bbox 算，不写死坐标——每个字的笔画在哪儿都不一样。 */
      if (S.phase === 3 && S.demo) {
        var nx = root.querySelector('.bd-plate .bo-cut.is-next');
        var demo = App.el('div', 'bd-demo');
        var hand = App.el('i', 'bd-demo-hand');
        var dtxt = App.el('span', 'bd-demo-text', '从这一段开始');
        if (nx && nx.getBBox) {
          var bb = nx.getBBox();
          var px = Math.max(6, Math.min(94, (bb.x + bb.width / 2) / CV * 100));
          var py = Math.max(6, Math.min(94, (bb.y + bb.height / 2) / CV * 100));
          hand.style.left = px + '%';
          hand.style.top = py + '%';
          dtxt.style.left = px + '%';
          dtxt.style.top = py + '%';
        }
        demo.appendChild(hand);
        demo.appendChild(dtxt);
        var plate2 = root.querySelector('.bd-plate');
        if (plate2) { plate2.appendChild(demo); }
      }

      /* 构件池：只有身上真有构件的那一档才给（其余档没有可挑的东西） */
      if (isCompound()) { renderPool(el); }

      /* —— 精简战报：保留最近三次反馈，不盖过角色提示与操作区 —— */
      var logs = App.el('div', 'bd-logs');
      S.log.slice(0, 3).forEach(function (l) {
        var row = App.el('div', 'bd-log ' + l.kind);
        row.appendChild(App.el('b', null, l.title));
        row.appendChild(App.el('span', null, l.text));
        logs.appendChild(row);
      });
      el.appendChild(logs);

      /* —— 操作 —— */
      /* 阶段二的"改用笔画"不在这里：它已经搬到提示卡正文下面（见 renderFight
         的 .bd-guide-cta）。这一行只剩"重来本关"，不再把唯一的下一步
         推到页面最底下、构件池的下方。 */
      var acts = App.el('div', 'bd-actions');
      var redo = App.el('button', 'btn sm', '重来本关');
      redo.onclick = function () { enter(S.idx); };
      acts.appendChild(redo);
      el.appendChild(acts);

      bindBody(sv);
    }

    /* 抽这一场的候选构件。两条硬约束：
       ① 只给正确项 = 报答案 —— 必须掺干扰项；
       ② 铺全部 = 在 37 个长得极像的构件里瞎扫，还会把下一步的按钮
          挤出屏幕 —— 所以收窄。
       取 POOL_SIZE 个定宽：正确项一个不少，其余从池子里随机补满。
       因为总数恒定，"池子里有几个"不会反过来暴露"答案有几个"。 */
    function buildPool() {
      var all = (BOSS && BOSS.palette) || [];
      var need = (S.boss && S.boss.comps) || [];
      if (!need.length || all.length <= POOL_SIZE) { return all.slice(); }
      var keep = [], rest = [];
      all.forEach(function (c) {
        if (need.indexOf(c) >= 0) { keep.push(c); } else { rest.push(c); }
      });
      shuffle(rest);
      var out = keep.concat(rest.slice(0, Math.max(0, POOL_SIZE - keep.length)));
      shuffle(out);   /* 再洗一遍：正确项不会永远落在最前两个 */
      return out;
    }
    function shuffle(a) {
      for (var i = a.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = a[i]; a[i] = a[j]; a[j] = t;
      }
      return a;
    }

    /* 构件池 */
    function renderPool(el) {
      var need = S.boss.comps || [];
      var pool = (S.pool && S.pool.length) ? S.pool : (S.pool = buildPool());
      var box = App.el('div', 'bd-pool');

      var head = App.el('div', 'bd-pool-head');
      head.appendChild(App.el('b', null, '构件池'));

      /* —— 阶段二起这一手已经废了：整池收成一条细栏。
         不铺那一片点不动的残池——它只干两件事：占掉一屏高度、
         把"改用笔画"推到屏幕之外。位置让给按钮本身。 */
      if (S.phase !== 1) {
        box.className += ' is-dead';
        head.appendChild(App.el('span', 'bd-pool-note dead',
          S.phase === 2
            ? '已失效——形体错乱，构件对不上号了'
            : '已拆尽——没有构件可对了，只剩笔画'));
        if (S.phase === 2) {
          var pcta = App.el('button', 'btn sm primary bd-pool-cta', '改用笔画 →');
          pcta.onclick = function () { toPhase3(); };
          head.appendChild(pcta);
        }
        box.appendChild(head);
        el.appendChild(box);
        return;
      }

      head.appendChild(App.el('span', 'bd-pool-note',
        '从 ' + pool.length + ' 块里挑出它身上的构件 · 已拆 '
        + S.broken.length + ' / ' + need.length
        + (S.miss ? ' · 误选 ' + S.miss + ' 次' : '')));
      /* 触屏没有悬停，给一个常显开关——这就是"点击显示名字"。
         默认关着：甲骨形上不印现代字是既定规则。 */
      var toggle = App.el('button', 'btn sm ghost bd-pool-toggle',
        S.showNames ? '隐藏名字' : '显示名字');
      toggle.onclick = function () { S.showNames = !S.showNames; render(); };
      head.appendChild(toggle);
      box.appendChild(head);
      if (S.showNames) { box.className += ' show-names'; }

      var grid = App.el('div', 'bd-poolgrid');
      pool.forEach(function (c) {
        var idx = need.indexOf(c);
        var hit = idx >= 0 && S.broken.indexOf(idx) >= 0;
        var chip = App.el('button', 'bd-chip bo-spoiler' + (hit ? ' done' : ''));
        chip.setAttribute('aria-label', '构件 ' + c);
        chip.setAttribute('aria-pressed', hit ? 'true' : 'false');
        chip.disabled = hit;

        var sv = svgEl('svg');
        sv.setAttribute('viewBox', '0 0 ' + CV + ' ' + CV);
        sv.setAttribute('class', 'bd-chipglyph');
        if (App.hasGlyph(c)) { sv.innerHTML = App.glyphSvg(c, 'currentColor'); }
        chip.appendChild(sv);

        /* 构件名同样不直接印在甲骨形上：默认 opacity 0，
           悬停 / 键盘聚焦 / 按住（触屏）才浮出；
           池子标题栏的「显示名字」可让全池常显。 */
        chip.appendChild(App.el('span', 'bd-chipname bo-spoiler-a', c));
        chip.onclick = function () { pickComp(c, idx, hit); };
        grid.appendChild(chip);
      });
      box.appendChild(grid);
      el.appendChild(box);
    }

    /* 挑了一个构件：对上就拆下来，对不上记一次误选 */
    function pickComp(c, idx, alreadyHit) {
      if (S.phase !== 1) {
        if (!S.hint) {
          S.hint = true;
          say('fail', '构件打法失效', '构件已经混同、变形，对不上号了。改用笔画。');
        }
        render();
        return;
      }
      if (alreadyHit) { return; }

      if (idx < 0) {
        S.miss++;
        S.fx = { kind: 'miss', label: '砸空了' };
        say('miss', '砸空了', '「' + c + '」不在它身上——再看一遍，它到底由什么拼起来。');
        render();
        return;
      }

      S.broken.push(idx);
      S.hp -= 50 / pieceCount();
      var eff = effectOf(c);
      S.fx = { kind: 'break', label: eff[0] };
      say('break', eff[0] + '（' + c + '）', eff[1]);

      if (S.broken.length >= pieceCount() || S.hp <= 0) {
        S.hp = Math.max(50, S.hp);
        S.phase = 2;
        say('fail', '构件崩坏', '它把拆散的部件又吸了回去——形体错乱、构件混同。'
          + '这正是甲骨文里那些异体乱象。构件打法继续不下去了。');
        render();
        return;
      }
      render();
    }

    /* 身体 SVG：按阶段给出不同结构（与上一版一致） */
    function bodyMarkup() {
      var b = S.boss;
      var out = [];

      if (S.phase === 3) {
        /* 终局：纯笔画体。合体 BOSS 用各构件笔画之和；其余用整字笔画。
           **第一段还没斩的笔画标成 is-next**：需求「二、4」要求
           "明确标出本次可攻击的笔画或路径"。只靠提示卡那句"点一段残线"
           等于让玩家在一堆细线里自己认哪一段是活的——现在图上直接指出来。 */
        var marked = false;
        if (isCompound()) {
          var n = b.comps.length;
          b.comps.forEach(function (c, ci) {
            var cnt = App.glyphStrokeCount(c);
            for (var j = 0; j < cnt; j++) {
              var k = compIndex(ci, j);
              if (S.cut.indexOf(k) >= 0) { continue; }
              var isNext = !marked; marked = true;
              out.push('<g class="bo-cut' + (isNext ? ' is-next' : '') +
                '" data-k="' + k + '" transform="' +
                compLayout(ci, n) + '">' + strokePath(c, j, 'currentColor', 1) +
                '<g class="bo-hit">' + strokePath(c, j, 'rgba(0,0,0,0)', 7) + '</g></g>');
            }
          });
        } else {
          var m = App.glyphStrokeCount(b.char);
          for (var i = 0; i < m; i++) {
            if (S.cut.indexOf(i) >= 0) { continue; }
            var isNext2 = !marked; marked = true;
            out.push('<g class="bo-cut' + (isNext2 ? ' is-next' : '') +
              '" data-k="' + i + '">' +
              strokePath(b.char, i, 'currentColor', 1) +
              '<g class="bo-hit">' + strokePath(b.char, i, 'rgba(0,0,0,0)', 7) + '</g></g>');
          }
        }
        return out.join('');
      }

      /* 一、二阶段：合体拆构件；其余拆笔画 */
      if (isCompound()) {
        var nn = b.comps.length;
        b.comps.forEach(function (c, ci) {
          if (S.broken.indexOf(ci) >= 0) { return; }
          out.push('<g class="bo-part" data-k="' + ci + '" data-kind="comp" transform="' +
            compLayout(ci, nn) + '">' + App.glyphSvg(c, 'currentColor') +
            '<g class="bo-hit">' + hitAll(c, 7) + '</g>' +
            '<title>' + c + '</title></g>');
        });
        /* 已拆掉的位置留一个虚线残影 */
        b.comps.forEach(function (c, ci) {
          if (S.broken.indexOf(ci) < 0) { return; }
          out.push('<g class="bo-gone" transform="' + compLayout(ci, nn) + '">' +
            App.glyphSvg(c, 'currentColor') + '</g>');
        });
      } else {
        var cnt2 = App.glyphStrokeCount(b.char);
        for (var s = 0; s < cnt2; s++) {
          if (S.broken.indexOf(s) >= 0) { continue; }
          out.push('<g class="bo-part" data-k="' + s + '" data-kind="stroke">' +
            strokePath(b.char, s, 'currentColor', 1) +
            '<g class="bo-hit">' + strokePath(b.char, s, 'rgba(0,0,0,0)', 7) + '</g>' +
            '</g>');
        }
        for (var s2 = 0; s2 < cnt2; s2++) {
          if (S.broken.indexOf(s2) < 0) { continue; }
          out.push('<g class="bo-gone">' + strokePath(b.char, s2, 'currentColor', 1) + '</g>');
        }
      }
      return out.join('');
    }

    function bindBody(sv) {
      var b = S.boss;
      if (S.phase === 3) {
        Array.prototype.forEach.call(sv.querySelectorAll('.bo-cut'), function (g) {
          g.addEventListener('click', function () {
            var k = parseInt(g.getAttribute('data-k'), 10);
            if (S.cut.indexOf(k) >= 0) { return; }
            /* 玩家已经动手了，演示层立刻收走——留着就挡下一段了 */
            if (S.demo) {
              S.demo = false;
              if (demoTimer) { clearTimeout(demoTimer); demoTimer = null; }
            }
            S.cut.push(k);
            var total = strokeTotal();
            S.hp -= 50 / total;
            if (S.cut.length >= total || S.hp <= 0) { S.hp = 0; win(); return; }
            S.fx = { kind: 'cut', label: '斩断一段' };
            say('cut', '斩断一段', '第 ' + S.cut.length + ' 段笔画断了——纹路护甲又少一块。');
            render();
          });
        });
        return;
      }

      /* 身上有构件的档：阶段一**只能**用构件池。
         直接点身上那块等于把答案指出来，所以这里不绑点击；
         阶段二点头身只给一句失效提示（那是引导，不是输入）。 */
      if (isCompound()) {
        if (S.phase === 2) {
          Array.prototype.forEach.call(sv.querySelectorAll('.bo-part'), function (g) {
            g.addEventListener('click', function () { pickComp('', -1, false); });
          });
        }
        return;
      }

      Array.prototype.forEach.call(sv.querySelectorAll('.bo-part'), function (g) {
        g.addEventListener('click', function () {
          var k = parseInt(g.getAttribute('data-k'), 10);
          var kind = g.getAttribute('data-kind');
          if (S.broken.indexOf(k) >= 0) { return; }

          /* 阶段一：拆下来，掉血 */
          S.broken.push(k);
          S.hp -= 50 / pieceCount();

          if (kind === 'comp') {
            var eff = effectOf(b.comps[k]);
            S.fx = { kind: 'break', label: eff[0] };
            say('break', eff[0] + '（' + b.comps[k] + '）', eff[1]);
          } else {
            S.fx = { kind: 'break', label: '拆去一笔' };
            say('break', '拆去一笔', '第 ' + S.broken.length + ' 笔被拆了下来，形体轻了一分。');
          }

          if (S.broken.length >= pieceCount() || S.hp <= 0) {
            S.hp = Math.max(50, S.hp);
            S.phase = 2;
            say('fail', '构件崩坏', '它把拆散的部件又吸了回去——形体错乱、构件混同。'
              + '这正是甲骨文里那些异体乱象。构件打法继续不下去了。');
            render();
            return;
          }
          render();
        });
      });
    }

    function toPhase3() {
      S.phase = 3;
      S.cut = [];
      /* 第一次进终局的玩家，给一段几秒的演示（需求「二、4」"首次操作时给出
         简短演示"）。看过一次就记进存档，之后不再演。 */
      var p = prog();
      if (!p.tipStroke) { p.tipStroke = 1; saveProg(p); S.demo = true; }
      say('sys', '笔画终局', '它彻底化为无构件的纯图画古字。'
        + '现在只有一件事能做：把它的笔画一段一段斩断。');
      render();
      if (S.demo) { demoStrokeOnce(); }
    }

    /* 笔画演示：把"本次该打的那一段"指出来，几秒后自己收走。
       只摘掉这一层演示层，不重画整屏——重画会把刚落的停顿又抖一下。 */
    var demoTimer = null;
    function demoStrokeOnce() {
      if (demoTimer) { clearTimeout(demoTimer); }
      demoTimer = setTimeout(function () {
        demoTimer = null;
        S.demo = false;
        var d = root.querySelector('.bd-demo');
        if (d && d.parentNode) { d.parentNode.removeChild(d); }
      }, 4600);
    }

    function win() {
      markCleared(S.idx, S.miss === 0);
      S.view = 'win';
      say('win', '斩杀', '「' + S.boss.char + '」的纹路护甲全断，形体崩解。');
      render();
    }

    /* ============================================================
       三、通关
       ============================================================ */
    function renderWin(el) {
      var b = S.boss;
      var L = levelList();
      var last = S.idx >= L.length - 1;

      var card = App.el('div', 'bd-win');
      /* 结算也用同一套关系：怪的立绘在底，被杀掉的字形压在它胸前的骨版上。
         打到这一步形象已经是最终态（stage 4：形体全断），所以它是一个
         半透明、边缘发虚的残影——已经散了的这尊东西。 */
      var fig = App.el('div', 'bd-winfig fig-stage-4');
      var wArt = bossArtOf();
      if (wArt) {
        var wImg = App.el('img', 'bd-winfig-art');
        wImg.src = wArt.src;
        wImg.alt = wArt.name + '——' + wArt.note;
        wImg.draggable = false;
        wImg.onerror = function () { fig.classList.add('no-art'); };
        fig.appendChild(wImg);
      } else {
        fig.classList.add('no-art');
      }
      var sv = svgEl('svg');
      sv.setAttribute('viewBox', '0 0 ' + CV + ' ' + CV);
      sv.setAttribute('class', 'bd-winglyph');
      var wg = winGlyph();
      if (wg) { sv.innerHTML = wg.html; }
      var wPlate = App.el('div', 'bd-plate');
      wPlate.appendChild(sv);
      /* 合体字是构件拼出来的示意，必须标出来——不能让人以为
         这就是「涉」的甲骨文原形。 */
      if (wg && wg.composed) {
        wPlate.appendChild(App.el('span', 'bd-composednote', '构件组合示意'));
      }
      fig.appendChild(wPlate);
      card.appendChild(fig);

      var info = App.el('div', 'bd-wininfo');
      /* 已经斩杀了，这里不再遮：正是要让玩家把"甲骨形 ↔ 现代字"对上 */
      info.appendChild(App.el('h3', 'bd-wintitle', '斩杀「' + b.char + '」'));
      info.appendChild(App.el('p', 'bd-windesc',
        '第 ' + (S.idx + 1) + ' 关 · ' + S.tier.name + '　' + b.note));
      if (b.comps && b.comps.length) {
        info.appendChild(App.el('p', 'bd-windesc',
          '它的身体由「' + b.comps.join('」与「') + '」拼成——拆掉其中任何一块，它都不再成形。'));
      } else {
        info.appendChild(App.el('p', 'bd-windesc',
          '全身 ' + segOf(b) + ' 段连续纹路，没有一处能拆的构件，只能用笔画破。'));
      }
      /* 合体档报一下误选：这是自己判断构件的成绩单 */
      if (b.comps && b.comps.length) {
        info.appendChild(App.el('p', S.miss === 0 ? 'bd-winnote perfect' : 'bd-winnote',
          S.miss === 0
            ? '※ 完美通关：一次都没挑错——你一眼就看出了它由哪几个构件拼成。'
            : '※ 本关误选了 ' + S.miss + ' 次。挑错不扣血，但意味着还没看清它的构件。'));
      }
      if (b.char === '車' || b.char === '虎') {
        info.appendChild(App.el('p', 'bd-winnote',
          '※ 这是本作笔画最繁的甲骨字形之一（' + segOf(b) + ' 段）。'
          + '构件拆解在它身上彻底失效——正是「繁笔破防」的由来。'));
      }

      /* 打完之后才揭「这一尊是什么、破绽在哪、字表上该怎么破」。
         这些在**开打之前**给出来就等于报答案（"先断枝、再斩根"就是整套解），
         所以它只出现在结算里：赢下来，才算真正读懂了这一尊。 */
      var cx = codexOf(b.char);
      if (cx) {
        var cxbox = App.el('div', 'bd-wincodex');
        cxbox.appendChild(App.el('span', 'bd-wincodex-k', '讨伐名录'));
        if (cx.form) {
          cxbox.appendChild(App.el('p', 'bd-windesc', '形象：' + cx.form));
        }
        if (cx.parts && cx.parts.length) {
          cxbox.appendChild(App.el('p', 'bd-windesc', '破绽（可拆部件）：'
            + cx.parts.map(function (q) { return q.n + (q.a ? '（' + q.a + '）' : ''); }).join('　')
            + '　共 ' + cx.parts.length + ' 处'));
        }
        if (cx.play) {
          cxbox.appendChild(App.el('p', 'bd-windesc', '破解玩法：' + cx.play));
        }
        cxbox.appendChild(App.el('p', 'bd-windesc bd-wincodex-src',
          '出自《Boss（象形会意假借）.docx》'
          + (cx.group ? ' · ' + groupName(cx.group) : '')
          + '　·　在「汉字图鉴 → 讨伐名录」里可查'));
        info.appendChild(cxbox);
      } else if (wArt && wArt.swapped) {
        /* 这一尊没有名录条目——因为它根本不在那份 docx 字表里。
           形象是从名录里借的，就得如实说清是借的、为什么借，
           而不是让玩家以为独角犀就是虎（需求「二、1 / 二、2」）。 */
        info.appendChild(App.el('p', 'bd-winnote',
          '※ 形象是借的：本关的字不在《Boss（象形会意假借）.docx》字表内，'
          + '名录里没有它的专属形象，这里暂借「' + wArt.from + '」一尊顶上'
          + (wArt.tie ? '（' + wArt.tie + '）' : '') + '。'
          + (wArt.note ? wArt.note : '')));
      }
      card.appendChild(info);
      el.appendChild(card);
      if (wg && wg.composed) { tightenGlyphBox(sv); }

      var log = App.el('div', 'bd-logs');
      S.log.forEach(function (l) {
        var row = App.el('div', 'bd-log ' + l.kind);
        row.appendChild(App.el('b', null, l.title));
        row.appendChild(App.el('span', null, l.text));
        log.appendChild(row);
      });
      el.appendChild(log);

      var side = App.el('div', 'wy-side');
      if (!last) {
        var nx = App.el('button', 'btn primary', '下一关');
        nx.onclick = function () { enter(S.idx + 1); };
        side.appendChild(nx);
      } else {
        side.appendChild(App.el('span', 'chip', '全部 ' + L.length + ' 关已通关'));
      }
      var again = App.el('button', 'btn sm', '再打一次');
      again.onclick = function () { enter(S.idx); };
      side.appendChild(again);
      var tr = App.el('button', 'btn sm', '回到关卡');
      tr.onclick = function () { S.view = 'track'; S.boss = null; render(); };
      side.appendChild(tr);
      if (clearedCount() >= L.length) {
        var clr = App.el('button', 'btn sm ghost', '清空通关记录');
        clr.onclick = function () {
          if (!window.confirm('清空全部通关记录？关卡会重新锁回去。')) { return; }
          App.store.del(STORE_KEY);
          S.view = 'track'; S.boss = null;
          render();
        };
        side.appendChild(clr);
      }
      el.appendChild(side);
    }

    render();
  }

  function unmount() {
    S.view = 'track'; S.boss = null; S.tier = null; S.idx = 0;
    S.phase = 1; S.hp = 100; S.broken = []; S.cut = []; S.miss = 0;
    S.log = []; S.hint = false; S.fx = null; S.fxView = null;
  }

  var total = BOSS ? (BOSS.tiers || []).reduce(function (n, t) { return n + t.list.length; }, 0) : 0;

  App.modes.register({
    id: 'boss-raid',
    name: '构件讨伐',
    tagline: '线性关卡 · 横版对战',
    desc: '二十一道关卡连成一条线，一关一关推进。身体由构件拼成的，就拆它的构件——'
        + '拆掉「止」封走位、拆掉「口」封印技能、拆掉「水」「火」消属性；'
        + '而构件混同、拆不动的图画型古字（車 17 段、虎 17 段），'
        + '只能进入笔画终局，一段一段斩断它的纹路护甲。',
    icon: '伐',
    accent: 'var(--cinnabar)',
    tags: ['线性关卡', total + ' 关', '横版对战'],
    layout: 'wide',
    minPlayers: 1, maxPlayers: 1,
    /* 第三关已重做为 boss3d 的三阶段讨伐，旧的横版构件关卡从列表撤下。
       文件与路由保留，直连仍可用。 */
    status: 'hidden',
    data: { packs: [], assets: [] },
    mount: mount,
    unmount: unmount
  });

})(window.App = window.App || {});
