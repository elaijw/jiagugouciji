/* ============================================================
   甲骨奇谭 · 第二关：浮空骨片与字形世界
   ------------------------------------------------------------
   形态：一片悬在虚空里的骨片阵（远山 / 雾 / 浮骨 / 暖光），
         点一片骨 → 镜头推进 → 进入它刻着的那个世界。
   三处可点：
     木 → 草木川泽（自然场景：溪 / 山 / 谷，三块字碑）
     鼎 → 青铜礼器（器物场景：可拖拽旋转、滚轮放大的青铜鼎）
     日 → 天象与王邑（接到已有的 3D 王邑世界，不重做）
   中央「龜」是主骨，点它看这关是干什么的。

   数据一律取现成的，不新造：
     字形笔画  App.glyphs.parts（经 App.worldGlyph 转 3D）
     释义      App.levels.map.zones[].objects/extra 的 meaning / form
     龟宝      App.guibao.build
   ============================================================ */
(function (App) {
  'use strict';
  if (!App || !App.modes) { return; }

  /* ================= CSS（一次性注入） ================= */
  var CSS = [
    /* 全屏接管：用 fixed 而不是 absolute。
       父级 .scene 里全是绝对定位的孩子，高度会塌成 0 —— absolute inset:0 只拿到 0 高，
       结果三维画面只剩顶上一指宽，页面主体露出来的还是首页的底色与页脚（截图里踩过）。 */
    '.bsp-root{position:fixed;inset:0;z-index:400;overflow:hidden;background:#0b0a10;',
    'body.bsp-lock{overflow:hidden}',
    'font-family:var(--font-song,"Songti SC",serif);color:#efe4cd;user-select:none}',
    '.bsp-stage{position:absolute;inset:0}',
    '.bsp-stage canvas{display:block;width:100%;height:100%}',

    '.bsp-top{position:absolute;left:22px;top:18px;z-index:6;display:flex;gap:10px;align-items:center;',
    'padding:2px 4px;pointer-events:none}',
    '.bsp-top>*{pointer-events:auto}',
    /* 顶栏压一层渐变暗底：骨片空间是暗场、草木川泽是亮天，
       同一行米色小字在亮天上几乎看不见（截图里就是一道淡淡的灰）。 */
    '.bsp-top::before{content:"";position:absolute;left:-18px;top:-12px;right:-22px;bottom:-12px;',
    'z-index:-1;pointer-events:none;border-radius:6px;',
    'background:linear-gradient(90deg,rgba(8,7,12,.66),rgba(8,7,12,.34) 58%,rgba(8,7,12,0))}',
    '.bsp-title{font-size:13px;letter-spacing:.32em;color:#e3d2ad;',
    'text-shadow:0 1px 3px rgba(0,0,0,.9),0 0 14px rgba(0,0,0,.7)}',
    '.bsp-crumb{font-size:12px;color:#b3a184;letter-spacing:.1em;',
    'text-shadow:0 1px 3px rgba(0,0,0,.9)}',

    '.bsp-btn{border:1px solid rgba(214,186,126,.34);background:rgba(24,20,17,.62);color:#e6d6b4;',
    'font:inherit;font-size:13px;padding:7px 14px;border-radius:2px;cursor:pointer;',
    'letter-spacing:.08em;transition:border-color .2s,background .2s,color .2s;backdrop-filter:blur(6px)}',
    '.bsp-btn:hover{border-color:rgba(232,206,146,.8);background:rgba(46,36,26,.8);color:#fff3d8}',

    /* 骨片铭牌：浮在骨片正下方的 DOM 标签，随骨片一起轻晃 */
    '.bsp-tag{position:absolute;z-index:5;transform:translate(-50%,0);pointer-events:none;',
    'text-align:center;transition:opacity .25s}',
    '.bsp-tag .t1{font-size:15px;letter-spacing:.22em;color:#f6e6c2;',
    'text-shadow:0 1px 3px #000,0 0 16px rgba(0,0,0,.95),0 0 30px rgba(0,0,0,.8)}',
    '.bsp-tag .t2{font-size:11px;letter-spacing:.14em;color:#bda57c;margin-top:3px;',
    'text-shadow:0 1px 3px #000,0 0 12px rgba(0,0,0,.9)}',
    '.bsp-tag::before{content:"";position:absolute;left:50%;top:-12px;transform:translateX(-50%);',
    'width:132%;height:calc(100% + 24px);border-radius:10px;z-index:-1;',
    /* 中间那片骨的铭牌会落在被主光照亮的石台上：只靠一层径向渐变，
       浅底上的金字仍然糊。改成"实心暗底 + 边缘羽化"两层，
       无论落在虚空还是台面上都读得出来。 */
    'background:radial-gradient(closest-side,rgba(8,6,10,.86),rgba(8,6,10,.62) 62%,rgba(8,6,10,0))}',
    '.bsp-tag.hot .t1{color:#ffd89a}',

    /* 底部提示（龟宝说话） */
    '.bsp-hint{position:absolute;left:50%;bottom:98px;transform:translateX(-50%);z-index:6;',
    'max-width:min(620px,84vw);padding:10px 20px;border-left:2px solid rgba(232,196,120,.6);',
    'background:linear-gradient(90deg,rgba(20,17,14,.82),rgba(20,17,14,.42));',
    'font-size:13.5px;line-height:1.75;color:#e2d3b6;letter-spacing:.05em;',
    'transition:opacity .3s,transform .3s}',
    '.bsp-hint b{color:#ffcf8a;font-weight:400}',

    /* 知识面板（右侧） */
    '.bsp-panel{position:absolute;right:0;top:0;bottom:0;width:min(400px,88vw);z-index:8;',
    'background:linear-gradient(180deg,rgba(18,15,12,.95),rgba(22,18,14,.92));',
    'border-left:1px solid rgba(214,186,126,.22);backdrop-filter:blur(10px);',
    'padding:30px 28px 26px;display:flex;flex-direction:column;gap:16px;overflow-y:auto;',
    'transform:translateX(100%);transition:transform .42s cubic-bezier(.22,.8,.24,1)}',
    '.bsp-panel.on{transform:translateX(0)}',
    '.bsp-panel .ph{font-size:11px;letter-spacing:.3em;color:#9a845f}',
    '.bsp-panel .pch{font-size:46px;line-height:1;color:#f4e2be;letter-spacing:.06em}',
    '.bsp-panel .pn{font-size:17px;color:#d8c49c;letter-spacing:.16em}',
    '.bsp-panel .pb{font-size:13.5px;line-height:1.95;color:#c9b89a;letter-spacing:.03em}',
    '.bsp-panel .pb em{font-style:normal;color:#ffce8c}',
    '.bsp-panel .psep{height:1px;background:linear-gradient(90deg,rgba(214,186,126,.34),transparent)}',
    '.bsp-panel .pact{display:flex;gap:10px;margin-top:auto;padding-top:14px}',
    '.bsp-panel .pact .bsp-btn{flex:1;text-align:center}',

    /* 场景内知识点热点条 */
    '.bsp-dots{position:absolute;right:24px;top:50%;transform:translateY(-50%);z-index:6;',
    'display:flex;flex-direction:column;gap:10px}',
    '.bsp-dot{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;',
    'font-size:16px;color:#f0dcb2;border:1px solid rgba(214,186,126,.4);',
    'background:rgba(20,17,14,.7);cursor:pointer;transition:.2s}',
    '.bsp-dot:hover,.bsp-dot.on{border-color:#ffce8c;color:#fff3d8;background:rgba(70,52,32,.85)}',

    /* 器物场景的旋转提示 */
    '.bsp-rot{position:absolute;left:50%;bottom:84px;transform:translateX(-50%);z-index:6;',
    'font-size:12px;letter-spacing:.18em;color:#a8946e;opacity:0;transition:opacity .4s;pointer-events:none}',
    '.bsp-rot.on{opacity:1}',

    /* 黑幕转场 */
    '.bsp-fade{position:absolute;inset:0;z-index:20;background:#07060a;opacity:0;',
    'pointer-events:none;transition:opacity .34s ease}',
    '.bsp-fade.on{opacity:1;pointer-events:auto}',
    /* 加载 */
    '.bsp-load{position:absolute;inset:0;z-index:22;display:grid;place-items:center;background:#0b0a10;',
    'font-size:13px;letter-spacing:.3em;color:#8f7f66;transition:opacity .5s}',
    '.bsp-load.off{opacity:0;pointer-events:none}',
    '.bsp-load .ring{width:34px;height:34px;border:1px solid rgba(214,186,126,.22);',
    'border-top-color:#d8b878;border-radius:50%;animation:bspspin 1s linear infinite;margin:0 auto 16px}',
    '@keyframes bspspin{to{transform:rotate(360deg)}}',
    '.bsp-err{padding:24px;font-size:13px;line-height:2;color:#e0a37a;text-align:center}'
  ].join('');

  function injectCSS() {
    if (document.getElementById('bsp-css')) { return; }
    var s = document.createElement('style');
    s.id = 'bsp-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ================= 骨片清单 =================
     每片骨刻一个字，那个字就是它的入口。
     hot:true 表示可点；false 的只是气氛（残骨）。 */
  var PLATES = [
    { ch: '木', to: 'nature', name: '草木川泽', sub: '自然场景', hot: true },
    { ch: '鼎', to: 'bronze', name: '青铜礼器', sub: '器物场景', hot: true },
    { ch: '日', to: 'sky',    name: '观星台',     sub: '天象场景',   hot: true }
  ];

  /* ================= 状态 ================= */
  var S = {
    st: null, host: null, root: null,
    scene: null,          /* 当前场景控制器 */
    mode: 'space',
    tickFns: [],
    alive: true,
    focus: null,          /* 当前推进的骨片 */
    panelOpen: false
  };

  /* ================= 小工具 ================= */
  function el(tag, cls, text) { return App.el(tag, cls, text); }

  /* 从既有数据取释义；取不到就返回 null，绝不编造字形说明 */
  function meaningOf(ch) {
    var L = App.levels;
    var zs = (L && L.map && L.map.zones) || [];
    for (var i = 0; i < zs.length; i++) {
      var arr = (zs[i].objects || []).concat(zs[i].extra || []);
      for (var j = 0; j < arr.length; j++) {
        if (arr[j] && arr[j].char === ch) {
          return { meaning: arr[j].meaning || '', form: arr[j].form || '', zone: zs[i].name || '' };
        }
      }
    }
    return null;
  }

  function lerp(a, b, t) { return a + (b - a) * t; }

  /* 骨片材质：暗场里要自己发一点光，否则只剩剪影 */
  function boneMat(T, seed, glow) {
    return new T.MeshStandardMaterial({
      map: App.stage3d.boneTex(seed),
      color: 0xdccfb4,
      roughness: 0.88,
      metalness: 0.02,
      /* 自发光只用来"托底"，不用来打亮：0.34 时骨片是纯白一块，
         字刻在上面根本没有明暗，看上去像贴了张纸。压到 0.14 之后，
         主光才有地方落，甲片的凹陷与字的刻痕这才读得出来。 */
      emissive: new T.Color(0x5a3c1e),
      emissiveIntensity: glow == null ? 0.14 : glow
    });
  }

  /* 一片骨：骨版 + 两面刻字。
     两面都要刻 —— 骨片是自转的，只刻一面的话，转到背面就是一块光板。 */
  function makePlate(st, ch, size, opt) {
    var T = st.T, o = opt || {};
    var g = new T.Group();
    var depth = size * 0.13;
    var geo = App.stage3d.bonePlateGeo(T, size, size * 1.14, depth, o.seed || 5);
    var body = new T.Mesh(geo, boneMat(T, o.seed || 5, o.glow));
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);

    var fz = depth * 0.5 + depth * 0.42 + 0.004;
    var gm = App.worldGlyph && App.worldGlyph.glyphMesh
      ? App.worldGlyph.glyphMesh(ch, size * 0.56, { color: 0x2e2416, emissive: 0xffb264, glow: o.glyphGlow == null ? 0.20 : o.glyphGlow })
      : null;
    if (gm) {
      gm.position.z = fz;
      g.add(gm);
      var gm2 = gm.clone();
      gm2.position.z = -fz;
      gm2.rotation.y = Math.PI;
      g.add(gm2);
    }
    g.userData.pickable = true;
    g.userData.plate = o.plate || null;
    g.userData.baseY = 0;
    return g;
  }

  /* 天穹：一张竖向渐变贴到球内壁。深墨蓝到暖褐，压住下方的虚空。 */
  /* 天穹。top/mid/bot 三色的老写法保留；
     也可以直接给 [[位置, 颜色], ...] 自己排渐变 ——
     机位平视时画面只覆盖 uv 0.42~0.52 这一窄条，
     三色渐变的中段就整条都是灰，黄昏怎么调都出不来。
     自己排点，才能把"深蓝 → 落日在天边"压进这一条里。 */
  function skyDome(st, top, mid, bot) {
    var T = st.T;
    var cv = App.stage3d.canvas(8, 256), c = cv.getContext('2d');
    var g = c.createLinearGradient(0, 0, 0, 256);
    var stops = (top instanceof Array) ? top
      : [[0, top], [0.5, mid], [1, bot]];
    for (var si = 0; si < stops.length; si++) { g.addColorStop(stops[si][0], stops[si][1]); }
    c.fillStyle = g; c.fillRect(0, 0, 8, 256);
    var m = new T.Mesh(
      new T.SphereGeometry(230, 28, 18),
      new T.MeshBasicMaterial({ map: App.stage3d.tex(cv), side: T.BackSide, fog: false, depthWrite: false })
    );
    st.scene.add(m);
    return m;
  }

  /* 远山：一圈低面锥体。雾会把它们压成剪影，所以只给深色、不给细节。 */
  function farHills(st, rIn, rOut, n, hMin, hMax, color, seed) {
    var T = st.T, R = App.stage3d.rnd(seed || 11);
    var g = new T.Group();
    for (var i = 0; i < n; i++) {
      var a = i / n * Math.PI * 2 + R() * 0.22;
      var rr = rIn + R() * (rOut - rIn);
      var h = hMin + R() * (hMax - hMin);
      var rad = h * (0.5 + R() * 0.45);
      var m = new T.Mesh(
        new T.ConeGeometry(rad, h, 7, 1),
        new T.MeshStandardMaterial({ color: color, roughness: 1, metalness: 0, flatShading: true })
      );
      m.position.set(Math.cos(a) * rr, -6.5 + h * 0.42, Math.sin(a) * rr);
      /* 每座山侧倾一点点：一排完全竖直的锥体，剪影就是"一排派对帽" */
      m.rotation.set((R() - 0.5) * 0.10, R() * 6.28, (R() - 0.5) * 0.10);
      g.add(m);
    }
    st.scene.add(g);
    return g;
  }

  /* 浮尘：点精灵。让"空"看起来是"有空气"，而不是一块黑背景。 */
  function dust(st, n, rMin, rMax, color) {
    var T = st.T, R = App.stage3d.rnd(23);
    var pos = new Float32Array(n * 3);
    for (var i = 0; i < n; i++) {
      var a = R() * Math.PI * 2, b = (R() - 0.5) * Math.PI;
      var r = rMin + R() * (rMax - rMin);
      pos[i * 3] = Math.cos(a) * Math.cos(b) * r;
      pos[i * 3 + 1] = Math.sin(b) * r * 0.55 + 1.5;
      pos[i * 3 + 2] = Math.sin(a) * Math.cos(b) * r;
    }
    var geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    var mat = new T.PointsMaterial({
      color: color || 0xd8c49a, size: 0.055, transparent: true, opacity: 0.55,
      sizeAttenuation: true, depthWrite: false, blending: T.AdditiveBlending
    });
    var p = new T.Points(geo, mat);
    p.frustumCulled = false;
    st.scene.add(p);
    return p;
  }

  /* ================= 场景一：浮空骨片空间 ================= */
  function buildSpace(st) {
    var T = st.T;
    st.renderer.toneMappingExposure = 1.05;
    if (st.lights) {
      st.lights.hemi.intensity = 0.30;
      st.lights.sun.intensity = 0.45;
      st.lights.fill.intensity = 0.20;
      /* 草木川泽关掉了太阳投影，回骨片空间要开回来（不然骨片没有落地感） */
      st.lights.sun.castShadow = true;
    }
    st.scene.background = null;
    st.scene.fog = new T.FogExp2(0x15111c, 0.0165);
    skyDome(st, '#0a0912', '#1a1524', '#241a1c');
    /* 山的高度按"相机能看多远"定：
       机位在 11 米、fov 46，视野竖直约 ±4.7 米。原来 hMax 34 的山
       在半径 42 处是一座 34 米高的尖塔，画面上沿全被它填满 —— 成了"黑色三角森林"。
       压到 6~15 米、半径推到 58~110，它才退回成一条该有的天际线。 */
    farHills(st, 58, 110, 24, 6, 15, 0x151220, 7);
    farHills(st, 34, 62, 14, 3, 7, 0x1b1626, 13);

    var grp = new T.Group();
    st.root.add(grp);

    /* 中央石台：龟宝站的地方，也是"你在这里"的锚点。
       原来是同样材质的骨台，一块 7.4 米的白色平台在暗场里等于一块反光板 ——
       画面下半全被它占满，骨片反而成了配角。换成深色石台、缩小一号，
       它退成"地"，骨片才浮得起来。 */
    var deckGeo = App.stage3d.bonePlateGeo(T, 5.6, 4.0, 0.46, 31);
    var deck = new T.Mesh(deckGeo, new T.MeshStandardMaterial({
      color: 0x241f19, roughness: 0.97, metalness: 0.0,
      emissive: new T.Color(0x0e0b08), emissiveIntensity: 0.10
    }));
    deck.rotation.x = -Math.PI / 2;
    deck.position.set(0, -1.42, 0.4);
    deck.receiveShadow = true;
    grp.add(deck);

    /* 中央主骨：刻「龜」，稍大，缓慢自转 */
    var main = makePlate(st, '龜', 2.3, { seed: 41, glow: 0.30, plate: { ch: '龜', main: true } });
    main.position.set(0, 3.10, -3.6);
    grp.add(main);

    /* 三片功能骨：绕成半圈，面朝镜头微斜 */
    /* 三片的位置是画出来的，不是算出来的：
       原来三片挤在 x=±3.4、y 只差 0.6，中间那片正好被主骨压住 ——
       截图里看到的是"主骨 + 两张标签"，中间那块骨根本没露脸。
       现在两翼横拉到 ±4.4 并略往前（z 更大 = 更近），中间那片压下去贴近石台，
       三个深度 + 三个高度，一眼能数清是三片。 */
    /* 中间那片原来压在石台前沿上：骨片下缘和铭牌一起被台面吃掉，
       铭牌「青铜礼器」正好落在深色台面上、读不出来。
       抬到 y=0.78 又撞上主骨「龜」的下缘（屏幕上叠成一摞），
       最后定在 y=0.30 / z=0.95：比两翼更近、更矮，既让开主骨，也离开台面前沿。 */
    var slots = [
      { x: -4.5, y: 0.62, z: 0.35, ry: 0.30 },
      { x: 0.0, y: 0.80, z: 1.30, ry: 0.0 },
      { x: 4.5, y: 0.62, z: 0.35, ry: -0.30 }
    ];
    var plates = [];
    for (var i = 0; i < PLATES.length; i++) {
      var p = PLATES[i];
      var sl = slots[i];
      var m = makePlate(st, p.ch, 1.56, { seed: 60 + i * 7, glow: 0.24, plate: p });
      m.position.set(sl.x, sl.y, sl.z);
      m.rotation.y = sl.ry;
      grp.add(m);
      plates.push(m);
    }

    /* 两片残骨：气氛用的，不刻字（刻了就要给去处，给不了就是假入口） */
    var frag = [];
    for (var k = 0; k < 2; k++) {
      var g2 = new T.Group();
      var fgeo = App.stage3d.bonePlateGeo(T, 1.1 + k * 0.3, 0.8 + k * 0.2, 0.1, 90 + k);
      var fm = new T.Mesh(fgeo, boneMat(T, 90 + k, 0.1));
      g2.add(fm);
      g2.position.set(k ? 6.2 : -6.4, 2.4 + k * 0.9, -3.2 - k * 2);
      g2.rotation.set(k ? 0.4 : -0.3, k ? 0.6 : -0.5, 0.2);
      grp.add(g2);
      frag.push(g2);
    }

    /* 主光：一盏暖色的"上方光"，像骨片被某处火光照着；
       再给主骨一盏专属点光，把它从背景里拉出来。 */
    /* 强度 26 时，5 米外的石台被照到接近满亮 —— 深色材质等于白改。
       降到 12 并把灯拉近到骨片群中心：骨片仍然受光，石台留得住暗。 */
    var key = new T.PointLight(0xffb877, 12, 22, 2);
    key.position.set(-2.6, 4.4, 3.6);
    st.scene.add(key);
    var rim = new T.PointLight(0x8fa8d8, 9, 22, 2);
    rim.position.set(3.6, 1.4, -6);
    st.scene.add(rim);
    var mainLight = new T.PointLight(0xffcf96, 7, 10, 2);
    mainLight.position.set(0, 2.2, 1.4);
    st.scene.add(mainLight);

    dust(st, 420, 8, 34, 0xd8c49a);

    /* 龟宝：站在骨台上，比空间尺度放大一点才看得见 */
    var gb = App.stage3d.makeGuibao(T, { scale: 1.7 });
    if (gb) {
      gb.root.position.set(1.86, -1.20, 1.55);
      gb.root.rotation.y = 0.0;
      grp.add(gb.root);
    }

    st.camera.position.set(0, 2.35, 11.2);
    st.camera.lookAt(new T.Vector3(0, 1.15, 0));

    return {
      name: 'space',
      plates: plates, main: main, frag: frag, guibao: gb,
      update: function (dt, t) {
        /* 浮动 + 自转：每片给不同相位与频率，避免"整排一起呼吸"的机械感 */
        var all = [main].concat(plates).concat(frag);
        for (var i = 0; i < all.length; i++) {
          var o = all[i];
          var ph = i * 1.37;
          if (o.userData.by0 == null) { o.userData.by0 = o.position.y; }
          o.position.y = o.userData.by0 + Math.sin(t * 0.55 + ph) * 0.12;
          if (o === main) {
            o.rotation.y = Math.sin(t * 0.30) * 0.22;
          } else {
            o.rotation.y += dt * 0.055 * (i % 2 ? 1 : -1);
          }
        }
        if (gb && gb.update) { gb.update(dt, { speed: 0, run: false, focus: false }); }
        if (mainLight) { mainLight.intensity = 5.4 + Math.sin(t * 1.7) * 0.9; }
      },
      dispose: function () {}
    };
  }

  /* ================= 场景二：草木川泽（自然） ================= */
  function terrainY(x, z) {
    /* 与王邑共用同一套"低频起伏 + 细噪声"的思路，但幅度小得多：
       这里是一处河谷，不是聚落台地，不该有大落差。 */
    var v = Math.sin(x * 0.09) * Math.cos(z * 0.11) * 1.35
      + Math.sin(x * 0.23 + z * 0.17) * 0.42
      + Math.sin(x * 0.51 - z * 0.44) * 0.13;
    /* 溪谷：沿 x 轴一条低洼带 */
    var d = Math.abs(z - 1.2);
    v -= Math.max(0, 1.05 - d * 0.42);
    return v;
  }

  function grassTex(seed) {
    var S2 = 256, cv = App.stage3d.canvas(S2, S2), c = cv.getContext('2d');
    var R = App.stage3d.rnd(seed || 3);
    c.fillStyle = '#5d6a3c'; c.fillRect(0, 0, S2, S2);
    for (var i = 0; i < 2400; i++) {
      var x = R() * S2, y = R() * S2;
      var h = 2 + R() * 7;
      var g = 96 + R() * 62 | 0;
      c.strokeStyle = 'rgba(' + (58 + R() * 40 | 0) + ',' + g + ',' + (44 + R() * 30 | 0) + ',' + (0.25 + R() * 0.4).toFixed(2) + ')';
      c.lineWidth = 1 + R() * 0.8;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + (R() - 0.5) * 3, y - h); c.stroke();
    }
    for (var k = 0; k < 180; k++) {
      c.fillStyle = 'rgba(120,104,64,' + (0.05 + R() * 0.12).toFixed(2) + ')';
      c.beginPath(); c.arc(R() * S2, R() * S2, 3 + R() * 12, 0, 6.2832); c.fill();
    }
    return App.stage3d.tex(cv, 7);
  }

  function buildNature(st) {
    var T = st.T;
    st.renderer.toneMappingExposure = 1.02;
    if (st.lights) {
      st.lights.hemi.intensity = 0.46;
      st.lights.sun.intensity = 0.95;
      st.lights.fill.intensity = 0.22;
    }
    /* 雾色与天穹定这一场的调子：原来是灰白（#9aa2a0），整片草地被洗成磨砂塑料。
       换成黄昏的暖灰蓝，地面才压得住暗部、受光面才有金色的边。 */
    st.scene.fog = new T.FogExp2(0x8a7a66, 0.0135);
    /* 这一场不要投影。
       阴影相机默认只有 ±14 米，林线却在 13~40 米：圈内那几棵树投下又长又硬的影子，
       圈外一棵都没有 —— 草地上一道长黑条，看着像地裂了（截图左下角那块黑斑就是它）。
       放大了阴影相机也只是把黑条铺得更满。低多边形画风里本来就不靠投影立体积，
       关掉之后草地干净、树也更像"插画里的树"。 */
    if (st.lights.sun) { st.lights.sun.castShadow = false; }
    skyDome(st, [
      [0.00, '#0b0f1e'], [0.30, '#1e2338'], [0.40, '#38354f'],
      [0.465, '#7c6270'], [0.500, '#c08a68'], [0.520, '#d99f6c'], [1.00, '#a8794f']
    ]);
    /* 山压到 6~14 米、推到 60~100 米：机位在 13.5 米、fov 46，视野竖直约 ±5.7 米，
       16~36 米的山在这个距离上只能看到山腰，上半屏全是三块巨大的浅褐三角。 */
    farHills(st, 60, 100, 22, 6, 14, 0x46503f, 21);

    var grp = new T.Group();
    st.root.add(grp);

    /* ---- 地形 ---- */
    var SIZE = 96, SEG = 72;
    var geo = new T.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    var pos = geo.attributes.position;
    var col = [];
    for (var i = 0; i < pos.count; i++) {
      var x = pos.getX(i), z = pos.getZ(i);
      var y = terrainY(x, z);
      pos.setY(i, y);
      var t = (y + 2) / 4.2;
      col.push(0.62 + t * 0.30, 0.72 + t * 0.22, 0.52 + t * 0.18);
    }
    geo.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();
    var ground = new T.Mesh(geo, new T.MeshStandardMaterial({
      /* color 与 map 是相乘的：草贴图本身是绿的，顶点色又偏暖黄，
         两下一乘就成了"淡卡其"。这里补一点青绿当校正，草地才读得出是草地。 */
      map: grassTex(9), vertexColors: true, color: 0x9fb488, roughness: 1, metalness: 0
    }));
    ground.receiveShadow = true;
    grp.add(ground);

    /* ---- 溪流：沿 z≈1.2 一条带，比地面低一点，半透明偏青 ---- */
    (function stream() {
      var pts = [];
      for (var x = -46; x <= 46; x += 2) {
        /* 水面按"河谷底 + 0.55"取高：原来 +0.10，水贴在沟底又被两岸的坡挡住，
           平视机位几乎看不到一条水线。抬起来之后，水才是"躺在谷里的一层"。 */
        pts.push([x, terrainY(x, 1.2) + 0.55, 1.2 + Math.sin(x * 0.11) * 1.6]);
      }
      function strip(half, dy) {
        var vs = [], ix = [];
        for (var k2 = 0; k2 < pts.length; k2++) {
          var q2 = pts[k2];
          vs.push(q2[0], q2[1] + dy, q2[2] - half);
          vs.push(q2[0], q2[1] + dy, q2[2] + half);
        }
        for (var j2 = 0; j2 < pts.length - 1; j2++) {
          var a2 = j2 * 2, b2 = a2 + 1, c3 = a2 + 2, d2 = a2 + 3;
          ix.push(a2, b2, c3, b2, d2, c3);
        }
        var gg = new T.BufferGeometry();
        gg.setAttribute('position', new T.Float32BufferAttribute(vs, 3));
        gg.setIndex(ix);
        gg.computeVertexNormals();
        return gg;
      }
      /* 河床：比水面宽一圈、低一点的暗褐带。
         没有它，水面就是一条边缘硬切的色带，像铺了块蓝布。 */
      var bank = new T.Mesh(strip(3.6, -0.06), new T.MeshStandardMaterial({
        color: 0x5c4a34, roughness: 1, metalness: 0
      }));
      bank.renderOrder = 1;
      grp.add(bank);
      var g3 = strip(2.4, 0);
      var m3 = new T.Mesh(g3, new T.MeshStandardMaterial({
        color: 0x3f7383, roughness: 0.10, metalness: 0.45,
        emissive: new T.Color(0x16323c), emissiveIntensity: 0.35,
        transparent: true, opacity: 0.94
      }));
      m3.renderOrder = 2;
      grp.add(m3);
    })();

    /* ---- 树：一主一辅两个锥，围在林线外，中间留空 ---- */
    var R = App.stage3d.rnd(55);
    var trunkG = new T.CylinderGeometry(0.13, 0.22, 2.2, 6);
    var crownG = new T.ConeGeometry(1.28, 2.7, 7, 1);
    var crownG2 = new T.ConeGeometry(0.92, 1.9, 6, 1);
    var barkM = new T.MeshStandardMaterial({ color: 0x4a3826, roughness: 1 });
    var leafM = new T.MeshStandardMaterial({ color: 0x3f5a2e, roughness: 1, flatShading: true });
    var leafM2 = new T.MeshStandardMaterial({ color: 0x304a26, roughness: 1, flatShading: true });
    var bladeM = new T.MeshStandardMaterial({ color: 0x3c5528, roughness: 1, flatShading: true });
    for (var n = 0; n < 44; n++) {
      var a2 = R() * Math.PI * 2, rr = 13 + R() * 27;
      var tx = Math.cos(a2) * rr, tz = Math.sin(a2) * rr;
      if (Math.abs(tz - 1.2) < 4.2 && Math.abs(tx) < 40) { continue; }   /* 别种进溪里 */
      var sc = 0.8 + R() * 0.85;
      var gy = terrainY(tx, tz);
      var tr = new T.Mesh(trunkG, barkM);
      tr.position.set(tx, gy + 1.1 * sc, tz); tr.scale.setScalar(sc); tr.castShadow = true;
      grp.add(tr);
      var cr = new T.Mesh(crownG, R() > 0.5 ? leafM : leafM2);
      cr.position.set(tx, gy + 2.2 * sc, tz); cr.scale.setScalar(sc); cr.castShadow = true;
      grp.add(cr);
      var cr2 = new T.Mesh(crownG2, R() > 0.5 ? leafM2 : leafM);
      cr2.position.set(tx, gy + 3.5 * sc, tz); cr2.scale.setScalar(sc); cr2.castShadow = true;
      grp.add(cr2);
    }

    /* ---- 草丛：三片细叶一簇，撒在近景 ---- */
    var bladeG = new T.BoxGeometry(0.075, 0.40, 0.013);
    for (var b = 0; b < 380; b++) {
      var bx = (R() - 0.5) * 46, bz = (R() - 0.5) * 46;
      if (Math.abs(bz - 1.2) < 2.6) { continue; }
      var by = terrainY(bx, bz);
      for (var q = 0; q < 3; q++) {
        var bl = new T.Mesh(bladeG, bladeM);
        bl.position.set(bx + (R() - 0.5) * 0.3, by + 0.2, bz + (R() - 0.5) * 0.3);
        bl.rotation.set((R() - 0.5) * 0.4, R() * 6.28, (R() - 0.5) * 0.4);
        bl.scale.set(1, 0.7 + R() * 0.7, 1);
        grp.add(bl);
      }
    }

    /* ---- 三块字碑：水 / 山 / 川，插在对应的地貌里 ---- */
    var stones = [];
    var spots = [
      { ch: '水', x: 2.6, z: 5.0 },
      { ch: '山', x: -6.5, z: -5.2 },
      { ch: '川', x: 7.4, z: -3.0 }
    ];
    for (var s2 = 0; s2 < spots.length; s2++) {
      var sp2 = spots[s2];
      var gy2 = terrainY(sp2.x, sp2.z);
      var g4 = new T.Group();
      g4.position.set(sp2.x, gy2, sp2.z);
      /* 碑座：一块斜插的石板 */
      var base = new T.Mesh(
        new T.BoxGeometry(0.9, 0.22, 0.62),
        new T.MeshStandardMaterial({ color: 0x6d6255, roughness: 1 })
      );
      base.position.y = 0.1;
      base.receiveShadow = true;
      g4.add(base);
      var slab = new T.Mesh(
        new T.BoxGeometry(0.78, 1.5, 0.16),
        new T.MeshStandardMaterial({ color: 0xd8c9a8, roughness: 0.92 })
      );
      slab.position.y = 0.95;
      slab.castShadow = true;
      g4.add(slab);
      var gm3 = App.worldGlyph.glyphMesh(sp2.ch, 0.62, { color: 0x3a2c18, emissive: 0xffb264, glow: 0.10 });
      if (gm3) { gm3.position.set(0, 0.98, 0.10); g4.add(gm3); }
      g4.userData.gm = gm3;
      /* 碑顶小帽 */
      var cap = new T.Mesh(
        new T.BoxGeometry(0.92, 0.12, 0.26),
        new T.MeshStandardMaterial({ color: 0x8a7a5e, roughness: 1 })
      );
      cap.position.y = 1.74;
      g4.add(cap);
      g4.userData.pickable = true;
      g4.userData.stone = sp2;
      grp.add(g4);
      stones.push(g4);
    }

    /* ---- 龟宝：站在溪边空地上 ---- */
    var gb = App.stage3d.makeGuibao(T, { scale: 1.0 });
    if (gb) {
      gb.root.position.set(0.2, terrainY(0.2, 6.2), 6.2);
      gb.root.rotation.y = 0.05;
      grp.add(gb.root);
    }

    st.camera.position.set(0.4, 3.2, 13.5);
    st.camera.lookAt(new T.Vector3(0, 1.1, 0));

    return {
      name: 'nature',
      stones: stones, guibao: gb,
      update: function (dt, t) {
        if (gb && gb.update) { gb.update(dt, { speed: 0, run: false, focus: false }); }
        /* 字碑极缓慢地亮一下，暗示"这是可以点的" */
        for (var i = 0; i < stones.length; i++) {
          var k = 0.5 + Math.sin(t * 1.1 + i * 2.1) * 0.5;
          var gmS = stones[i].userData.gm;
          if (gmS && gmS.material) { gmS.material.emissiveIntensity = 0.06 + k * 0.16; }
        }
      },
      dispose: function () {}
    };
  }

  /* ================= 场景四：观星台（天象） ================= */
  /* 「日」这一片骨通往天象。前面两场一场在黄昏草地、一场在暗窖，
     这一场要给出第三种光：夜、满月、星盘。
     主角是一台能绕着看的日晷 —— 古人靠影子量太阳走到哪儿，
     而「日」这个字本身，就是画一个圆、中间点一点。 */
  function buildSky(st) {
    var T = st.T;
    if (st.lights) {
      st.lights.hemi.intensity = 0.18;
      st.lights.sun.intensity = 0.12;
      st.lights.fill.intensity = 0.05;
      st.lights.sun.castShadow = false;
    }
    st.scene.fog = new T.FogExp2(0x0a1120, 0.0125);
    skyDome(st, [
      [0.00, '#04060d'], [0.30, '#081228'], [0.42, '#0f2240'],
      [0.470, '#1b3352'], [0.500, '#2a4460'], [0.520, '#16283c'], [1.00, '#060a12']
    ]);
    st.renderer.toneMappingExposure = 1.05;

    var grp = new T.Group();
    st.root.add(grp);

    /* 观星石台 */
    var plat = new T.Mesh(
      new T.CylinderGeometry(5.4, 5.9, 0.42, 44),
      new T.MeshStandardMaterial({
        color: 0x3c4050, roughness: 0.95, metalness: 0.03,
        /* 纯漫反射的深灰在夜空里等于一块黑洞：台面几乎全黑，
           下面的字碑和龟宝像浮在半空。给一点自发光把"这是石头"说出来。 */
        emissive: new T.Color(0x141926), emissiveIntensity: 0.55
      })
    );
    plat.position.y = -0.21;
    grp.add(plat);

    /* 台面三道同心刻圈，像星盘刻度 */
    for (var ci = 0; ci < 3; ci++) {
      var rr2 = 1.55 + ci * 1.20;
      var ring = new T.Mesh(
        new T.RingGeometry(rr2, rr2 + 0.055, 72),
        new T.MeshBasicMaterial({ color: 0x51708c, transparent: true, opacity: 0.38, side: T.DoubleSide })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.012;
      grp.add(ring);
    }

    /* 星点：只铺上半球，零星才不像雪 */
    var N = 1400, pos = new Float32Array(N * 3);
    var Rr = App.stage3d.rnd(913);
    for (var i = 0; i < N; i++) {
      var th = Rr() * Math.PI * 2;
      var ph = Math.acos(1 - Rr() * 0.90);
      var rad = 44 + Rr() * 10;
      pos[i * 3] = Math.sin(ph) * Math.cos(th) * rad;
      pos[i * 3 + 1] = Math.cos(ph) * rad * 0.85 + 4;
      pos[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * rad;
    }
    var starGeo = new T.BufferGeometry();
    starGeo.setAttribute('position', new T.BufferAttribute(pos, 3));
    var stars = new T.Points(starGeo, new T.PointsMaterial({
      color: 0xd8e6ff, size: 0.52, sizeAttenuation: true,
      transparent: true, opacity: 0.92, depthWrite: false
    }));
    st.scene.add(stars);

    /* 满月 + 一层薄晕（Basic 材质，不吃光照，月色才稳） */
    var moon = new T.Mesh(new T.SphereGeometry(1.10, 26, 18),
      new T.MeshBasicMaterial({ color: 0xf3f0dd }));
    moon.position.set(-9.5, 9.6, -25);
    st.scene.add(moon);
    var halo = new T.Mesh(new T.SphereGeometry(1.95, 26, 18),
      new T.MeshBasicMaterial({ color: 0x33557f, transparent: true, opacity: 0.20, depthWrite: false }));
    halo.position.copy(moon.position);
    st.scene.add(halo);

    /* ---- 日晷：这一场的可交互对象 ---- */
    var dial = new T.Group();
    var base = new T.Mesh(new T.CylinderGeometry(1.34, 1.48, 0.18, 34),
      new T.MeshStandardMaterial({ color: 0x3a3d4a, roughness: 0.88, metalness: 0.06 }));
    base.position.y = 0.09;
    dial.add(base);
    var face = new T.Mesh(new T.CylinderGeometry(1.22, 1.22, 0.07, 44),
      new T.MeshStandardMaterial({ color: 0x77705d, roughness: 0.66, metalness: 0.12 }));
    face.position.y = 0.21;
    dial.add(face);
    for (var k = 0; k < 12; k++) {
      var tk = new T.Mesh(new T.BoxGeometry(0.05, 0.022, (k % 3 === 0) ? 0.32 : 0.19),
        new T.MeshStandardMaterial({ color: 0xa79b80, roughness: 0.8 }));
      var ang = k / 12 * Math.PI * 2;
      tk.position.set(Math.sin(ang) * 0.90, 0.248, Math.cos(ang) * 0.90);
      tk.rotation.y = ang;
      dial.add(tk);
    }
    /* 晷针：一根略向北斜的细杆，影子才会落在盘面上 */
    var gnomon = new T.Mesh(new T.ConeGeometry(0.072, 1.95, 12),
      new T.MeshStandardMaterial({ color: 0xc0a468, roughness: 0.38, metalness: 0.34 }));
    gnomon.position.set(0, 1.12, 0.12);
    gnomon.rotation.z = 0.28;
    dial.add(gnomon);
    dial.userData.pickable = true;
    dial.position.y = 0.02;
    grp.add(dial);

    /* 字碑「日」：把字形和这一场绑在一起 */
    var stele = null;
    if (App.worldGlyph && App.worldGlyph.glyphMesh && App.worldGlyph.hasGlyph('日')) {
      var gm = App.worldGlyph.glyphMesh('日', 1.05, { color: 0x2a2620, emissive: 0x7fb4ff, glow: 0.30 });
      gm.position.set(-3.05, 0.30, 1.55);
      gm.rotation.y = 0.22;
      stele = gm;
      grp.add(gm);
      var ped = new T.Mesh(new T.CylinderGeometry(0.95, 1.05, 0.34, 24),
        new T.MeshStandardMaterial({ color: 0x33343f, roughness: 0.92 }));
      ped.position.set(-3.05, 0.02, 1.55);
      grp.add(ped);
    }

    var gb = App.stage3d.makeGuibao(T, { scale: 1.25 });
    if (gb) {
      gb.root.position.set(1.95, 0.02, 2.05);
      gb.root.rotation.y = -0.35;
      grp.add(gb.root);
    }

    /* 月光补一盏偏冷的正面光，别让晷盘沉进黑里 */
    var fill2 = new T.PointLight(0x8fb2d8, 2.4, 16, 1.8);
    fill2.position.set(2.6, 3.0, 4.2);
    st.scene.add(fill2);

    var orbitOn = false;
    return {
      name: 'sky',
      dial: dial, guibao: gb,
      enterOrbit: function () {
        orbitOn = true;
        st.orbit([0, 0.95, 0], { radius: 4.6, minR: 2.6, maxR: 9.0, yaw: 0.30, pitch: 0.22 });
      },
      exitOrbit: function () {
        orbitOn = false;
        st.flyTo({ pos: [0.4, 2.15, 7.2], look: [0, 1.05, 0], dur: 0.7 });
      },
      isOrbit: function () { return orbitOn; },
      update: function (dt, t) {
        if (gb && gb.update) { gb.update(dt, { speed: 0, run: false, focus: false }); }
        /* 整片星极缓地明灭一次，比逐颗闪便宜，也更像夜空 */
        if (stars.material) { stars.material.opacity = 0.80 + Math.sin(t * 0.5) * 0.12; }
        if (stele && stele.material) { stele.material.emissiveIntensity = 0.24 + Math.sin(t * 1.3) * 0.10; }
      },
      dispose: function () {}
    };
  }

  /* ================= 场景三：青铜礼器（器物） ================= */
  function bronzeMat(T, dark) {
    /* metalness 0.78 在"没有环境贴图"的场景里等于把物体涂黑：
       金属只反射环境，没有 envMap 时它什么都不反，只剩几处高光。
       截图里那只鼎就是一团黑剪影，只看得见被射灯打亮的白边。
       原型不引入 HDR，就把 metalness 压到 0.42、roughness 抬起来，
       让漫反射把这件器物的绿锈色自己说出来。 */
    return new T.MeshStandardMaterial({
      color: dark ? 0x565c3a : 0x6d7444,
      roughness: dark ? 0.62 : 0.52, metalness: 0.36,
      emissive: new T.Color(0x241d10), emissiveIntensity: 0.30
    });
  }

  /* 青铜鼎：Lathe 旋出腹部 + 三足 + 双耳。
     为什么不用 Box 拼：鼎是这一关"可以被绕着看"的主角，
     方盒拼出来的鼎从任何角度看都是一堆盒子。 */
  function makeDing(T) {
    var g = new T.Group();
    /* 剖面重做。原来那张剖面最宽处 0.86、高只有 1.10 —— 高宽比 0.64，
       旋出来是个敞口的深盆（截图里就是一只墨绿浴缸）。
       鼎的比例是"高大于宽"：腹最宽 0.62、通高 1.06，口沿再外撇一圈。 */
    var prof = [
      [0.00, 0.00], [0.30, 0.00], [0.36, 0.05], [0.46, 0.18],
      [0.56, 0.40], [0.61, 0.60], [0.59, 0.78], [0.54, 0.90],
      [0.52, 0.96], [0.62, 1.00], [0.66, 1.04], [0.63, 1.08],
      [0.54, 1.03], [0.50, 0.97]
    ].map(function (p) { return new T.Vector2(p[0], p[1]); });
    var body = new T.Mesh(new T.LatheGeometry(prof, 32), bronzeMat(T, false));
    body.castShadow = true; body.receiveShadow = true;
    g.add(body);

    /* 口沿：一圈卷边，把"薄壳"变成"厚沿" */
    var rim = new T.Mesh(new T.TorusGeometry(0.645, 0.038, 8, 34), bronzeMat(T, true));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 1.04;
    g.add(rim);

    /* 三足：外撇，起于腹底 y=0.10，落到 y=-0.42。足露出来，鼎才站得住 */
    for (var i = 0; i < 3; i++) {
      var a = i / 3 * Math.PI * 2 + Math.PI / 6;
      var leg = new T.Mesh(new T.CylinderGeometry(0.085, 0.055, 0.62, 8), bronzeMat(T, true));
      leg.position.set(Math.cos(a) * 0.34, -0.16, Math.sin(a) * 0.34);
      leg.rotation.z = Math.cos(a) * 0.20;
      leg.rotation.x = -Math.sin(a) * 0.20;
      leg.castShadow = true;
      g.add(leg);
      /* 足底一点小圆垫，别让圆柱底面直接切在地上 */
      var foot = new T.Mesh(new T.CylinderGeometry(0.062, 0.07, 0.05, 8), bronzeMat(T, true));
      foot.position.set(Math.cos(a) * 0.40, -0.45, Math.sin(a) * 0.40);
      g.add(foot);
    }

    /* 双耳：立在口沿上，半环 */
    [-1, 1].forEach(function (sgn) {
      var ear = new T.Mesh(new T.TorusGeometry(0.145, 0.040, 8, 18, Math.PI), bronzeMat(T, false));
      ear.position.set(sgn * 0.46, 1.07, 0);
      ear.rotation.y = Math.PI / 2;
      ear.castShadow = true;
      g.add(ear);
    });

    /* 腹上一圈纹样带：一圈浅浮雕方块。
       不画具象兽面 —— 程序化几何拼出来的饕餮一定糊成一团，
       不如老老实实做"一圈纹样带"，远看是铸痕，近看不撒谎。 */
    var bandR = 0.615, bandY = 0.64;
    var bandM = bronzeMat(T, true);
    for (var k = 0; k < 14; k++) {
      var ang = k / 14 * Math.PI * 2;
      var q = new T.Mesh(new T.BoxGeometry(0.085, 0.13, 0.022), bandM);
      q.position.set(Math.cos(ang) * bandR, bandY, Math.sin(ang) * bandR);
      q.rotation.y = -ang + Math.PI / 2;
      g.add(q);
    }
    g.userData.pickable = true;
    return g;
  }

  function buildBronze(st) {
    var T = st.T;
    /* 窖穴里只有一束光。基础三盏如果还按场景外的亮度开着，
       墙和地会先被照白，射灯再强也只是白上加白（上一版整屏纯白就是这么来的）。 */
    if (st.lights) {
      st.lights.hemi.intensity = 0.10;
      st.lights.sun.intensity = 0.06;
      st.lights.fill.intensity = 0.05;
    }
    st.scene.fog = new T.FogExp2(0x241d18, 0.020);
    skyDome(st, '#0e0b09', '#1c1611', '#2a1e16');
    st.renderer.toneMappingExposure = 0.88;

    var grp = new T.Group();
    st.root.add(grp);

    /* 夯土地面 */
    var floorCv = App.stage3d.canvas(256, 256), fc = floorCv.getContext('2d');
    fc.fillStyle = '#5f503a'; fc.fillRect(0, 0, 256, 256);
    var R = App.stage3d.rnd(77);
    for (var i = 0; i < 20; i++) {
      var yy = i * 13 + R() * 5;
      for (var seg = 0; seg < 4; seg++) {
        fc.strokeStyle = 'rgba(40,32,22,' + (0.10 + R() * 0.14).toFixed(2) + ')';
        fc.lineWidth = 1 + R() * 2;
        fc.beginPath();
        var sx = R() * 256;
        fc.moveTo(sx, yy); fc.lineTo(sx + 40 + R() * 90, yy + (R() - 0.5) * 4);
        fc.stroke();
      }
    }
    var floor = new T.Mesh(
      new T.CircleGeometry(14, 40),
      new T.MeshStandardMaterial({ map: App.stage3d.tex(floorCv, 5), color: 0xffffff, roughness: 1 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    grp.add(floor);

    /* 后侧的夯土墙 + 木柱，给出"这是一个窖穴"的空间感 */
    var wallM = new T.MeshStandardMaterial({ color: 0x4a3e2c, roughness: 1 });
    var wall = new T.Mesh(new T.BoxGeometry(22, 5.2, 0.8), wallM);
    wall.position.set(0, 2.6, -7.4);
    wall.receiveShadow = true;
    grp.add(wall);
    var woodM = new T.MeshStandardMaterial({ color: 0x33251a, roughness: 1 });
    [-8.2, -3.2, 3.2, 8.2].forEach(function (x) {
      var c = new T.Mesh(new T.CylinderGeometry(0.19, 0.22, 5.2, 8), woodM);
      c.position.set(x, 2.6, -6.9);
      c.castShadow = true;
      grp.add(c);
    });

    /* ---- 主角：青铜鼎 ---- */
    /* 鼎的足底在自身坐标 y = -0.45，scale 1.15 之后是 -0.52。
       原来把鼎放在 y=0.06，等于三足全埋进台座里 —— 截图里鼎像一只"盆"，
       正是因为它的腿根本没露出来。现在让它正好坐在台座顶面。 */
    var PODIUM_H = 0.34;
    var dingScale = 1.15;
    var ding = makeDing(T);
    ding.position.set(0, PODIUM_H + 0.45 * dingScale, 0);
    ding.scale.setScalar(dingScale);
    grp.add(ding);
    /* 鼎的基座：一块方台，让鼎"被陈列"而不是"扔在地上" */
    var podium = new T.Mesh(
      new T.BoxGeometry(2.7, PODIUM_H, 2.7),
      new T.MeshStandardMaterial({ color: 0x332b20, roughness: 1 })
    );
    podium.position.set(0, PODIUM_H / 2, 0);
    podium.receiveShadow = true;
    grp.add(podium);

    /* ---- 配角：爵（三足小杯）、玉璧 ---- */
    (function jue(x, z) {
      var g = new T.Group();
      var cup = new T.Mesh(new T.CylinderGeometry(0.26, 0.19, 0.42, 12, 1, true), bronzeMat(T, false));
      cup.material.side = T.DoubleSide;
      cup.position.y = 0.52;
      g.add(cup);
      for (var i = 0; i < 3; i++) {
        var a = i / 3 * Math.PI * 2;
        var leg = new T.Mesh(new T.CylinderGeometry(0.045, 0.032, 0.34, 6), bronzeMat(T, true));
        leg.position.set(Math.cos(a) * 0.14, 0.17, Math.sin(a) * 0.14);
        g.add(leg);
      }
      var spout = new T.Mesh(new T.BoxGeometry(0.30, 0.05, 0.16), bronzeMat(T, false));
      spout.position.set(0.34, 0.70, 0);
      spout.rotation.z = 0.34;
      g.add(spout);
      g.position.set(x, 0, z);
      g.scale.setScalar(1.1);
      grp.add(g);
      return g;
    })(2.5, 1.7);

    (function bi(x, z) {
      var g = new T.Group();
      /* 玉璧是"立着的一块环"，不是躺在地上的一根条：
         原来 rotation.x = π/2-0.35 把它压成近乎平躺，从平视机位看就是一条白色胶囊。 */
      var disc = new T.Mesh(new T.TorusGeometry(0.36, 0.075, 10, 30),
        new T.MeshStandardMaterial({ color: 0xa8b49a, roughness: 0.34, metalness: 0.42 }));
      disc.rotation.y = -0.6;
      disc.position.y = 0.42;
      g.add(disc);
      /* 一只小支座，让璧有"被架起来"的理由 */
      var stand = new T.Mesh(new T.BoxGeometry(0.5, 0.10, 0.26),
        new T.MeshStandardMaterial({ color: 0x2f2820, roughness: 1 }));
      stand.position.y = 0.05;
      g.add(stand);
      g.position.set(x, 0, z);
      grp.add(g);
      return g;
    })(-2.95, 0.85);   /* 原来在 (-3.4, 2.4)：离镜头只有 4 米、又在左侧边缘，16:9 下被切掉半个 */

    /* ---- 角落陶罐：窖穴里该有的杂物。没有它们，这里只是一间空房放了一口锅 ---- */
    (function pots() {
      var R2 = App.stage3d.rnd(303);
      var jarM = new T.MeshStandardMaterial({ color: 0x7a5f45, roughness: 0.92, metalness: 0.02 });
      var jarM2 = new T.MeshStandardMaterial({ color: 0x5d4a36, roughness: 0.94, metalness: 0.02 });
      [[-5.0, -3.6], [-4.3, -4.2], [-5.4, -4.6], [5.2, -3.9], [4.6, -4.5]].forEach(function (q, qi) {
        var sc = 0.8 + R2() * 0.6;
        var g2 = new T.Group();
        var belly = new T.Mesh(new T.SphereGeometry(0.34, 12, 10), qi % 2 ? jarM : jarM2);
        belly.scale.set(1, 0.86, 1);
        belly.position.y = 0.32;
        belly.castShadow = true;
        g2.add(belly);
        var neck = new T.Mesh(new T.CylinderGeometry(0.17, 0.24, 0.24, 12), jarM);
        neck.position.y = 0.66;
        g2.add(neck);
        var lip = new T.Mesh(new T.TorusGeometry(0.17, 0.03, 6, 14), jarM2);
        lip.rotation.x = Math.PI / 2;
        lip.position.y = 0.76;
        g2.add(lip);
        g2.position.set(q[0], 0, q[1]);
        g2.scale.setScalar(sc);
        g2.rotation.y = R2() * 6.28;
        grp.add(g2);
      });
    })();

    /* ---- 光：一束从天而降的射灯打在鼎上（这是"主角光"） ---- */
    /* 原来 42 的射灯 + 0.5 的环境光，把墙、地、台座全推到纯白 ——
       一只墨绿的鼎泡在一片白里，连轮廓都没有。降到 15 / 0.10，
       让"一束光打在鼎上、四周暗下去"这件事真的发生。 */
    /* 锥角 0.46 时，11 米外的光斑半径超过 5 米 —— 后墙整面被扫白。
       收到 0.30 之后光才真正"落在鼎上"。 */
    /* 灯位从 (0.4, 8.0, 3.0) 挪到鼎的正上方：
       之前光源在 z=3、后墙在 z=-7.4，一条斜射的锥必然扫到墙面 ——
       无论怎么调亮度，墙都跟着亮。垂直下来，光才只属于鼎。 */
    /* 13 的射灯把深色台座烧成一块白板，鼎反而黑得只剩轮廓 ——
       "一束光打在鼎上"应该是光池落在台座边缘、器物自己发亮。降到 7。 */
    var spot = new T.SpotLight(0xffd9a0, 7, 18, 0.34, 0.85, 1.3);
    spot.position.set(0.15, 7.6, 0.6);
    spot.target.position.set(0, 0.7, 0);
    spot.castShadow = true;
    if (spot.shadow) { spot.shadow.mapSize.set(1024, 1024); spot.shadow.bias = -0.0012; }
    st.scene.add(spot);
    st.scene.add(spot.target);
    /* 环境光从 0.14 抬到 0.30：台座不再烧白之后，暗部要有东西托着，
       否则龟宝、陶罐都糊成一团黑。偏暖一点，像窖穴里那点火气。 */
    st.scene.add(new T.AmbientLight(0x4a3a28, 0.18));

    /* 后墙一笔暖光把轮廓拉出来 */
    var wl = new T.PointLight(0xff9a55, 5, 16, 2);
    wl.position.set(-4, 3.2, -5.4);
    st.scene.add(wl);

    /* 正面补一盏很弱的冷光。射灯只照到鼎的顶面和口沿，
       腹部与三足全在暗里 —— 一件"可以绕着看"的器物，
       正面一点轮廓都看不见，转起来也没有明暗变化。 */
    var frontFill = new T.PointLight(0xa9bccd, 2.2, 15, 1.7);
    frontFill.position.set(3.2, 3.4, 7.2);
    st.scene.add(frontFill);

    /* 龟宝：站在鼎的左侧做法器讲解 */
    var gb = App.stage3d.makeGuibao(T, { scale: 1.0 });
    if (gb) {
      gb.root.position.set(-1.85, 0.02, 2.15);
      gb.root.rotation.y = -0.5;
      grp.add(gb.root);
    }

    st.camera.position.set(0.2, 2.45, 6.6);
    st.camera.lookAt(new T.Vector3(0, 1.15, 0));

    var orbitOn = false;
    return {
      name: 'bronze',
      ding: ding, guibao: gb,
      enterOrbit: function () {
        orbitOn = true;
        st.orbit([0, 1.02, 0], { radius: 6.4, minR: 3.0, maxR: 11.0, yaw: 0.42, pitch: 0.20 });
      },
      exitOrbit: function () {
        orbitOn = false;
        st.flyTo({ pos: [0.2, 2.45, 6.6], look: [0, 1.15, 0], dur: 0.7 });
      },
      isOrbit: function () { return orbitOn; },
      update: function (dt, t) {
        if (gb && gb.update) { gb.update(dt, { speed: 0, run: false, focus: false }); }
        /* 鼎上那圈光缓慢呼吸，像火在跳 */
        spotlightPulse(spot, t);
      },
      dispose: function () {}
    };
  }
  /* 射灯的呼吸。基准值必须和构造函数里的那个数一致：
     构造时写 7、这里又每帧写回 38，灯就永远是 38 ——
     调参时改了没反应，就是因为这一行在后面把值改了回来。 */
  function spotlightPulse(spot, t) {
    spot.intensity = 9.4 + Math.sin(t * 2.3) * 1.1 + Math.sin(t * 5.1) * 0.4;
  }

  /* ================= UI ================= */
  function buildUI() {
    var root = S.root;
    var top = el('div', 'bsp-top');
    var back = el('button', 'bsp-btn', '← 回馆');
    back.onclick = function () { if (App.shell && App.shell.go) { App.shell.go('modes'); } else { location.hash = '#/modes'; } };
    var ttl = el('span', 'bsp-title', '第二关 · 浮空骨片');
    var crumb = el('span', 'bsp-crumb', '骨片空间');
    top.appendChild(back); top.appendChild(ttl); top.appendChild(crumb);
    root.appendChild(top);

    var hint = el('div', 'bsp-hint');
    root.appendChild(hint);

    var panel = el('div', 'bsp-panel');
    root.appendChild(panel);

    var fade = el('div', 'bsp-fade');
    root.appendChild(fade);

    var load = el('div', 'bsp-load');
    var ring = el('div', 'ring');
    var ltxt = el('div', '', '正在铺开骨片');
    load.appendChild(ring); load.appendChild(ltxt);
    root.appendChild(load);

    var dots = el('div', 'bsp-dots');
    dots.style.display = 'none';
    root.appendChild(dots);

    var rot = el('div', 'bsp-rot', '拖拽旋转 · 滚轮放大');
    root.appendChild(rot);

    S.ui = { top: top, back: back, ttl: ttl, crumb: crumb, hint: hint, panel: panel, fade: fade, load: load, dots: dots, rot: rot };
    return S.ui;
  }

  function say(txt, ms) {
    var h = S.ui.hint;
    if (!h) { return; }
    h.innerHTML = txt;
    h.style.opacity = '1';
    h.style.transform = 'translateX(-50%) translateY(0)';
    if (S._sayT) { clearTimeout(S._sayT); }
    if (ms) {
      S._sayT = setTimeout(function () {
        h.style.opacity = '0';
        h.style.transform = 'translateX(-50%) translateY(8px)';
      }, ms);
    }
  }

  function crumb(t) { if (S.ui && S.ui.crumb) { S.ui.crumb.textContent = t; } }

  function openPanel(html, acts) {
    var p = S.ui.panel;
    p.innerHTML = html;
    if (acts && acts.length) {
      var bar = el('div', 'pact');
      acts.forEach(function (a) {
        var b = el('button', 'bsp-btn', a.label);
        b.onclick = a.onClick;
        bar.appendChild(b);
      });
      p.appendChild(bar);
    }
    p.classList.add('on');
    S.panelOpen = true;
    /* 面板一开，龟宝就该换一句话：底部那条还在说"点一片看看"，
       而玩家已经点开了，提示落后于操作。 */
    say('<b>龟宝</b>：这就是它刻的字。看清楚形状，再点「进入场景」去看实物。', 9000);
  }
  function closePanel() {
    if (S.ui && S.ui.panel) { S.ui.panel.classList.remove('on'); }
    S.panelOpen = false;
  }

  function fadeTo(fn) {
    var f = S.ui.fade;
    f.classList.add('on');
    setTimeout(function () {
      try { fn(); } catch (e) {}
      setTimeout(function () { f.classList.remove('on'); }, 90);
    }, 360);
  }

  /* ================= 场景切换 ================= */
  function clearScene() {
    if (S.sceneCtrl && S.sceneCtrl.dispose) { try { S.sceneCtrl.dispose(); } catch (e) {} }
    var r = S.st.root;
    while (r.children.length) {
      var c = r.children.pop();
      r.remove(c);
      disposeTree(c);
    }
    /* 场景级对象（天穹、远山、星点、各场景自己的灯）挂在 scene 上而不是 root 上，
       只清 root 的话它们会一层层叠下去：从骨片空间进草木川泽，
       上一场那三盏暖/冷点光还亮着，草地和树被多打一遍光，
       于是整屏发白像磨砂塑料（找了两轮的"过曝"其实就是灯没走）。 */
    var sc = S.st.scene, keep = [r, S.st.lights.hemi, S.st.lights.sun, S.st.lights.fill];
    for (var i = sc.children.length - 1; i >= 0; i--) {
      var ch = sc.children[i];
      if (keep.indexOf(ch) >= 0) { continue; }
      sc.remove(ch);
      disposeTree(ch);
    }
  }
  function disposeTree(ob) {
    ob.traverse && ob.traverse(function (o) {
      if (o.geometry) { try { o.geometry.dispose(); } catch (e) {} }
      if (o.material) {
        (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) {
          if (m.map) { try { m.map.dispose(); } catch (e) {} }
          try { m.dispose(); } catch (e) {}
        });
      }
    });
  }

  function goScene(name) {
    fadeTo(function () {
      clearScene();
      closePanel();
      S.ui.dots.style.display = 'none';
      S.ui.rot.classList.remove('on');
      S.mode = name;
      if (name === 'space') {
        S.sceneCtrl = buildSpace(S.st);
        crumb('骨片空间');
        say('<b>龟宝</b>：三片骨，三个去处。点一片看看。');
      } else if (name === 'nature') {
        S.sceneCtrl = buildNature(S.st);
        S.st.flyTo({ pos: [0.2, 2.6, 10.5], look: [0, 1.2, 0], dur: 0.9 });
        crumb('草木川泽');
        say('<b>龟宝</b>：溪边的字碑都能点。看完从左上角回骨片。');
        addSceneBtns();
      } else if (name === 'bronze') {
        S.sceneCtrl = buildBronze(S.st);
        S.st.flyTo({ pos: [0.2, 2.45, 6.6], look: [0, 1.15, 0], dur: 0.9 });
        crumb('青铜礼器');
        say('<b>龟宝</b>：中间那只鼎，点一下能绕着看。');
        addSceneBtns();
      } else if (name === 'sky') {
        S.sceneCtrl = buildSky(S.st);
        /* 石台半径 5.4：机位必须退到 10 米外，否则站在台面上只看得见一片黑。
           look 抬到 2.0 才把日晷和上方的月亮一起框进来。 */
        S.st.flyTo({ pos: [0.8, 3.4, 10.0], look: [0, 2.0, 0], dur: 0.9 });
        crumb('观星台');
        say('<b>龟宝</b>：这台日晷，点一下能绕着看。');
        addSceneBtns();
      }
      S.st.resize();
    });
  }

  /* 场景里的"返回骨片"与知识点按钮 */
  function addSceneBtns() {
    var d = S.ui.dots;
    d.innerHTML = '';
    d.style.display = 'flex';
    var e1 = el('button', 'bsp-dot', '骨');
    e1.title = '回到骨片空间';
    e1.onclick = function () { goScene('space'); };
    d.appendChild(e1);
  }

  /* ================= 交互：空间的骨片 ================= */
  function plateHit(obj) {
    if (!obj || !obj.userData || !obj.userData.plate) { return; }
    var p = obj.userData.plate;
    if (p.main) { showMainPanel(); return; }
    if (!p.hot) { return; }
    showPlatePanel(p, obj);
  }

  function showMainPanel() {
    openPanel(
      '<div class="ph">第二关 · 浮空骨片</div>' +
      '<div class="pch">龜</div>' +
      '<div class="pn">龜甲 · 占卜之骨</div>' +
      '<div class="psep"></div>' +
      '<div class="pb">商代人把问题刻在龟腹甲与牛肩胛上，灼烧背面，看正面裂出的兆纹来判断吉凶。' +
      '今天认的这些字，最早大多就刻在这样的骨片上。</div>' +
      '<div class="pb">这里悬着 <em>三片</em> 骨，每片刻着一个字，也通着一个世界。' +
      '选一片进去，用眼睛把字和实物对上。</div>',
      [{ label: '知道了', onClick: closePanel }]
    );
  }

  function showPlatePanel(p, obj) {
    var m = meaningOf(p.ch);
    var body = '';
    if (p.ch === '龜') {
      body = '龟甲，占卜之骨。';
    } else if (p.ch === '日') {
      body = '这一个不进新场景——它通向已经建好的王邑 3D 世界。';
    } else if (m) {
      body = m.form || m.meaning || '';
    }
    var html =
      '<div class="ph">骨片 · ' + p.sub + '</div>' +
      '<div class="pch">' + p.ch + '</div>' +
      '<div class="pn">' + p.name + '</div>' +
      '<div class="psep"></div>' +
      (m && m.meaning ? '<div class="pb">图上所见：<em>' + m.meaning + '</em></div>' : '') +
      '<div class="pb">' + body + '</div>';

    var acts = [{ label: '先看看', onClick: function () { closePanel(); resetCam(); } }];
    acts.push({
      label: p.to === 'wangyi' ? '进入王邑' : '进入场景',
      onClick: function () { closePanel(); enterPlate(p); }
    });
    openPanel(html, acts);

    /* 镜头推进到骨片正面 —— 这就是"点一下之后进得去"的视觉回答 */
    var T = S.st.T;
    var wp = new T.Vector3();
    obj.getWorldPosition(wp);
    S.st.flyTo({
      pos: [wp.x * 0.72, wp.y + 0.25, wp.z + 3.9],
      look: [wp.x, wp.y, wp.z],
      dur: 0.95, ease: 'inout'
    });
    S.focus = obj;
  }

  function resetCam() {
    S.focus = null;
    S.st.flyTo({ pos: [0, 2.35, 11.2], look: [0, 1.15, 0], dur: 0.8 });
  }

  function enterPlate(p) {
    /* 王邑 3D 已舍弃：「日」这片骨改走观星台，不再跳 #/world。 */
    goScene(p.to);
  }

  /* ================= mount / unmount ================= */
  function mount(host, ctx) {
    injectCSS();
    if (App.stage3d && App.stage3d.preload) { App.stage3d.preload(); }
    var root = el('div', 'bsp-root');
    /* 挂到 body 而不是 host：.scene 一脉上有 motion 加的 transform，
       fixed 子孙会被那个 transform 变成"相对祖先定位"，于是全屏变成半屏
       （页面下半截露出页脚，还透着三维画面）。挂到 body 才真正相对视口。 */
    document.body.appendChild(root);
    document.body.classList.add('bsp-lock');
    S.host = host; S.root = root; S.alive = true;
    buildUI();

    App.stage3d.create(root.querySelector('.bsp-load') ? root : root, {
      fov: 46,
      fog: { color: 0x15111c, density: 0.0165 },
      camera: { pos: [0, 2.35, 11.2], look: [0, 1.15, 0] },
      exposure: 1.05,
      hemi: 0.34, sun: 0.55, fill: 0.22,
      shadow: true
    }, function (err, st) {
      if (err || !st) {
        root.innerHTML = '';
        var e = el('div', 'bsp-err',
          '3D 引擎没能载入（' + (err && err.message ? err.message : '未知错误') + '）。<br>' +
          '这通常是因为 three.min.js 体积较大、网络被中途掐断。<br>刷新一次通常就好。');
        root.appendChild(e);
        return;
      }
      S.st = st;
      var stageHost = root.querySelector('.bsp-stage');
      if (!stageHost) {
        stageHost = el('div', 'bsp-stage');
        root.insertBefore(stageHost, root.firstChild);
      }
      stageHost.appendChild(st.el);
      st.el.style.position = 'absolute';
      st.el.style.inset = '0';
      st.el.style.width = '100%';
      st.el.style.height = '100%';

      S.sceneCtrl = buildSpace(st);
      crumb('骨片空间');
      say('<b>龟宝</b>：三片骨，三个去处。点一片看看。');

      st.onTick(function (dt, t) {
        if (!S.alive) { return; }
        if (S.sceneCtrl && S.sceneCtrl.update) { S.sceneCtrl.update(dt, t); }
        /* 骨片铭牌（DOM）跟着 3D 位置走 */
        updateTags();
      });

      st.onPick(function (ev) {
        if (!ev.obj) {
          if (S.mode === 'space' && S.panelOpen) { closePanel(); resetCam(); }
          return;
        }
        if (S.mode === 'space') { plateHit(ev.obj); }
        else if (S.mode === 'nature') {
          var g = ev.obj;
          while (g && !g.userData.stone) { g = g.parent; }
          if (g && g.userData.stone) { stoneHit(g.userData.stone); }
        } else if (S.mode === 'bronze' || S.mode === 'sky') {
          var d = ev.obj;
          while (d && !(d.userData.pickable && d.type === 'Group')) { d = d.parent; }
          if (d) {
            S.sceneCtrl.enterOrbit();
            S.ui.rot.classList.add('on');
            say(S.mode === 'sky'
              ? '<b>龟宝</b>：这是日晷。拖着转一圈，看针的影子。'
              : '<b>龟宝</b>：绕着看，滚轮能凑近。看完点右侧「骨」回去。', 5200);
          }
        }
      });

      var ld = S.ui.load;
      ld.classList.add('off');
      setTimeout(function () { if (ld.parentNode) { ld.parentNode.removeChild(ld); } }, 600);

      /* 键盘：Esc 逐级返回 */
      S._kd = function (e) {
        if (e.key === 'Escape') {
          if (S.panelOpen) { closePanel(); resetCam(); }
          else if (S.mode !== 'space') { goScene('space'); }
        }
      };
      window.addEventListener('keydown', S._kd);
    });
  }

  /* 骨片铭牌：把骨片的世界坐标投到屏幕，摆一个 DOM 标签上去。
     为什么不用 3D 文字：中文字形贴图在浮动 + 自转下容易糊，
     DOM 标签永远清晰，而且能跟着 CSS 主题走。 */
  function updateTags() {
    if (!S.st || !S.sceneCtrl) { return; }
    /* 离开骨片空间时把铭牌收掉：它们是常驻 DOM，不跟着场景销毁，
       不主动隐藏的话会飘在自然场景的草地上（截图里就挂着一块"草木川泽"）。 */
    if (S.mode !== 'space') {
      if (S._tags) {
        for (var q = 0; q < S._tags.length; q++) {
          if (S._tags[q]) { S._tags[q].style.opacity = '0'; }
        }
      }
      return;
    }
    var T = S.st.T, cam = S.st.camera;
    var host = S.root;
    var w = host.clientWidth || 1, h = host.clientHeight || 1;
    var v = new T.Vector3();
    var list = S.sceneCtrl.plates || [];
    if (!S._tags) { S._tags = []; }
    for (var i = 0; i < list.length; i++) {
      var o = list[i], tag = S._tags[i];
      if (!tag) {
        tag = el('div', 'bsp-tag');
        tag.innerHTML = '<div class="t1"></div><div class="t2"></div>';
        host.appendChild(tag);
        S._tags[i] = tag;
      }
      var p = o.userData.plate;
      tag.querySelector('.t1').textContent = p.name;
      tag.querySelector('.t2').textContent = p.sub;
      /* 镜头推进到某片骨上时，它自己的铭牌正好压在字上（字是主角，铭牌重复了）。
         面板打开期间把这一片的铭牌让开，其余两片照旧。 */
      if (S.panelOpen && S.focus === o) { tag.style.opacity = '0'; continue; }
      o.getWorldPosition(v);
      v.y -= 0.95;
      v.project(cam);
      if (v.z > 1) { tag.style.opacity = '0'; continue; }
      tag.style.opacity = '0.92';
      tag.style.left = ((v.x * 0.5 + 0.5) * w).toFixed(1) + 'px';
      tag.style.top = ((-v.y * 0.5 + 0.5) * h).toFixed(1) + 'px';
    }
  }

  function stoneHit(sp) {
    var m = meaningOf(sp.ch);
    if (!m) { return; }
    openPanel(
      '<div class="ph">草木川泽 · 字碑</div>' +
      '<div class="pch">' + sp.ch + '</div>' +
      '<div class="pn">' + (m.meaning || '') + '</div>' +
      '<div class="psep"></div>' +
      '<div class="pb">' + (m.form || '') + '</div>' +
      '<div class="pb">这块碑立在它该在的地方：<em>' + (m.zone || '') + '</em>里的实物，' +
      '与这个字的构形是同一件事。</div>',
      [{ label: '退回场景', onClick: closePanel }]
    );
  }

  function unmount() {
    S.alive = false;
    if (S._kd) { window.removeEventListener('keydown', S._kd); S._kd = null; }
    if (S._sayT) { clearTimeout(S._sayT); }
    if (S.st) { try { S.st.dispose(); } catch (e) {} S.st = null; }
    if (S.root && S.root.parentNode) { S.root.parentNode.removeChild(S.root); }
    document.body.classList.remove('bsp-lock');
    S.root = null; S.sceneCtrl = null; S._tags = null;
  }

  App.bonespace = { mount: mount, unmount: unmount, _S: S, goScene: goScene };

  App.modes.register({
    id: 'bone-space',
    name: '浮空骨片',
    tagline: '骨片空间 · 三个世界',
    desc: '一片悬在虚空里的骨阵：远山、雾、浮骨、暖光。点一片骨，镜头推进，进入它刻着的那个世界——'
        + '溪山草木、青铜礼器，或直接走进已经建好的王邑。骨上刻的字全部取自现有字形数据。',
    icon: '骨',
    accent: 'var(--gold)',
    tags: ['3D', '探索', '三个场景'],
    layout: 'wide',
    minPlayers: 1, maxPlayers: 1,
    status: 'ready',
    data: { packs: [], assets: ['glyphs'] },
    mount: mount,
    unmount: unmount
  });
})(window.App = window.App || {});
