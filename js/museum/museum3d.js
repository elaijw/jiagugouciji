/* ============================================================
   甲骨奇谭 · 3D 博物馆 / 场景层
   ------------------------------------------------------------
   这一层只负责"空间"：几何体、材质、灯光、相机、拾取。
   文字、面板、按钮、进度一律不在这里 —— 它们在 museum.js。

   ★ 关于模型：分两路。
     ① 建筑与主要器物用 Blender 建的 GLB（assets/models/*.glb，源脚本
        tools/build_models.py）：骨版、龟甲、台座、展柜、入口门廊。
     ② 没有模型的地方是程序化几何（柱、墙、门、探方、构件块都是 Box/Cylinder/Torus）。
     两路的骨面刻的都是 App.glyphs 里的真实甲骨字形（Path2D 现画成 map + bump）。
     所以我们不会把一张平面图说成"可自由旋转的 3D 文物"：能转的是真的立体骨版，
     字是真的字形数据，二者都不是照片贴片。GLB 读不到时自动退回程序化那版。

   ★ 依赖：window.THREE（由 museum.js 在进入展馆时按需注入，避免首页多付 600KB）
   ============================================================ */
(function (App) {
  'use strict';

  /* 只在 create() 里赋值。展馆同时只会有一个实例，所以模块级持有是安全的。 */
  var T = null;

  /* ---------- 展区定义（与 museum.js 共用文案键） ---------- */
  var ZONE_DEF = [
    { id: 'gallery',    name: '甲骨文知识厅', glyph: '日', accent: 0xcc523b, angle: -108 },
    { id: 'build',      name: '造字探索区', glyph: '木', accent: 0x337663, angle: -48 },
    { id: 'excavate',   name: '考古任务区', glyph: '山', accent: 0xa58147, angle: 48 },
    { id: 'boss',       name: 'BOSS 挑战区', glyph: '戈', accent: 0x8c3a2a, angle: 108 },
    { id: 'collection', name: '我的典藏区', glyph: '贝', accent: 0x527d91, angle: 168 }
  ];

  var SLAB_RATIO = 1.58;  /* 骨版高宽比：甲骨多为竖长 */
  var HALL_R = 15.6;      /* 展区环半径 */
  var WALL_R = 24;        /* 外墙半径 */
  var HALL_H = 15;        /* 层高 */
  var GAL_Z = -170;       /* 甲骨文展厅放在大厅很远处，独立成组，切区不动渲染器 */

  /* ---------- 材质小工具 ---------- */
  function std(o) { return new T.MeshStandardMaterial(o); }
  function canvasTex(cv, opt) {
    var o = opt || {};
    var t = new T.CanvasTexture(cv);
    if (o.srgb) { t.encoding = T.sRGBEncoding; }
    t.anisotropy = o.aniso == null ? 4 : o.aniso;
    if (o.repeat) {
      t.wrapS = t.wrapT = T.RepeatWrapping;
      t.repeat.set(o.repeat[0], o.repeat[1]);
    }
    t.needsUpdate = true;
    return t;
  }

  /* 磨光石地面：不是一块纯色，而是有石脉、有深浅的整石。
     一张 1024 贴满整个圆厅，不做重复平铺，因此看不出接缝。 */
  function stoneTex() {
    var S = 1024;
    var cv = App.museumTex.canvas(S, S);
    var ctx = cv.getContext('2d');
    var R = App.museumTex.rng(20261029);
    ctx.fillStyle = '#241a12';
    ctx.fillRect(0, 0, S, S);

    /* 大块深浅：石头的"云" */
    for (var i = 0; i < 26; i++) {
      var x = R() * S, y = R() * S, r = (0.06 + R() * 0.22) * S;
      var g = ctx.createRadialGradient(x, y, 0, x, y, r);
      var up = R() > 0.5;
      g.addColorStop(0, up ? 'rgba(74,56,38,.30)' : 'rgba(12,8,5,.34)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    /* 石脉：几乎水平的细长弧线，走得很慢 */
    for (var v = 0; v < 16; v++) {
      ctx.beginPath();
      var y0 = R() * S;
      var amp = 8 + R() * 40;
      ctx.moveTo(-20, y0);
      for (var x2 = 0; x2 <= S + 20; x2 += 32) {
        ctx.lineTo(x2, y0 + Math.sin(x2 * 0.006 + v) * amp);
      }
      ctx.strokeStyle = 'rgba(120,96,70,' + (0.03 + R() * 0.06).toFixed(3) + ')';
      ctx.lineWidth = 0.7 + R() * 2.2;
      ctx.stroke();
    }
    /* 细砂 */
    for (var k = 0; k < 5200; k++) {
      ctx.fillStyle = 'rgba(200,180,150,' + (0.01 + R() * 0.045).toFixed(3) + ')';
      ctx.fillRect(R() * S, R() * S, 1, 1);
    }
    return cv;
  }

  /* 光锥贴图：上浓下淡的竖向渐变，配合加法混合做一束"顶光"。 */
  var _beamTex = null;
  function beamTex() {
    if (_beamTex) { return _beamTex; }
    var W = 64, H = 256;
    var cv = App.museumTex.canvas(W, H);
    var ctx = cv.getContext('2d');
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0.00, 'rgba(255,228,180,.58)');
    g.addColorStop(0.22, 'rgba(255,214,158,.26)');
    g.addColorStop(0.55, 'rgba(238,188,128,.07)');
    g.addColorStop(0.80, 'rgba(220,170,110,0)');
    g.addColorStop(1.00, 'rgba(220,170,110,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    _beamTex = canvasTex(cv, { srgb: true });
    return _beamTex;
  }

  /* 洗墙光斑：展品背后墙面上的一团暖光。
     纯贴图 + 加法混合，不打灯 —— 十二件各配一盏真 SpotLight 太贵，
     而且十二盏点光叠在同一个场景里会把骨版打成一片惨白。
     只生成一次，十二件共用同一张贴图。 */
  var _washTex = null;
  function washTex() {
    if (_washTex) { return _washTex; }
    var W = 160, H = 256;
    var cv = App.museumTex.canvas(W, H);
    var ctx = cv.getContext('2d');
    var g = ctx.createRadialGradient(W / 2, H * 0.54, 4, W / 2, H * 0.54, W * 0.66);
    g.addColorStop(0.00, 'rgba(255,228,182,.92)');
    g.addColorStop(0.32, 'rgba(212,162,102,.44)');
    g.addColorStop(0.68, 'rgba(138,94,50,.13)');
    g.addColorStop(1.00, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    _washTex = canvasTex(cv, { srgb: true });
    return _washTex;
  }

  /* 一张软阴影贴图：展台底下那圈接地影。
     比开一堆实时阴影便宜得多，近距离也看不出破绽。 */
  function contactShadowTex() {
    var cv = App.museumTex.canvas(128, 128);
    var ctx = cv.getContext('2d');
    var g = ctx.createRadialGradient(64, 64, 2, 64, 64, 62);
    g.addColorStop(0, 'rgba(0,0,0,.55)');
    g.addColorStop(0.55, 'rgba(0,0,0,.22)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    return canvasTex(cv);
  }

  /* 门洞里的"气"：门内没有东西可看，但地面反光会溢出来一点。
     所以贴图是**底部暖、越往上越透** —— 门因此是"通到别处去"的开口，
     而不是一块发光的板。 */
  function veilTex(accent) {
    var cv = App.museumTex.canvas(128, 128);
    var ctx = cv.getContext('2d');
    var c = new T.Color(accent);
    var r = Math.round(c.r * 255), gg = Math.round(c.g * 255), b = Math.round(c.b * 255);
    var grd = ctx.createLinearGradient(0, 128, 0, 0);
    grd.addColorStop(0, 'rgba(' + r + ',' + gg + ',' + b + ',.34)');
    grd.addColorStop(0.28, 'rgba(' + r + ',' + gg + ',' + b + ',.14)');
    grd.addColorStop(0.65, 'rgba(' + r + ',' + gg + ',' + b + ',.03)');
    grd.addColorStop(1, 'rgba(' + r + ',' + gg + ',' + b + ',0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 128, 128);
    /* 门槛处更亮一点：光从缝里漏出来 */
    var rg = ctx.createRadialGradient(64, 128, 2, 64, 128, 74);
    rg.addColorStop(0, 'rgba(' + r + ',' + gg + ',' + b + ',.40)');
    rg.addColorStop(1, 'rgba(' + r + ',' + gg + ',' + b + ',0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, 128, 128);
    return canvasTex(cv, { srgb: true });
  }

  /* 门前地上的那一摊光：门后有光，地上才有回应 */
  function spillTex(accent) {
    var cv = App.museumTex.canvas(128, 128);
    var ctx = cv.getContext('2d');
    var c = new T.Color(accent);
    var r = Math.round(c.r * 255), gg = Math.round(c.g * 255), b = Math.round(c.b * 255);
    var g = ctx.createRadialGradient(64, 64, 2, 64, 64, 62);
    g.addColorStop(0, 'rgba(' + r + ',' + gg + ',' + b + ',.26)');
    g.addColorStop(0.55, 'rgba(' + r + ',' + gg + ',' + b + ',.08)');
    g.addColorStop(1, 'rgba(' + r + ',' + gg + ',' + b + ',0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    return canvasTex(cv, { srgb: true });
  }

  /* 字形徽记：透明底 + 骨色笔画，贴在门楣上方 */
  function glyphBadgeTex(ch, color) {
    var S = 256;
    var cv = App.museumTex.canvas(S, S);
    /* 直接用纹理层的画笔（它认 App.glyphs 的真实笔画） */
    App.museumTex.paintGlyph(cv, ch, { color: color, weight: 3.1 });
    return canvasTex(cv, { srgb: true });
  }

  /* ---------- 骨版形状 ----------
     一块不规则的圆角四边形：真骨没有直角。
     seed 决定边缘起伏，同一个字永远得到同一块骨。
     比例按甲骨常见的样子做窄长（1 : 1.58），不是鹅卵石。 */
  function boneGeometry(seed, w, h, depth) {
    var R = App.museumTex.rng(seed);
    var n = 80;
    var ax = w * 0.5, ay = h * 0.5;
    /* 圆角矩形的"p-范数"指数：p 越大越方。骨料是切开的骨片，
       边基本是直的、角是圆的；p 用 2 附近就成鸭蛋了，所以取 7。 */
    var P = 7.0;

    /* 崩口：先随机再几轮平滑 —— 缺口要成块，不能满身锯齿 */
    var jit = [], i, k;
    for (i = 0; i < n; i++) { jit.push(R() - 0.5); }
    for (k = 0; k < 3; k++) {
      var nxt = [];
      for (i = 0; i < n; i++) {
        nxt.push((jit[(i + n - 1) % n] + jit[i] * 2 + jit[(i + 1) % n]) / 4);
      }
      jit = nxt;
    }
    /* 一处明显的残断（真骨片少有不缺角的），位置由种子定 */
    var chipA = (0.36 + R() * 0.2) * Math.PI * 2;

    var pts = [];
    for (i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2;
      var ca = Math.cos(a), sa = Math.sin(a);
      var r = 1 / Math.pow(
        Math.pow(Math.abs(ca / ax), P) + Math.pow(Math.abs(sa / ay), P), 1 / P);
      r *= 1 + jit[i] * 0.048;
      var d = Math.abs(((a - chipA + Math.PI) % (Math.PI * 2)) - Math.PI);
      if (d < 0.23) { r *= 1 - 0.095 * Math.cos(d / 0.23 * Math.PI * 0.5); }
      r *= 1 + 0.045 * sa;      /* 上宽下窄：真骨片是这么长的 */
      pts.push(new T.Vector2(ca * r, sa * r));
    }

    var shape = new T.Shape();
    shape.moveTo(pts[0].x, pts[0].y);
    /* 用直线连，不用 splineThru：样条会把直边拉成弧，
       26 个点一插值就成了一个蛋 —— 这是之前轮廓不对的真正原因。 */
    for (i = 1; i < pts.length; i++) { shape.lineTo(pts[i].x, pts[i].y); }
    shape.closePath();

    var geo = new T.ExtrudeGeometry(shape, {
      depth: depth || 0.07,
      bevelEnabled: true,
      bevelThickness: 0.016,
      bevelSize: 0.014,
      bevelSegments: 1,
      curveSegments: 4
    });
    geo.center();
    /* ExtrudeGeometry 的 UV 直接用顶点 xy，这里重算成 0..1，
       否则贴图的字会被骨版尺寸拉伸、还要跟着 position 漂。 */
    var pos = geo.attributes.position;
    var uv = geo.attributes.uv;
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (var v = 0; v < pos.count; v++) {
      var px = pos.getX(v), py = pos.getY(v);
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
    }
    var sx = maxX - minX || 1, sy = maxY - minY || 1;
    for (var u = 0; u < pos.count; u++) {
      uv.setXY(u, (pos.getX(u) - minX) / sx, (pos.getY(u) - minY) / sy);
    }
    uv.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  }

  /* 一块骨版 + 它的材质。回传对象以便图鉴里统一登记、统一释放。
     o.columns 有值时骨面刻的是成篇的竖行（此时 ch 可留空）。 */
  function makeSlab(ch, opt) {
    var o = opt || {};
    var size = o.size || 1.0;
    var tw = o.texSize || 512;
    var ratio = o.ratio || SLAB_RATIO;
    var tex = App.museumTex.slabTextures(ch, {
      w: tw, h: Math.round(tw * ratio), columns: o.columns, cracks: o.cracks,
      /* 预画好的骨面底图：中央那块换字时复用，不重画骨面 */
      base: o.base
    });
    var map = canvasTex(tex.map, { srgb: true, aniso: 8 });
    var bump = canvasTex(tex.bump, { aniso: 4 });

    var mtl = std({
      map: map,
      bumpMap: bump,
      bumpScale: 0.068,
      /* 骨面不该是纯白：颜色乘上去压掉一层，画面里的顶光才不会把它打爆 */
      color: 0xd4c6ab,
      roughness: 0.76,
      metalness: 0.03,
      envMapIntensity: 0.45
    });
    /* 侧面（挤出壁）：颜色压深、去掉字纹，否则字会绕到骨厚上去 */
    var sideMtl = std({
      color: 0xa8977a, roughness: 0.86, metalness: 0.02, envMapIntensity: 0.35
    });

    var geo = boneGeometry(App.museumTex.hashStr(ch || (o.columns || []).join('') || 'b') || 11,
      1.0, ratio, 0.075);
    var mesh = new T.Mesh(geo, [mtl, sideMtl]);
    mesh.scale.setScalar(size);
    mesh.castShadow = !!o.castShadow;
    mesh.receiveShadow = true;
    mesh.userData.kind = 'slab';
    if (ch) { mesh.userData.char = ch; }
    return {
      mesh: mesh, geo: geo, mats: [mtl, sideMtl], map: map, bump: bump,
      /* 重刻：造字区把构件摆上骨面时用（换贴图不换几何） */
      recarve: function (columns, opt2) {
        var t2 = App.museumTex.slabTextures('', {
          w: tw, h: Math.round(tw * ratio), columns: columns,
          /* 造字区只有两三个构件，字格要放大，不然刻上看不清是哪个 */
          boost: (opt2 && opt2.boost) || 1
        });
        var nm = canvasTex(t2.map, { srgb: true, aniso: 8 });
        var nb = canvasTex(t2.bump, { aniso: 4 });
        map.dispose(); bump.dispose();
        mtl.map = nm; mtl.bumpMap = nb;
        map = nm; bump = nb;
        mtl.needsUpdate = true;
      }
    };
  }

  /* ============================================================
     入口
     ============================================================ */
  function create(host, cb) {
    T = window.THREE;
    if (!T) { throw new Error('THREE 未加载'); }

    var opt = cb || {};
    var low = !!opt.low;

    /* ---------- 渲染器 ---------- */
    var renderer = new T.WebGLRenderer({
      antialias: !low,
      powerPreference: 'high-performance',
      alpha: false,
      stencil: false
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, low ? 1 : 1.75));
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.04;
    renderer.shadowMap.enabled = !low;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.domElement.className = 'mu-canvas';
    host.appendChild(renderer.domElement);

    var scene = new T.Scene();
    scene.background = new T.Color(0x0b0805);
    scene.fog = new T.FogExp2(0x0b0805, 0.020);

    var camera = new T.PerspectiveCamera(42, 1, 0.1, 320);
    camera.position.set(0, 4.2, 15);

    /* ---------- 环境反射 ---------- */
    var pmrem = new T.PMREMGenerator(renderer);
    var envTex = canvasTex(App.museumTex.envCanvas(), { srgb: true });
    envTex.mapping = T.EquirectangularReflectionMapping;
    var envRT = pmrem.fromEquirectangular(envTex);
    scene.environment = envRT.texture;
    pmrem.dispose();

    /* ---------- 灯光 ---------- */
    var hemi = new T.HemisphereLight(0x5d4732, 0x0a0705, 0.74);
    scene.add(hemi);

    var keySpot = new T.SpotLight(0xffe6c4, 2.15, 46, 0.62, 0.92, 0.9);
    keySpot.position.set(0, 14.2, 1.5);
    keySpot.target.position.set(0, 0, 0);
    if (!low) {
      keySpot.castShadow = true;
      keySpot.shadow.mapSize.set(1024, 1024);
      keySpot.shadow.bias = -0.0012;
      keySpot.shadow.camera.near = 4;
      keySpot.shadow.camera.far = 40;
    }
    scene.add(keySpot, keySpot.target);

    var fill = new T.SpotLight(0xffd7b0, 0.42, 60, 1.05, 1.0, 0.6);
    fill.position.set(0, 7, 20);
    fill.target.position.set(0, 3, -4);
    scene.add(fill, fill.target);

    /* 背侧一盏冷轮廓光：暖褐的墙里，骨版要靠一点冷光才"剥"得出来 */
    var rim = new T.SpotLight(0xa9c0cf, 0.85, 9.5, 0.5, 1.0, 0.7);
    rim.position.set(-6.4, 5.6, -6.8);
    rim.target.position.set(0, 4.0, 0);
    scene.add(rim, rim.target);

    /* ============================================================
       大厅
       ============================================================ */
    var hall = new T.Group();
    scene.add(hall);

    /* 地面：深色抛光石。用 env + 低粗糙度做出"有水光"的地面，
       不铺镜面反射（那要多一遍渲染，且移动端直接掉帧）。 */
    var floorMtl = std({
      map: canvasTex(stoneTex(), { srgb: true, aniso: 8 }),
      color: 0xcfc4b4,
      roughness: 0.30, metalness: 0.28, envMapIntensity: 0.85
    });
    var floor = new T.Mesh(new T.CircleGeometry(WALL_R + 2, 96), floorMtl);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    hall.add(floor);

    /* 地面嵌线：两道细铜线，把视线收到中央展台上 */
    [6.4, 11.2].forEach(function (r, i) {
      var ring = new T.Mesh(
        new T.TorusGeometry(r, i ? 0.035 : 0.05, 6, 96),
        std({ color: 0x9a7a45, roughness: 0.42, metalness: 0.75, envMapIntensity: 1.2 })
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.012;
      hall.add(ring);
    });

    /* 中央展台下的光斑：抛光地面接住顶光的样子 */
    var glowCv = App.museumTex.canvas(256, 256);
    var gctx = glowCv.getContext('2d');
    var ggr = gctx.createRadialGradient(128, 128, 4, 128, 128, 126);
    ggr.addColorStop(0, 'rgba(255,214,164,.40)');
    ggr.addColorStop(0.4, 'rgba(255,196,140,.13)');
    ggr.addColorStop(1, 'rgba(255,190,130,0)');
    gctx.fillStyle = ggr;
    gctx.fillRect(0, 0, 256, 256);
    var glow = new T.Mesh(
      new T.PlaneGeometry(13, 13),
      new T.MeshBasicMaterial({
        map: canvasTex(glowCv, { srgb: true }), transparent: true,
        blending: T.AdditiveBlending, depthWrite: false, opacity: 0.9
      })
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.02;
    hall.add(glow);

    /* 外墙：一圈筒壁。内表面受光，靠雾把远端吃掉，产生纵深。 */
    var wallMtl = std({ color: 0x1b130c, roughness: 0.94, metalness: 0.04, side: T.BackSide });
    var wall = new T.Mesh(new T.CylinderGeometry(WALL_R, WALL_R, HALL_H, 72, 1, true), wallMtl);
    wall.position.y = HALL_H / 2;
    hall.add(wall);

    /* 墙裙：贴地一圈稍亮的石材，给"墙脚"一个交代 */
    var skirt = new T.Mesh(
      new T.CylinderGeometry(WALL_R - 0.06, WALL_R - 0.06, 1.1, 72, 1, true),
      std({ color: 0x2a1e14, roughness: 0.7, metalness: 0.15, side: T.BackSide })
    );
    skirt.position.y = 0.55;
    hall.add(skirt);

    /* 顶：暗穹 + 光井 */
    var ceil = new T.Mesh(
      new T.CircleGeometry(WALL_R, 64),
      std({ color: 0x100b07, roughness: 1, metalness: 0, side: T.DoubleSide })
    );
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = HALL_H;
    hall.add(ceil);

    var well = new T.Mesh(
      new T.RingGeometry(3.4, 6.2, 64),
      new T.MeshBasicMaterial({ color: 0xffe3bd, transparent: true, opacity: 0.10, side: T.DoubleSide })
    );
    well.rotation.x = Math.PI / 2;
    well.position.y = HALL_H - 0.02;
    hall.add(well);

    /* 立柱：12 根，撑起"有进深"的第一印象。
       8 段圆柱在这个尺寸下看不出多边形，省一半三角面。 */
    var colMtl = std({ color: 0x3b2a1c, roughness: 0.52, metalness: 0.32, envMapIntensity: 0.9 });
    var colGeo = new T.CylinderGeometry(0.42, 0.48, HALL_H - 1.6, 10, 1);
    var capGeo = new T.BoxGeometry(1.24, 0.34, 1.24);
    var baseGeo = new T.BoxGeometry(1.42, 0.5, 1.42);
    var COL_N = 12;
    for (var ci = 0; ci < COL_N; ci++) {
      var ca = (ci / COL_N) * Math.PI * 2 + Math.PI / COL_N;
      var cx = Math.sin(ca) * 20.2, cz = Math.cos(ca) * 20.2;
      var shaft = new T.Mesh(colGeo, colMtl);
      shaft.position.set(cx, (HALL_H - 1.6) / 2 + 0.5, cz);
      shaft.castShadow = !low;
      hall.add(shaft);
      var cap = new T.Mesh(capGeo, colMtl);
      cap.position.set(cx, HALL_H - 1.5, cz);
      hall.add(cap);
      var bs = new T.Mesh(baseGeo, colMtl);
      bs.position.set(cx, 0.25, cz);
      hall.add(bs);
    }

    /* ---------- 中央展台 ---------- */
    var hero = new T.Group();
    hall.add(hero);

    var plinth = new T.Mesh(
      new T.CylinderGeometry(2.35, 2.6, 0.95, 56),
      std({ color: 0x3b2c1f, roughness: 0.44, metalness: 0.32, envMapIntensity: 0.9 })
    );
    plinth.position.y = 0.475;
    plinth.castShadow = !low;
    plinth.receiveShadow = true;
    hero.add(plinth);

    var plinthRing = new T.Mesh(
      new T.TorusGeometry(2.36, 0.028, 6, 72),
      std({ color: 0x9a7a45, roughness: 0.4, metalness: 0.8, envMapIntensity: 1.3 })
    );
    plinthRing.rotation.x = Math.PI / 2;
    plinthRing.position.y = 0.95;
    hero.add(plinthRing);

    /* 程序化替身（GLB 读不到时才显出来）。size 与 Blender 那件对齐，
       落座也按几何中心算到台面上，别手写一个 3.05 —— 那样会浮空。 */

    /* ---------- 中央骨版：换着刻不同的字 ----------
       原来这块一直刻着「卜」，一个展厅的中心只有一件东西，
       却永远是同一个字 —— 看完一次，第二次进来就没有可看的了。

       现在它按 HERO_CYCLE 轮着刻，铜牌跟着换一句话，点开就是当前这个字的展签。
       两条前提：
         1. 刻的字必须在 js/core/glyph-parts.json 里（骨面上的字是现画的，
            数据集里没有的字会静默刻不出来）。所以挑的都是那 73 个里的。
         2. 骨面底图只画一次（heroBase）：换字只重刻字，骨色/裂纹不动。
            否则每次切换都要重画骨面，一秒一卡。 */
    var HERO_CYCLE = [
      { ch: '卜', mean: '灼骨所现之兆' },
      { ch: '日', mean: '一轮圆日，中加一点' },
      { ch: '月', mean: '一弯缺月' },
      { ch: '雨', mean: '云下三点雨' },
      { ch: '山', mean: '三峰并列' },
      { ch: '川', mean: '两畔夹一水' },
      { ch: '木', mean: '上枝下根' },
      { ch: '林', mean: '二木成林' },
      { ch: '鱼', mean: '有头有尾有鳍' },
      { ch: '牛', mean: '双角横张' },
      { ch: '目', mean: '一只竖起来的眼' },
      { ch: '鼎', mean: '三足两耳，煮牲之器' }
    ].filter(function (it) {
      /* 数据集里没有的字直接剔掉：宁可少轮几个，也不要空着一块骨 */
      return !!(App.museumTex.glyphRec && App.museumTex.glyphRec(it.ch));
    });
    if (!HERO_CYCLE.length) { HERO_CYCLE = [{ ch: '卜', mean: '灼骨所现之兆' }]; }

    var HERO_TW = 1024;
    var HERO_TH = Math.round(HERO_TW * SLAB_RATIO);
    var heroBase = App.museumTex.slabBase({
      w: HERO_TW, h: HERO_TH, seed: 0x5117, cracks: true
    });

    var HERO_SIZE = 2.2;
    var heroSlab = makeSlab(HERO_CYCLE[0].ch, {
      size: HERO_SIZE, texSize: HERO_TW, ratio: SLAB_RATIO,
      castShadow: false, cracks: true, base: heroBase
    });
    heroSlab.mesh.position.y = 0.95 + (HERO_SIZE * SLAB_RATIO) / 2;
    heroSlab.mesh.rotation.x = 0.06;
    hero.add(heroSlab.mesh);
    heroSlab.mesh.userData.kind = 'hero';
    heroSlab.mesh.userData.zone = 'gallery';

    /* 骨版在台面上的接地影：比实时阴影柔，也省一遍 shadow pass */
    var heroShadowMtl = new T.MeshBasicMaterial({
      map: contactShadowTex(), transparent: true, depthWrite: false, opacity: 0.85
    });
    var heroShadow = new T.Mesh(new T.PlaneGeometry(2.55, 1.15), heroShadowMtl);
    heroShadow.rotation.x = -Math.PI / 2;
    heroShadow.position.y = 0.958;
    hero.add(heroShadow);

    /* 光柱：极淡的一柱，把中央那件罩住。
       不是特效，是把"这里只有一件东西被照亮"讲清楚。 */
    /* 展台前的说明牌：字换了它就重写一行（同一张画布重画，不新建贴图） */
    var heroPlateCv = App.museumTex.canvas(512, 128);
    var heroPlateTex = canvasTex(heroPlateCv, { srgb: true });
    function paintHeroPlate(item) {
      var c = heroPlateCv.getContext('2d');
      c.clearRect(0, 0, 512, 128);
      c.fillStyle = 'rgba(18,13,9,0.92)';
      c.fillRect(0, 0, 512, 128);
      c.strokeStyle = 'rgba(165,129,71,0.55)';
      c.lineWidth = 2;
      c.strokeRect(6, 6, 500, 116);
      c.textAlign = 'center';
      c.textBaseline = 'middle';

      /* 一行：字 · 一句话。字多的句子缩字号，不要撑出铜牌 */
      var line = (item.now || item.ch) + ' · ' + item.mean;
      var fs = 44;
      var fam = '"Songti SC","Noto Serif SC",serif';
      c.font = '600 ' + fs + 'px ' + fam;
      while (fs > 26 && c.measureText(line).width > 462) {
        fs -= 2;
        c.font = '600 ' + fs + 'px ' + fam;
      }
      c.fillStyle = '#e8dcc2';
      c.fillText(line, 256, 50);
      c.fillStyle = 'rgba(232,220,194,.62)';
      c.font = '400 21px ' + fam;
      c.fillText('字形取自甲骨字形数据集 · 点选可看展签', 256, 94);
      heroPlateTex.needsUpdate = true;
    }
    paintHeroPlate(HERO_CYCLE[0]);

    var heroPlate = new T.Mesh(
      new T.PlaneGeometry(2.3, 0.575),
      std({ map: heroPlateTex, roughness: 0.6, metalness: 0.1 })
    );
    /* 铜牌往前下方挪：骨版放大到 2.2 之后，原来那个位置会被骨版下缘压住。 */
    heroPlate.position.set(0, 1.26, 2.62);
    heroPlate.rotation.x = -0.30;
    hero.add(heroPlate);

    /* ---------- 换字的机制 ----------
       骨版是同一块几何，变的是"刻的字"。所以不必换模型，
       只要在骨面材质里多挂一张贴图，用 uMix 把新旧两张混一下：
       旧字化开、新字凝住，中间没有"啪"地一跳。

       ⚠ 只在 three r149 的 map_fragment 上做过；换 three 版本时
       这一步可能匹配不到，匹配不到就退化成硬切（字照样会换），不会崩。 */
    var heroFade = { uMapB: { value: null }, uMix: { value: 0 } };
    (function patchHeroFade() {
      var mtl = heroSlab.mats[0];
      heroFade.uMapB.value = mtl.map;
      mtl.onBeforeCompile = function (sh) {
        sh.uniforms.uMapB = heroFade.uMapB;
        sh.uniforms.uMix = heroFade.uMix;
        sh.fragmentShader = 'uniform sampler2D uMapB;\nuniform float uMix;\n' +
          sh.fragmentShader.replace(
            'vec4 sampledDiffuseColor = texture2D( map, vUv );',
            'vec4 sampledDiffuseColor = mix( texture2D( map, vUv ), texture2D( uMapB, vUv ), uMix );'
          );
      };
      mtl.needsUpdate = true;
    })();

    var heroIdx = 0;
    var heroWait = 0;          /* 距离上一次换字过了多久 */
    var heroFading = -1;       /* <0：没在过渡；>=0：已过渡的秒数 */
    var heroNext = null;       /* 下一张字面（提前画好，别在过渡时抢帧） */
    var HERO_HOLD = 6.4;       /* 一个字停多久 */
    var HERO_XFADE = 0.62;     /* 化开用多久 */

    function heroTexOf(ch) {
      var t = App.museumTex.slabTextures(ch, { w: HERO_TW, h: HERO_TH, base: heroBase });
      return {
        ch: ch,
        map: canvasTex(t.map, { srgb: true, aniso: 8 }),
        bump: canvasTex(t.bump, { aniso: 4 })
      };
    }

    function heroAhead() {
      if (heroNext) { return; }
      heroNext = heroTexOf(HERO_CYCLE[(heroIdx + 1) % HERO_CYCLE.length].ch);
    }

    function heroStartSwap() {
      heroAhead();
      heroFade.uMapB.value = heroNext.map;
      heroFade.uMix.value = 0;
      heroFading = 0;
      heroIdx = (heroIdx + 1) % HERO_CYCLE.length;
    }

    function heroCommit() {
      var mtl = heroSlab.mats[0];
      var oldMap = mtl.map, oldBump = mtl.bumpMap;
      mtl.map = heroNext.map;
      mtl.bumpMap = heroNext.bump;
      mtl.needsUpdate = true;
      heroFade.uMapB.value = mtl.map;
      heroFade.uMix.value = 0;
      heroFading = -1;
      heroWait = 0;
      /* 旧的两张图要释放：每 6 秒换一次，不释放就是一直往上漏显存 */
      if (oldMap && oldMap !== mtl.map) { oldMap.dispose(); }
      if (oldBump && oldBump !== mtl.bumpMap) { oldBump.dispose(); }
      heroSlab.map = mtl.map;
      heroSlab.bump = mtl.bumpMap;
      heroSlab.mesh.userData.char = HERO_CYCLE[heroIdx].ch;
      /* 铜牌等字真正刻上去再换：先换牌后刻字，中间那半秒就是"牌上说日、骨上是卜" */
      paintHeroPlate(HERO_CYCLE[heroIdx]);
      heroNext = null;
      /* 换完再画下一张 —— 过渡那一帧不抢时间 */
      setTimeout(heroAhead, 700);
    }
    setTimeout(heroAhead, 900);

    /* ---------- 六个展区入口 ---------- */
    var portals = [];
    var pickables = [];

    var portalFrameMtl = std({ color: 0x2a1d12, roughness: 0.55, metalness: 0.28, envMapIntensity: 0.8 });
    /* 门所在的隔墙。没有它，门框就是悬在空中的两片板 ——
       有了这道墙，门才成为"墙上开的一个洞"，人一眼就知道往哪走。 */
    var partMtl = std({ color: 0x291c11, roughness: 0.86, metalness: 0.06, envMapIntensity: 0.30 });

    ZONE_DEF.forEach(function (z) {
      var g = new T.Group();
      var a = z.angle * Math.PI / 180;
      g.position.set(Math.sin(a) * HALL_R, 0, Math.cos(a) * HALL_R);
      g.rotation.y = a + Math.PI;
      hall.add(g);

      var PW = 4.5, PH = 5.4, PD = 0.62;

      /* 隔墙：宽 7.4、高 7.4 —— 只做"门所在的这面墙"，
         不做通顶的隔断。留着上方，柱廊与穹顶才看得见，空间才有进深。 */
      var part = new T.Mesh(new T.BoxGeometry(7.4, 7.4, 0.36), partMtl);
      part.position.set(0, 3.7, -0.72);
      part.receiveShadow = true;
      g.add(part);

      /* 门楣上的一线灯：把门的轮廓从暗墙里托出来（自发光，不占灯位） */
      var strip = new T.Mesh(
        new T.BoxGeometry(5.4, 0.05, 0.1),
        new T.MeshBasicMaterial({ color: 0xffdcb0, transparent: true, opacity: 0.55 })
      );
      strip.position.set(0, PH + 0.62, -0.5);
      g.add(strip);

      var pierGeo = new T.BoxGeometry(0.46, PH, PD);
      [-1, 1].forEach(function (s) {
        var pier = new T.Mesh(pierGeo, portalFrameMtl);
        pier.position.set(s * (PW / 2 - 0.23), PH / 2, 0);
        pier.castShadow = !low;
        pier.receiveShadow = true;
        pier.userData = { kind: 'portal', zone: z.id };
        g.add(pier);
        pickables.push(pier);
      });
      var lintel = new T.Mesh(new T.BoxGeometry(PW, 0.44, PD), portalFrameMtl);
      lintel.position.set(0, PH + 0.22, 0);
      lintel.castShadow = !low;
      lintel.userData = { kind: 'portal', zone: z.id };
      g.add(lintel);
      pickables.push(lintel);

      var sill = new T.Mesh(new T.BoxGeometry(PW, 0.16, PD + 0.5), portalFrameMtl);
      sill.position.set(0, 0.08, 0.18);
      sill.userData = { kind: 'portal', zone: z.id };
      g.add(sill);
      pickables.push(sill);

      /* 门内的"气"：既是视觉上的开口，也是拾取面 */
      var veil = new T.Mesh(
        new T.PlaneGeometry(PW - 0.5, PH + 0.1),
        new T.MeshBasicMaterial({
          map: veilTex(z.accent), transparent: true,
          depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending
        })
      );
      veil.position.set(0, PH / 2 + 0.05, -0.02);
      veil.userData = { kind: 'portal', zone: z.id };
      g.add(veil);
      pickables.push(veil);

      /* 门内再压一层暗：没有这层，门外墙的亮面会从洞里透出来，
         门就变成一块磨砂玻璃。有了它门才是"通往暗处"的开口。 */
      var throat = new T.Mesh(
        new T.PlaneGeometry(PW - 0.4, PH),
        new T.MeshBasicMaterial({ color: 0x0b0704, side: T.DoubleSide })
      );
      throat.position.set(0, PH / 2, -1.35);
      g.add(throat);

      /* 门前地上的光斑 */
      var spill = new T.Mesh(
        new T.PlaneGeometry(5.4, 3.2),
        new T.MeshBasicMaterial({
          map: spillTex(z.accent), transparent: true, depthWrite: false,
          blending: T.AdditiveBlending
        })
      );
      spill.rotation.x = -Math.PI / 2;
      spill.position.set(0, 0.016, 1.5);
      g.add(spill);

      /* 竖排展区名：中式展签的写法。
         用不吃光的材质 —— 展签本来就该自己亮着，不能靠大厅那盏顶灯照。 */
      var plateCv = App.museumTex.canvas(256, 1024);
      var pctx = plateCv.getContext('2d');
      pctx.fillStyle = '#1b130b';
      pctx.fillRect(0, 0, 256, 1024);
      pctx.strokeStyle = 'rgba(165,129,71,.55)';
      pctx.lineWidth = 3;
      pctx.strokeRect(10, 10, 236, 1004);
      var nameCv = App.museumTex.textCanvas(z.name, {
        w: 236, h: 900, vertical: true, size: 74,
        color: '#efe4cc', tracking: 1.34
      });
      pctx.drawImage(nameCv, 10, 60);
      var plaque = new T.Mesh(
        new T.PlaneGeometry(0.78, 3.12),
        new T.MeshBasicMaterial({ map: canvasTex(plateCv, { srgb: true, aniso: 8 }) })
      );
      plaque.position.set(-(PW / 2 + 0.62), 2.9, -0.52);
      plaque.userData = { kind: 'portal', zone: z.id };
      g.add(plaque);
      pickables.push(plaque);

      /* 门楣上的字形徽记：贴在隔墙上，像刻上去的一块字 */
      var badge = new T.Mesh(
        new T.PlaneGeometry(1.05, 1.05),
        new T.MeshBasicMaterial({
          map: glyphBadgeTex(z.glyph, '#f4e7cc'), transparent: true, depthWrite: false
        })
      );
      badge.position.set(0, PH + 1.24, -0.52);
      g.add(badge);

      portals.push({ def: z, group: g, veil: veil, plaque: plaque });
    });

    /* ============================================================
       甲骨文展厅（同一个渲染器里的另一个组）
       ============================================================ */
    var gal = new T.Group();
    gal.position.set(0, 0, GAL_Z);
    gal.visible = false;
    scene.add(gal);

    /* 环厅的几何常量：十二件展品绕的圆。
       原来写在 EXHIBITS.forEach 之前（下面 700 多行处），
       但地面嵌线、弧形壁、展品背光都要用，所以提到展厅开头统一定义。 */
    var RING_R = 7.9, RING_CZ = -5.6;

    var galW = 26, galD = 22, galH = 8.4;
    /* 地面：和大厅同一张磨光石。原来是 std({color:0x1d1510}) 一块纯色，
       26×22 的空间里没有接缝、没有石脉，纵深完全靠雾和光斑撑 ——
       所以远看像一面褐色的墙，不像地。
       ⚠ metalness 不要给高：暗场里没有环境图，金属度一高漫反射就被压掉，
       贴图再亮也是一片黑（这一版第一次就踩了，整块地面黑得像坑）。 */
    var galFloorMtl = std({
      map: canvasTex(stoneTex(), { srgb: true, aniso: 8 }),
      color: 0xf2e9dc,
      roughness: 0.24, metalness: 0.10, envMapIntensity: 1.0
    });
    var galFloor = new T.Mesh(new T.BoxGeometry(galW, 0.3, galD), galFloorMtl);
    galFloor.position.set(0, -0.15, -galD / 2 + 4);
    galFloor.receiveShadow = true;
    gal.add(galFloor);

    /* 地面铜嵌线：两道同心圆，把视线收到中庭。
       和主厅那两道是同一套语言，进来不会觉得换了个地方。
       ⚠ 圆心是 (0, RING_CZ)。第一版写成 RING_CZ + RING_R，那是圆周上的
       一个点（画面最前缘），铜线整个跑到观众脚底下去了。 */
    [2.2, 3.4].forEach(function (r, i) {
      var ring = new T.Mesh(
        new T.TorusGeometry(r, i ? 0.026 : 0.040, 6, 84),
        std({ color: 0x9a7a45, roughness: 0.42, metalness: 0.75, envMapIntensity: 1.2 })
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.set(0, 0.014, RING_CZ);
      gal.add(ring);
    });

    var galWallMtl = std({ color: 0x171009, roughness: 0.92, metalness: 0.05 });
    var backWall = new T.Mesh(new T.BoxGeometry(galW, galH, 0.4), galWallMtl);
    backWall.position.set(0, galH / 2, -galD + 4);
    gal.add(backWall);
    [-1, 1].forEach(function (s) {
      var sw = new T.Mesh(new T.BoxGeometry(0.4, galH, galD), galWallMtl);
      sw.position.set(s * galW / 2, galH / 2, -galD / 2 + 4);
      gal.add(sw);
    });
    var galCeil = new T.Mesh(
      new T.PlaneGeometry(galW, galD),
      std({ color: 0x0d0906, roughness: 1, side: T.DoubleSide })
    );
    galCeil.rotation.x = Math.PI / 2;
    galCeil.position.set(0, galH, -galD / 2 + 4);
    gal.add(galCeil);

    /* ------------------------------------------------------------------
       环形背屏
       十二件展品绕的圆心在 z = -5.6、半径 7.9，最靠里的那件离背墙还有
       四米半 —— 也就是说这一圈背后原本什么都没有，环是"飘"在暗里的。
       补一圈内壁，展品才有壁龛，厅才真的成其为圆厅。
       照相机最远能拉到 10.4，仍在壁内，所以做满 360° 不开豁口。
       ------------------------------------------------------------------ */
    var ARC_R = 11.2;
    /* 墙要高到天花板（galH 8.4）。第一次只做到 6.9，
       结果屏幕上方露出一条横向的黑色缝隙，整面墙像是半截断的。 */
    var arcWall = new T.Mesh(
      new T.CylinderGeometry(ARC_R, ARC_R, galH, 72, 1, true),
      std({ color: 0x1b130c, roughness: 0.9, metalness: 0.06, side: T.BackSide })
    );
    arcWall.position.set(0, galH / 2, RING_CZ);
    gal.add(arcWall);

    /* 踢脚：一圈略深的窄带，把壁面和地面压实（否则墙是"插"进地里的） */
    var skirt = new T.Mesh(
      new T.CylinderGeometry(ARC_R - 0.02, ARC_R - 0.02, 0.30, 72, 1, true),
      std({ color: 0x120c07, roughness: 0.95, metalness: 0.05, side: T.BackSide })
    );
    skirt.position.set(0, 0.15, RING_CZ);
    gal.add(skirt);

    /* 顶部灯槽：一圈暗金细带。原来抬头是一整块 0x0d0906 的纯黑，
       有了这条带，视线往上时才有一个"收口"。自发光，不参与照明。 */
    var cove = new T.Mesh(
      new T.CylinderGeometry(ARC_R - 0.06, ARC_R - 0.06, 0.15, 72, 1, true),
      new T.MeshBasicMaterial({
        /* 0.46 太亮：竖屏机位会正好看到这条带横切在画面上部，很扎眼。
           灯槽只要"隐隐有一条"就够，不能当发光条看。 */
        color: 0xd9a869, transparent: true, opacity: 0.20,
        side: T.BackSide, fog: false, depthWrite: false
      })
    );
    cove.position.set(0, galH - 0.26, RING_CZ);
    gal.add(cove);

    /* 壁柱：十二根，正好落在十二件展品的角度上 —— 一龛一柱，形成节拍 */
    var pilMtl = std({ color: 0x342619, roughness: 0.78, metalness: 0.10 });
    var pilGeo = new T.BoxGeometry(0.36, 6.7, 0.30);
    for (var pi = 0; pi < 12; pi++) {
      var pa = -Math.PI / 2 + (pi / 12) * Math.PI * 2;
      var pil = new T.Mesh(pilGeo, pilMtl);
      pil.position.set(
        Math.sin(pa) * (ARC_R - 0.17),
        3.35,
        RING_CZ + Math.cos(pa) * (ARC_R - 0.17)
      );
      pil.rotation.y = pa;
      gal.add(pil);
    }

    /* 中庭：一束顶光 + 地上一圈光。
       这里原来吊着「表谱骨版」，拆掉之后圆心就是个黑洞 ——
       环做得越完整，越显得中间空。不摆新展品（会抢十二件的戏），
       只用一束柔和的光锥把视线收回来。 */
    /* 这里本来试过一束可见的光锥（openEnded 圆柱 + 加法渐变）。
       试了两版都是同样的毛病：锥面上那条从顶到地的斜边在暗场里太清楚，
       读起来是一顶半透明的帐篷罩在厅里，而不是空气里的光。
       做真正的体积光要单独一遍 raymarch，为这点氛围不值当 ——
       改成只有地面一圈光：光落在石地上，空气里那截干脆不画。 */
    var beamPool = new T.Mesh(
      new T.PlaneGeometry(7.2, 7.2),
      new T.MeshBasicMaterial({
        map: washTex(), transparent: true, depthWrite: false,
        blending: T.AdditiveBlending, opacity: 0.38, fog: false
      })
    );
    beamPool.rotation.x = -Math.PI / 2;
    beamPool.position.set(0, 0.022, RING_CZ);
    gal.add(beamPool);

    /* 展厅主光：一盏洗墙灯，压低到只把展品那一条墙带亮起来 */
    var galKey = new T.SpotLight(0xffe2bd, 0.88, 30, 0.95, 0.95, 0.8);
    galKey.position.set(0, 7.4, -6);
    galKey.target.position.set(0, 1.9, -9);
    gal.add(galKey, galKey.target);

    var galRim = new T.SpotLight(0xffd0a0, 0.28, 34, 1.1, 1.0, 0.7);
    galRim.position.set(0, 5.6, 4);
    galRim.target.position.set(0, 2.2, -8);
    gal.add(galRim, galRim.target);

    /* 厅内顶光：只负责把地面和展台脚下那一圈照出来。
       上面两盏都冲着墙打，地面原本全靠半球光撑着；
       地面换成石面贴图之后整块沉成黑的，人站在上面像踩空。 */
    var galDeck = new T.SpotLight(0xffdcae, 2.6, 24, 0.60, 0.88, 0.95);
    galDeck.position.set(0, 7.6, RING_CZ);
    galDeck.target.position.set(0, 0, RING_CZ);
    gal.add(galDeck, galDeck.target);

    var shadowTex = contactShadowTex();
    var shadowMtl = new T.MeshBasicMaterial({
      map: shadowTex, transparent: true, depthWrite: false, opacity: 0.9
    });

    /* 展品：甲骨文知识厅的十二件陈列 —— 内容写在 js/museum/oracle-hall.js。
       原来这里摆的是十二个常用字（日 月 雨 山 川 泉 木 林 牛 鱼 门 鼎），
       跟着王邑地图的五个景物分区走，展签只写"一轮圆日"这类释义。
       那是一条识字的线：走完一圈认了十二个字，却不知道甲骨从哪来、怎么卜、
       问什么、谁认出来的。现在换成四段陈列（卜材 · 卜辞 · 文字 · 发现）。
       ⚠ 数据文件漏加载时退回旧的一套，宁可少讲，不要让整厅空成一个台座阵。 */
    var HALL = App.oracleHall;
    var EXHIBITS = (HALL && HALL.items && HALL.items.length) ? HALL.items : [
      { ch: '日', sec: '卜材', tag: '天象', title: '日' },
      { ch: '月', sec: '卜材', tag: '天象', title: '月' },
      { ch: '雨', sec: '卜辞', tag: '天象', title: '雨' },
      { ch: '山', sec: '卜辞', tag: '山川', title: '山' },
      { ch: '川', sec: '卜辞', tag: '山川', title: '川' },
      { ch: '泉', sec: '卜辞', tag: '山川', title: '泉' },
      { ch: '木', sec: '文字', tag: '草木', title: '木' },
      { ch: '林', sec: '文字', tag: '草木', title: '林' },
      { ch: '牛', sec: '文字', tag: '禽兽', title: '牛' },
      { ch: '鱼', sec: '发现', tag: '禽兽', title: '鱼' },
      { ch: '门', sec: '发现', tag: '器物', title: '门' },
      { ch: '鼎', sec: '发现', tag: '器物', title: '鼎' }
    ];

    /* 十二件展品沿一圈摆开（环厅）：
       人站在厅中央转头看，一件一件转过来；不再是一排挤在正前方。
       RING_R / RING_CZ 已在展厅开头定义。
       ⚠ 不要退回 CylinderGeometry 做展台。圆台在暗场里没有一条清晰的棱，
       近看就是一根柱；方座有四个面和四条棱，灯一打才立得住。
       也和"骨版"这种方正的展品对得上形。 */
    var pedMtl = std({ color: 0x4a4136, roughness: 0.5, metalness: 0.24, envMapIntensity: 0.8 });
    var pedBaseGeo = new T.BoxGeometry(0.94, 0.13, 0.94);
    var pedBodyGeo = new T.BoxGeometry(0.64, 0.90, 0.64);
    var pedTopGeo = new T.BoxGeometry(0.80, 0.07, 0.80);
    var pedBandGeo = new T.BoxGeometry(0.68, 0.035, 0.68);
    var pedBandMtl = std({ color: 0x8d6f3e, roughness: 0.38, metalness: 0.82, envMapIntensity: 1.1 });
    /* 座面顶到 1.10；骨版高约 1.42（几何居中），所以中心落在 1.81。
       原来是 2.12 —— 骨版底离座面还有 0.24，看上去是浮在座上。 */
    var SEAT_Y = 1.10;
    var SLAB_H = 1.42;
    var exhibits = [];
    var n = EXHIBITS.length;

    EXHIBITS.forEach(function (e, i) {
      /* 均分一圈；第一件放在正前方（-z 方向），其余顺时针排开 */
      var a = -Math.PI / 2 + (i / n) * Math.PI * 2;
      var gx = Math.sin(a) * RING_R;
      var gz = RING_CZ + Math.cos(a) * RING_R;
      var face = a + Math.PI;   /* 每件都朝圆心 */

      var ped = new T.Mesh(pedBaseGeo, pedMtl);
      ped.position.set(gx, 0.065, gz);
      ped.rotation.y = face;
      ped.userData = { kind: 'exhibit', char: e.ch };
      gal.add(ped);
      pickables.push(ped);

      var pbody = new T.Mesh(pedBodyGeo, pedMtl);
      pbody.position.set(gx, 0.13 + 0.45, gz);
      pbody.rotation.y = face;
      gal.add(pbody);

      var pband = new T.Mesh(pedBandGeo, pedBandMtl);
      pband.position.set(gx, 1.03, gz);
      pband.rotation.y = face;
      gal.add(pband);

      var base = new T.Mesh(pedTopGeo, pedMtl);
      base.position.set(gx, SEAT_Y - 0.035, gz);
      base.rotation.y = face;
      gal.add(base);

      var slab = makeSlab(e.ch, { size: SLAB_H, texSize: 512 });
      slab.mesh.position.set(gx, SEAT_Y + SLAB_H * 0.5, gz);
      slab.mesh.rotation.y = face;
      /* 不前倾。原来 -0.05 是为了让字朝向观众，但骨版下沿会往外探出，
         把台座上的名签压掉半截。正立之后字仍然正对圆心。 */
      slab.mesh.rotation.x = 0;
      slab.mesh.userData = { kind: 'exhibit', char: e.ch, index: i };
      gal.add(slab.mesh);
      pickables.push(slab.mesh);

      var sh = new T.Mesh(new T.PlaneGeometry(1.5, 0.9), shadowMtl);
      sh.rotation.x = -Math.PI / 2;
      sh.position.set(gx, 0.006, gz);
      gal.add(sh);

      /* 名签：今字 + 两字短题，贴在台座正面（跟着台座一起转）。
         原来是"深底骨字"的小黑牌（0.42×0.21）—— 贴在深色座上就是一块黑，
         字也小到看不清。改成骨白纸 + 朱砂细边，尺寸放大到 0.56×0.28。
         右侧原来是分区名（天象/禽兽虫鱼，最多四个字），现在换成两字短题
         （卜骨 / 灼兆 / 甲骨 / 田猎…），一眼看得出这件讲的是什么，不必点开。 */
      var tagCv = App.museumTex.canvas(320, 160);
      var tctx = tagCv.getContext('2d');
      tctx.fillStyle = '#f3e9d5';
      tctx.fillRect(0, 0, 320, 160);
      tctx.strokeStyle = 'rgba(204,82,59,.40)';
      tctx.lineWidth = 4;
      tctx.strokeRect(8, 8, 304, 144);
      tctx.textAlign = 'center';
      tctx.textBaseline = 'middle';
      tctx.fillStyle = '#2b2318';
      tctx.font = '600 76px "Songti SC","Noto Serif SC",serif';
      tctx.fillText(e.ch, 98, 82);
      tctx.fillStyle = 'rgba(204,82,59,.42)';   /* 中缝 */
      tctx.fillRect(172, 40, 2, 80);
      tctx.fillStyle = '#6b5a43';
      tctx.font = '400 30px "Songti SC","Noto Serif SC",serif';
      tctx.fillText(e.tag || e.zone || '', 246, 84);
      var tag = new T.Mesh(
        new T.PlaneGeometry(0.62, 0.31),
        new T.MeshBasicMaterial({
          map: canvasTex(tagCv, { srgb: true }), transparent: true,
          /* 名字这一层是"纸"，不是被照亮的石头：跟着色调映射一起压暗，
             远看就只剩一块灰。关掉它，纸才是纸。 */
          toneMapped: false
        })
      );
      /* 方座半宽 0.32，签面往外推 0.34 —— 再远就离开座面浮在空中了 */
      tag.position.set(gx + Math.sin(face) * 0.34, 0.50, gz + Math.cos(face) * 0.34);
      tag.rotation.y = face;
      gal.add(tag);

      /* 洗墙光斑：贴在这件展品背后的内壁上，让每件骨版都有自己的一圈光。
         半径比壁柱内沿再收 0.2，压住柱子的边不致于穿出来。 */
      var wash = new T.Mesh(
        new T.PlaneGeometry(2.2, 3.2),
        new T.MeshBasicMaterial({
          map: washTex(), transparent: true, depthWrite: false,
          blending: T.AdditiveBlending, opacity: 0.40, fog: false
        })
      );
      wash.position.set(
        Math.sin(a) * (ARC_R - 0.26),
        2.55,
        RING_CZ + Math.cos(a) * (ARC_R - 0.26)
      );
      wash.rotation.y = face;
      gal.add(wash);

      exhibits.push({
        data: e, mesh: slab.mesh, mats: slab.mats, baseY: 2.12,
        ped: ped, cap: base
      });
    });

    /* 段名：十二件按四段连续排开（卜材 · 卜辞 · 文字 · 发现），
       在每一段中间、靠墙那一侧的墙面上刻一个淡色的段名。
       远看是"厅里分了段"，走近才知道刻的是什么 —— 不做成招牌，做成一刀的刻痕。
       ⚠ 段的起止从展品数据里现算，不写死下标：以后换一件、加一段都不用改这里。
       ⚠ 角度取 floor(mid) + 0.5：整数位上正好是壁柱，牌子会刻在柱子上。 */
    (function sectionNames() {
      var SPANS = [];
      EXHIBITS.forEach(function (e, i) {
        var nm = e.sec || '';
        var last = SPANS[SPANS.length - 1];
        if (!last || last.name !== nm) { SPANS.push({ name: nm, from: i, to: i }); }
        else { last.to = i; }
      });
      SPANS.forEach(function (sp) {
        if (!sp.name) { return; }
        var idx = Math.floor((sp.from + sp.to) / 2) + 0.5;
        var a = -Math.PI / 2 + (idx / n) * Math.PI * 2;
        var cv = App.museumTex.textCanvas(sp.name, {
          w: 112, h: 112 * sp.name.length, vertical: true, size: 72,
          color: 'rgba(232,212,178,0.94)', tracking: 1.42
        });
        var tx = new T.Mesh(
          new T.PlaneGeometry(0.58, 0.58 * sp.name.length),
          new T.MeshBasicMaterial({
            map: canvasTex(cv, { srgb: true }),
            transparent: true, opacity: 0.22, depthWrite: false, fog: false
          })
        );
        tx.position.set(
          Math.sin(a) * (ARC_R - 0.30),
          4.35,
          RING_CZ + Math.cos(a) * (ARC_R - 0.30)
        );
        tx.rotation.y = a + Math.PI;
        gal.add(tx);
      });
    })();

    /* 选中时才会亮的一盏追踪灯 */
    var pickSpot = new T.SpotLight(0xfff0d6, 0, 14, 0.34, 0.7, 0.9);
    pickSpot.position.set(0, 6.6, -8.5);
    gal.add(pickSpot, pickSpot.target);

    /* 展柜两侧的"厅"字牌与说明墙 */
    var introCv = App.museumTex.canvas(1024, 256);
    var ic = introCv.getContext('2d');
    ic.textAlign = 'center';
    ic.textBaseline = 'middle';
    ic.fillStyle = 'rgba(232,220,194,.86)';
    ic.font = '600 64px "Songti SC","Noto Serif SC",serif';
    ic.fillText('甲 骨 文 展 厅', 512, 78);
    ic.fillStyle = 'rgba(232,220,194,.52)';
    ic.font = '400 30px "Songti SC","Noto Serif SC",serif';
    ic.fillText('四段陈列：卜材 · 卜辞 · 文字 · 发现', 512, 150);
    ic.fillStyle = 'rgba(232,220,194,.28)';
    ic.font = '400 21px "Songti SC","Noto Serif SC",serif';
    ic.fillText('骨面字形取自甲骨字形数据集（CC BY 4.0）', 512, 208);
    var intro = new T.Mesh(
      new T.PlaneGeometry(7.2, 1.8),
      new T.MeshBasicMaterial({ map: canvasTex(introCv, { srgb: true }), transparent: true })
    );
    /* 原本为了给中庭那件"表谱骨版"让位，这块标题墙被抬到 7.0（贴着顶棚）。
       表谱骨版拆掉之后，它自己回到 5.9 —— 一进门就能读到，不用仰头。 */
    intro.position.set(0, 5.9, -galD + 4 + 0.24);
    gal.add(intro);

    /* 中庭原来还挂着一件「表谱骨版」（吊索 + 细框 + 十二字排四列）。
       它在厅中央抢掉整块视线，又把标题墙挡在背后，已按反馈拆掉。
       行款形制这件事没有丢 —— 知识石板「一片卜辞的结构」和环上的
       「卜辞拓片」都在讲，比半空中一块悬着的图更清楚。 */

    /* ============================================================
       GLB 模型接入
       ------------------------------------------------------------
       模型是 Blender 4.5 生成的（tools/build_models.py），格式 GLB。
       失败也没关系：程序化的骨版与台座还在原地，加载到了才替换 ——
       所以 file:// 双击、或模型请求被拦时，场景照常可看可用。
       ============================================================ */
    var MODELS = {
      bone: 'assets/models/oracle-bone.glb',
      plastron: 'assets/models/turtle-plastron.glb',
      pedestal: 'assets/models/pedestal.glb',
      case: 'assets/models/display-case.glb',
      arch: 'assets/models/entrance-arch.glb'
    };
    var modelCache = {};
    /* 0 未试 1 成功 2 失败 */
    var modelState = { bone: 0, plastron: 0, pedestal: 0, case: 0, arch: 0 };

    function getModel(key, cb) {
      try { (window.__mglb = window.__mglb || []).push(key); } catch (e0) {}
      if (modelCache[key]) { cb(null, modelCache[key]); return; }
      if (!App.museumGlb) { modelState[key] = 2; cb(new Error('没有 GLB 读取器')); return; }
      App.museumGlb.load(MODELS[key], T, function (err, g) {
        if (err) { modelState[key] = 2; cb(err); return; }
        modelCache[key] = g;
        modelState[key] = 1;
        cb(null, g);
      });
    }

    /* 中央那件：换成 Blender 的骨版，正面仍然贴我们的刻辞 */
    var heroHolder = null;
    getModel('bone', function (err, g) {
      if (err || !g || !heroSlab) { return; }
      var holder = new T.Group();
      var inst = g.clone(true);
      inst.traverse(function (o) {
        if (!o.isMesh) { return; }
        var nm = (o.material && o.material.name) || '';
        if (/side/i.test(nm)) {
          o.material = std({
            color: 0xa8977a, roughness: 0.86, metalness: 0.02, envMapIntensity: 0.35
          });
        } else {
          o.material = heroSlab.mats[0];
        }
        o.userData = { kind: 'hero' };
        pickables.push(o);
      });
      holder.add(inst);
      holder.rotation.x = 0.06;
      holder.scale.setScalar(2.2);
      /* 落座：拿模型自己的包围盒把底面对到台面上（0.95）。
         模型换了、尺寸改了都不用再手调这个数，也不会浮在半空。 */
      holder.updateMatrixWorld(true);
      var hbox = new T.Box3().setFromObject(inst);
      holder.position.set(0, 0.95 - hbox.min.y, 0);
      hero.add(holder);
      heroHolder = holder;
      /* 程序化那版收起来（不销毁：GLB 万一被换掉还能显回来） */
      heroSlab.mesh.visible = false;
    });

    /* 展厅的台座：换成 Blender 的三段收分圆台 */
    getModel('pedestal', function (err, g) {
      if (err || !g) { return; }
      exhibits.forEach(function (ex) {
        var inst = g.clone(true);
        inst.position.set(ex.mesh.position.x, 0, ex.mesh.position.z);
        inst.traverse(function (o) {
          if (o.isMesh) {
            o.userData = { kind: 'exhibit', char: ex.data.ch };
            pickables.push(o);
            if (ex.mats[0]) { o.material = pedMtl; }
          }
        });
        gal.add(inst);
        ex.ped.visible = false;
        ex.cap.visible = false;
        ex.ped = inst;
      });
    });

    /* 入口门廊：Blender 做的两柱一楣，立在圆厅正后方（观众进来的那一面）。
       默认视角看不到它 —— 这是有意的：它是"你从哪儿进来"的交代，
       转过去才看见，也顺便给这个圆形大厅一个方位参照。
       圆厅的顶光只罩住中间十几米，墙根本来就暗，所以门洞里塞一片暖光、
       门前铺一道落地的光斑：柱子成剪影，门是亮的，一眼就懂这是入口。 */
    getModel('arch', function (err, g) {
      if (err || !g) { return; }
      var inst = g.clone(true);
      inst.position.set(0, 0, 21.6);
      inst.scale.setScalar(1.18);
      inst.traverse(function (o) {
        if (o.isMesh) {
          o.castShadow = false;
          o.receiveShadow = false;
          o.userData = { kind: 'porch' };
        }
      });
      hall.add(inst);

      /* 门洞里的暖光（不透光的发光面，不额外加灯） */
      var pcv = App.museumTex.canvas(256, 256);
      var pc = pcv.getContext('2d');
      var pg = pc.createRadialGradient(128, 150, 6, 128, 150, 140);
      pg.addColorStop(0, 'rgba(255,206,150,.52)');
      pg.addColorStop(0.45, 'rgba(238,168,104,.20)');
      pg.addColorStop(1, 'rgba(220,150,90,0)');
      pc.fillStyle = pg;
      pc.fillRect(0, 0, 256, 256);
      var doorway = new T.Mesh(
        new T.PlaneGeometry(6.4, 6.6),
        new T.MeshBasicMaterial({
          map: canvasTex(pcv, { srgb: true }), transparent: true,
          blending: T.AdditiveBlending, depthWrite: false, opacity: 0.85
        })
      );
      doorway.position.set(0, 3.1, 23.1);
      doorway.rotation.y = Math.PI;      /* 朝厅内 */
      hall.add(doorway);

      /* 门里铺到地上的光 */
      var spill = new T.Mesh(
        new T.PlaneGeometry(9.2, 7.6),
        new T.MeshBasicMaterial({
          map: canvasTex(pcv, { srgb: true }), transparent: true,
          blending: T.AdditiveBlending, depthWrite: false, opacity: 0.5
        })
      );
      spill.rotation.x = -Math.PI / 2;
      spill.rotation.z = Math.PI;
      spill.position.set(0, 0.014, 18.4);
      hall.add(spill);
    });

    /* ============================================================
       门后的三个展区：造字 / 考古 / BOSS
       ------------------------------------------------------------
       三个都是真场景，不是跳到 2D 页：造字区摆构件、考古区挖探方、
       BOSS 区挂名录。正式关卡仍在原来的页面里（由按钮跳过去），
       这样判定与计分一行都不用改。
       ============================================================ */
    var ANX_Z = GAL_Z - 190;    /* -360 */
    var ANX_GAP = 150;

    /* 一盏共用灯：跟着当前展区换位置。灯的个数决定所有材质的着色成本，
       为三个区各开一盏，等于让整个场景永久多付三盏的钱。 */
    var annexKey = new T.SpotLight(0xffe6c4, 0, 42, 0.80, 0.9, 0.85);
    scene.add(annexKey, annexKey.target);

    /* 房间壳：地面 / 三面墙 / 顶 / 一圈地面色光。
       三个区共用同一套尺寸逻辑，只有色与陈设不同。 */
    function roomShell(g, w, d, h, tint) {
      var fl = new T.Mesh(
        new T.BoxGeometry(w, 0.3, d),
        std({ color: 0x201812, roughness: 0.38, metalness: 0.26, envMapIntensity: 0.7 })
      );
      fl.position.set(0, -0.15, -d / 2 + 4);
      fl.receiveShadow = true;
      g.add(fl);

      var wm = std({ color: 0x1c1610, roughness: 0.94, metalness: 0.05 });
      var bw = new T.Mesh(new T.BoxGeometry(w, h, 0.4), wm);
      bw.position.set(0, h / 2, -d + 4);
      g.add(bw);
      [-1, 1].forEach(function (s) {
        var sw = new T.Mesh(new T.BoxGeometry(0.4, h, d), wm);
        sw.position.set(s * w / 2, h / 2, -d / 2 + 4);
        g.add(sw);
      });
      var ce = new T.Mesh(
        new T.PlaneGeometry(w, d),
        std({ color: 0x0c0805, roughness: 1, side: T.DoubleSide })
      );
      ce.rotation.x = Math.PI / 2;
      ce.position.set(0, h, -d / 2 + 4);
      g.add(ce);

      /* 地面上一摊色光：展区靠这一抹色区分，不靠再开一盏灯。
         面积只铺到房间的六成 —— 铺满就会把整间屋子洗成一片 */
      var halo = new T.Mesh(
        new T.PlaneGeometry(w * 0.62, d * 0.62),
        new T.MeshBasicMaterial({
          map: spillTex(tint), transparent: true, depthWrite: false,
          blending: T.AdditiveBlending, opacity: 0.42
        })
      );
      halo.rotation.x = -Math.PI / 2;
      halo.position.set(0, 0.012, -d / 2 + 4);
      g.add(halo);

      /* 墙裙与檐口：两条线就能把层高和进深交代清楚，
         没有它们，墙是一块竖直的渐变背景布。 */
      var trimMtl = std({ color: 0x36281c, roughness: 0.55, metalness: 0.3, envMapIntensity: 0.7 });
      var skirt = new T.Mesh(new T.BoxGeometry(w, 0.28, 0.16), trimMtl);
      skirt.position.set(0, 0.14, -d + 4 + 0.24);
      g.add(skirt);
      var cornice = new T.Mesh(new T.BoxGeometry(w, 0.22, 0.16), trimMtl);
      cornice.position.set(0, h - 0.14, -d + 4 + 0.24);
      g.add(cornice);
      [-1, 1].forEach(function (s2) {
        var sk = new T.Mesh(new T.BoxGeometry(0.16, 0.28, d), trimMtl);
        sk.position.set(s2 * (w / 2 - 0.24), 0.14, -d / 2 + 4);
        g.add(sk);
      });
    }

    /* 土：探方里的土不是"棕色方块"，有颗粒、有湿痕 */
    function soilTex() {
      var S = 256;
      var cv = App.museumTex.canvas(S, S);
      var c = cv.getContext('2d');
      var R = App.museumTex.rng(4242);
      c.fillStyle = '#3a2b1c';
      c.fillRect(0, 0, S, S);
      for (var i = 0; i < 22; i++) {
        var x = R() * S, y = R() * S, r = 8 + R() * 40;
        var g = c.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, R() > 0.5 ? 'rgba(88,66,42,.20)' : 'rgba(20,14,9,.24)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g;
        c.fillRect(x - r, y - r, r * 2, r * 2);
      }
      for (var k = 0; k < 1800; k++) {
        c.fillStyle = 'rgba(150,120,84,' + (0.03 + R() * 0.16).toFixed(3) + ')';
        c.fillRect(R() * S, R() * S, 1 + R() * 2, 1 + R() * 2);
      }
      return cv;
    }

    /* ============================================================
       ① 造字探索区
       ============================================================ */
    var buildG = new T.Group();
    buildG.position.set(0, 0, ANX_Z);
    buildG.visible = false;
    scene.add(buildG);
    roomShell(buildG, 14.5, 13, 6.4, 0x337663);

    var stoneMtl = std({ color: 0x3a2e22, roughness: 0.5, metalness: 0.26, envMapIntensity: 0.8 });
    var bTable = new T.Mesh(new T.CylinderGeometry(1.55, 1.75, 0.74, 40), stoneMtl);
    bTable.position.set(0, 0.37, -2.5);
    bTable.receiveShadow = true;
    buildG.add(bTable);
    var bTop = new T.Mesh(new T.CylinderGeometry(1.6, 1.6, 0.06, 40),
      std({ color: 0x4c3d2d, roughness: 0.3, metalness: 0.34, envMapIntensity: 1.1 }));
    bTop.position.set(0, 0.77, -2.5);
    buildG.add(bTop);

    /* 待刻的骨版：构件摆上来就重刻一次 */
    var work = makeSlab('', { size: 0.98, texSize: 512, castShadow: false });
    work.mesh.position.set(0, 1.62, -2.5);
    work.mesh.rotation.x = -0.05;
    work.mats[0].color.setHex(0xb0a084);
    work.mats[0].roughness = 0.9;
    work.mats[0].envMapIntensity = 0.22;
    work.mesh.userData = { kind: 'work' };
    buildG.add(work.mesh);
    pickables.push(work.mesh);

    /* 台前说明牌：这块牌子就是题面，要能随进度重绘 */
    var bSignCv = App.museumTex.canvas(1024, 300);
    var bSignTex = canvasTex(bSignCv, { srgb: true });

    /* 把一对构件按"左右并置"画成甲骨形；单构件就居中放大 */
    function paintPairGlyph(c, pair, cx, cy, size, color) {
      if (!pair || !pair.length) { return; }
      var one = size * (pair.length > 1 ? 0.86 : 1.25);
      pair.forEach(function (ch, i) {
        var tmp = App.museumTex.canvas(128, 128);
        var ok = false;
        try { ok = App.museumTex.paintGlyph(tmp, ch, { color: color || '#f4e6c8', weight: 2.4 }); } catch (e) { ok = false; }
        if (!ok) { return; }
        var dx = pair.length > 1 ? (i === 0 ? -one * 0.30 : one * 0.30) : 0;
        c.drawImage(tmp, cx + dx - one / 2, cy - one / 2, one, one);
      });
    }

    /* 竖屏（aspect < 0.95）横向只有二十来度视野，横排那一版题面牌
       两端必被裁掉。所以竖屏换一套排版：只留"第几题 / 甲骨字形 / 今字"
       三样，长的说明交给底部（窄屏时搬到了顶部）那条 DOM 任务条。 */
    function signIsNarrow() { return camera.aspect < 0.95; }

    function paintBuildSign(kicker, main, sub, tint, pair, nowChar) {
      var c = bSignCv.getContext('2d');
      c.clearRect(0, 0, 1024, 300);
      c.textAlign = 'center';
      c.textBaseline = 'middle';

      if (signIsNarrow()) {
        /* 竖屏版：kicker 缩短成"第 N/5"，字放大 */
        var k2 = String(kicker || '').match(/第\s*\d+\s*\/\s*\d+/);
        c.fillStyle = 'rgba(232,220,194,.62)';
        c.font = '600 34px "Songti SC","Noto Serif SC",serif';
        c.fillText(k2 ? k2[0] : '造字探索区', 512, 34);

        if (pair && pair.length) {
          paintPairGlyph(c, pair, 392, 150, 150, 'rgba(240,226,200,.96)');
        }
        c.fillStyle = 'rgba(232,220,194,.40)';
        c.font = '400 24px "Songti SC","Noto Serif SC",serif';
        c.fillText('甲骨字形', 392, 258);

        if (nowChar) {
          c.fillStyle = tint || 'rgba(255,226,178,.96)';
          c.font = '600 122px "Songti SC","Noto Serif SC",serif';
          c.fillText(nowChar, 700, 146);
          c.fillStyle = 'rgba(232,220,194,.40)';
          c.font = '400 24px "Songti SC","Noto Serif SC",serif';
          c.fillText('今字', 700, 258);
        }
        bSignTex.needsUpdate = true;
        return;
      }

      c.fillStyle = tint || 'rgba(232,220,194,.92)';
      c.font = '600 54px "Songti SC","Noto Serif SC",serif';
      c.fillText(kicker, 512, 42);

      /* 左：甲骨字形（构件并置）　右：今字 —— 两个都在，才看得懂在拼什么 */
      if (pair && pair.length) {
        paintPairGlyph(c, pair, 330, 168, 118, 'rgba(240,226,200,.96)');
        c.fillStyle = 'rgba(232,220,194,.42)';
        c.font = '400 22px "Songti SC","Noto Serif SC",serif';
        c.fillText('甲骨字形', 330, 246);
      }
      if (nowChar) {
        c.fillStyle = 'rgba(255,226,178,.96)';
        c.font = '600 96px "Songti SC","Noto Serif SC",serif';
        c.fillText(nowChar, 694, 168);
        c.fillStyle = 'rgba(232,220,194,.42)';
        c.font = '400 22px "Songti SC","Noto Serif SC",serif';
        c.fillText('今字', 694, 246);
      }

      c.fillStyle = 'rgba(232,220,194,.62)';
      c.font = '400 28px "Songti SC","Noto Serif SC",serif';
      c.fillText(main, 512, 272);
      if (sub) {
        c.fillStyle = 'rgba(232,220,194,.40)';
        c.font = '400 22px "Songti SC","Noto Serif SC",serif';
        c.fillText(sub, 512, 290);
      }
      bSignTex.needsUpdate = true;
    }
    paintBuildSign('造 字 探 索 区', '把两块构件搬上台面，骨上就会多刻一道', '');
    var bSign = new T.Mesh(
      new T.PlaneGeometry(6.2, 1.82),
      new T.MeshBasicMaterial({ map: bSignTex, transparent: true })
    );
    /* 说明牌就挂在工作台正上方：默认视角一进来就能读到题面，
       原来放在 z=-12.6 的后墙上，要抬头退后才能看见。 */
    bSign.position.set(0, 3.42, -2.5);
    buildG.add(bSign);

    /* 题面牌按"这台机器实际的横向视野"缩一次。
       竖屏只有二十来度横向视野，固定尺寸一定被裁两头 —— 与其在 CSS 里赌，
       不如直接按相机算：牌子最宽不能超过视野宽度的 92%。 */
    function fitBuildSign() {
      if (!bSign) { return; }
      /* 竖屏先落位，再量距离 —— 位置影响距离，距离影响缩放 */
      bSign.position.y = signIsNarrow() ? 2.86 : 3.42;
      /* ⚠ 必须取世界坐标：buildG 挂在 z = ANX_Z（-360）上，
         拿局部坐标去和 camera.position（世界）比距离，会算出 360 米外的距离，
         缩放永远是 1 —— 题面牌就怎么都不肯变小。 */
      var hold = new T.Vector3();
      bSign.getWorldPosition(hold);
      var dist = Math.max(0.5, camera.position.distanceTo(hold));
      var halfW = Math.tan(camera.fov * Math.PI / 360) * camera.aspect;
      var maxW = 2 * dist * halfW * 0.92;
      bSign.scale.setScalar(Math.min(1, Math.max(0.16, maxW / 6.2)));
    }
    fitBuildSign();

    /* 构件方块：顶上刻字，其余五面是石头 */
    var POOL = (App.data && App.data.BUILTIN_POOL) || [];
    function drawable(s) {
      return !!(App.glyphs && App.glyphs.parts && App.glyphs.parts[s]);
    }
    /* 只挑"两个构件都画得出来"的字：拼上去必须看得见，不能半个字 */
    var BUILDABLE = POOL.filter(function (w) {
      var cs = String(w.w || '').split('+').filter(Boolean);
      return cs.length === 2 && cs.every(drawable);
    });
    var ALL_COMPS = [];
    BUILDABLE.forEach(function (w) {
      String(w.w).split('+').forEach(function (c) {
        if (c && ALL_COMPS.indexOf(c) < 0) { ALL_COMPS.push(c); }
      });
    });

    var faceMtlCache = {};
    /* 备选构件：一块立起来的小石牌，字面朝观众。
       原来是平放的立方体（字贴在顶面）—— 站在工作台前是偏低的角度，
       顶面几乎看不见，四块挤在一起更认不出哪个是「日」哪个是「月」。
       立起来之后，四块就是四张立牌，字正对着人。 */
    var BLK_W = 0.50, BLK_H = 0.66, BLK_D = 0.10;
    var PED_H = 0.72;                 /* 台座高：牌底就落在它顶上 */
    var BLK_Y = PED_H + BLK_H / 2;    /* 牌心 = 座顶 + 半个牌高 */

    function compMtl(ch) {
      if (faceMtlCache[ch]) { return faceMtlCache[ch]; }
      var S = 256;
      var SH = Math.round(S * BLK_H / BLK_W);
      var cv = App.museumTex.canvas(S, SH);
      var c = cv.getContext('2d');
      c.fillStyle = '#3b3128';
      c.fillRect(0, 0, S, SH);
      c.strokeStyle = 'rgba(165,129,71,.55)';
      c.lineWidth = 6;
      c.strokeRect(10, 10, S - 20, SH - 20);
      /* 字画在正方形小画布上再贴过来：
         paintGlyph 是按画布宽度的百分比定位的，直接画在竖长画布上会偏到上半截。 */
      var g = App.museumTex.canvas(128, 128);
      App.museumTex.paintGlyph(g, ch, { color: '#efe3c8', weight: 2.6 });
      var gs = Math.min(S, SH) * 0.80;
      c.drawImage(g, (S - gs) / 2, (SH - gs) / 2, gs, gs);
      var m = std({
        map: canvasTex(cv, { srgb: true }), roughness: 0.62, metalness: 0.10
      });
      faceMtlCache[ch] = m;
      return m;
    }
    var blockSideMtl = std({ color: 0x6b5c49, roughness: 0.76, metalness: 0.10 });
    /* BoxGeometry 的材质顺序：+x -x +y -y +z -z —— 字在 +z，也就是正面那块 */
    var BLK_FACE = 4;
    var blockGeo = new T.BoxGeometry(BLK_W, BLK_H, BLK_D);

    var bState = { idx: 0, picks: [], blocks: [], done: false, flash: 0, cut: 0, solved: 0, target: null };


    /* 一局 5 题，和第一关入门课一个量级；顺序固定，便于"第 N / 5" */
    var DECK_N = 5;
    var bDeck = BUILDABLE.slice(0, DECK_N);
    if (!bDeck.length) { bDeck = BUILDABLE.slice(); }

    /* ============================================================
       集章牌
       ------------------------------------------------------------
       一局 5 题，光看"第 N/5"和"已拼成 N 字"还是文字进度；
       每拼成一个字就在左手边这块牌子上盖一枚朱印，五枚齐了换一句题头。
       印章的内容就是这个字本身 —— 走完一局，牌子上是一排你还记得的字。
       ============================================================ */
    var STAMP_N = DECK_N;
    var stampChars = [];
    var stampCv = App.museumTex.canvas(1024, 460);
    var stampTex = canvasTex(stampCv, { srgb: true });
    var stampMtl = new T.MeshBasicMaterial({ map: stampTex, transparent: true });

    function paintStampBoard() {
      var c = stampCv.getContext('2d');
      var W = 1024, H = 460;
      c.clearRect(0, 0, W, H);
      /* 牌子底：和厅里那些说明碑同一族，压暗一点免得抢工作台 */
      var g2 = c.createLinearGradient(0, 0, W * 0.4, H);
      g2.addColorStop(0, 'rgba(44,36,26,.94)');
      g2.addColorStop(1, 'rgba(26,21,15,.94)');
      c.fillStyle = g2;
      c.fillRect(0, 0, W, H);
      c.strokeStyle = 'rgba(214,186,126,.38)';
      c.lineWidth = 4;
      c.strokeRect(10, 10, W - 20, H - 20);

      var done = stampChars.length >= STAMP_N;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = done ? 'rgba(255,226,178,.96)' : 'rgba(240,226,200,.92)';
      c.font = '600 46px "Songti SC","Noto Serif SC",serif';
      c.fillText(done ? '五 枚 齐 了' : '集 章', W / 2, 62);
      c.fillStyle = 'rgba(232,220,194,.42)';
      c.font = '400 24px "Songti SC","Noto Serif SC",serif';
      c.fillText(done ? '这一局五个字，都是你自己拼出来的'
        : '拼成一个字，盖一枚印　·　' + stampChars.length + ' / ' + STAMP_N, W / 2, 108);

      var n = STAMP_N;
      var gap = 26;
      var cell = Math.min(150, Math.floor((W - 120 - gap * (n - 1)) / n));
      var total = cell * n + gap * (n - 1);
      var x0 = (W - total) / 2;
      var y0 = 158;
      for (var i = 0; i < n; i++) {
        var x = x0 + i * (cell + gap);
        var ch = stampChars[i];
        if (!ch) {
          /* 空槽：虚线框 + 一个很淡的「印」 */
          c.save();
          c.setLineDash([9, 8]);
          c.strokeStyle = 'rgba(190,150,96,.34)';
          c.lineWidth = 3;
          c.strokeRect(x, y0, cell, cell);
          c.restore();
          c.fillStyle = 'rgba(232,220,194,.12)';
          c.font = '600 ' + Math.round(cell * 0.42) + 'px "Songti SC","Noto Serif SC",serif';
          c.fillText('印', x + cell / 2, y0 + cell / 2 + 2);
        } else {
          /* 已盖：朱砂方块，边不求正（手按的印从来不是正的） */
          var rot = ((i * 37) % 7 - 3) * 0.012;
          c.save();
          c.translate(x + cell / 2, y0 + cell / 2);
          c.rotate(rot);
          c.fillStyle = 'rgba(158,54,34,.90)';
          c.fillRect(-cell / 2, -cell / 2, cell, cell);
          /* 朱砂印面不匀：几处淡的白点 */
          var R2 = App.museumTex.rng(900 + i * 31);
          for (var k = 0; k < 26; k++) {
            c.fillStyle = 'rgba(240,226,200,' + (0.03 + R2() * 0.10).toFixed(3) + ')';
            c.fillRect(-cell / 2 + R2() * cell, -cell / 2 + R2() * cell, 2 + R2() * 3, 2 + R2() * 3);
          }
          c.strokeStyle = 'rgba(240,226,200,.55)';
          c.lineWidth = 2;
          c.strokeRect(-cell / 2 + 7, -cell / 2 + 7, cell - 14, cell - 14);
          c.fillStyle = '#f4e6c8';
          c.font = '600 ' + Math.round(cell * 0.56) + 'px "Songti SC","Noto Serif SC",serif';
          c.fillText(ch, 0, 2);
          c.restore();
        }
      }
      c.fillStyle = 'rgba(232,220,194,.30)';
      c.font = '400 20px "Songti SC","Noto Serif SC",serif';
      c.fillText(done ? '再点「下一个字」，可以接着拼' : '五个字走完，这块牌子就满了', W / 2, H - 46);
      stampTex.needsUpdate = true;
    }

    /* 盖一枚：返回是否刚好盖满（用来触发收尾） */
    function addStamp(ch) {
      if (!ch) { return false; }
      if (stampChars.length >= STAMP_N) { return false; }
      stampChars.push(ch);
      paintStampBoard();
      if (App.museumAudio && App.museumAudio.part) { App.museumAudio.part(); }
      return stampChars.length >= STAMP_N;
    }

    paintStampBoard();
    var stampBoard = new T.Mesh(new T.PlaneGeometry(2.42, 1.09), stampMtl);
    /* 位置按默认机位调过：再往左就会被画面裁掉最左边那枚印 */
    stampBoard.position.set(-2.62, 1.78, -2.05);
    stampBoard.rotation.y = 0.60;
    stampBoard.userData = { kind: 'stampboard' };
    buildG.add(stampBoard);
    pickables.push(stampBoard);
    /* 牌脚：两根短柱，别让牌子悬在半空 */
    [-1, 1].forEach(function (s) {
      var leg = new T.Mesh(
        new T.BoxGeometry(0.05, 1.2, 0.05),
        std({ color: 0x2b2118, roughness: 0.8, metalness: 0.08 })
      );
      leg.position.set(-2.62 + Math.cos(0.60) * s * 0.9, 0.6, -2.05 - Math.sin(0.60) * s * 0.9);
      leg.rotation.y = 0.60;
      buildG.add(leg);
    });

    /* 成字的金屑：一次 90 颗，散开后受重力落下、逐渐淡出 */
    var sparks = null, sparkData = null;
    function spawnSparks(origin, count, color) {
      var N = count || 90;
      if (sparks && sparks.parent) { sparks.parent.remove(sparks); }
      var pos = new Float32Array(N * 3);
      var vel = [];
      for (var i = 0; i < N; i++) {
        pos[i * 3] = origin.x; pos[i * 3 + 1] = origin.y; pos[i * 3 + 2] = origin.z;
        var a = Math.random() * Math.PI * 2;
        var up = 0.9 + Math.random() * 1.5;
        var sp = 0.5 + Math.random() * 1.2;
        vel.push(new T.Vector3(Math.cos(a) * sp, up, Math.sin(a) * sp));
      }
      var geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.BufferAttribute(pos, 3));
      var mat = new T.PointsMaterial({
        color: color || 0xffd9a0, size: 0.055, transparent: true, opacity: 1,
        depthWrite: false, blending: T.AdditiveBlending, fog: false
      });
      sparks = new T.Points(geo, mat);
      sparks.userData.age = 0;
      buildG.add(sparks);
      sparkData = vel;
      if (App.museumAudio && App.museumAudio.good) { App.museumAudio.good(); }
      else if (App.museumAudio && App.museumAudio.click) { App.museumAudio.click(); }
    }

    function stepSparks(dt) {
      if (!sparks || !sparks.parent) { return; }
      var arr = sparks.geometry.attributes.position.array;
      sparks.userData.age += dt;
      for (var i = 0; i < sparkData.length; i++) {
        var v = sparkData[i];
        v.y -= dt * 2.6;
        arr[i * 3] += v.x * dt;
        arr[i * 3 + 1] += v.y * dt;
        arr[i * 3 + 2] += v.z * dt;
        if (arr[i * 3 + 1] < 0.05) { arr[i * 3 + 1] = 0.05; v.y *= -0.28; v.x *= 0.7; v.z *= 0.7; }
      }
      sparks.geometry.attributes.position.needsUpdate = true;
      sparks.material.opacity = Math.max(0, 1 - sparks.userData.age / 1.8);
      if (sparks.userData.age > 1.8) {
        if (sparks.parent) { sparks.parent.remove(sparks); }
        sparks = null;
      }
    }

    function buildPair() {
      /* 每次换一个字。取模保证多少次都不会越界 */
      var w = bDeck[bState.idx % bDeck.length];
      var pair = String(w.w).split('+');
      var distract = [];
      for (var i = 0; i < ALL_COMPS.length && distract.length < 2; i++) {
        var c = ALL_COMPS[(bState.idx * 5 + i) % ALL_COMPS.length];
        if (pair.indexOf(c) < 0 && distract.indexOf(c) < 0) { distract.push(c); }
      }
      var list = pair.concat(distract);
      /* 位置打散：正确的两块不能总是并排站着 */
      var rot = (bState.idx * 3) % list.length;
      return { word: w, pair: pair, list: list.slice(rot).concat(list.slice(0, rot)) };
    }

    function buildLayout() {
      var p = buildPair();
      /* 清掉上一轮的方块 */
      bState.blocks.forEach(function (b) {
        buildG.remove(b.mesh);
        if (b.mesh.userData && b.mesh.userData.ped) { buildG.remove(b.mesh.userData.ped); }
      });
      bState.blocks = [];
      bState.picks = [];
      bState.done = false;
      work.recarve([]);

      bState.target = p.word;
      paintBuildSign(
        '第 ' + (bState.idx % bDeck.length + 1) + ' / ' + bDeck.length + '　拼 出 「' + p.word.g + '」',
        '需要 ' + p.pair.length + ' 块构件：从下排四块里挑出来　·　已拼成 ' + bState.solved + ' 字',
        '',
        null, p.pair, p.word.g
      );

      var n = p.list.length;
      /* 竖屏横向只有 ±14°，原来那条 1.84 rad 的弧摆出去，
         最外侧两块直接落在屏幕外 —— 手机上等于挑不全四个构件，拼不了。
         窄屏改成工作台前的 2×2 栅格，四块都收进同一屏。 */
      var narrow = signIsNarrow();
      /* 竖屏的四块错开摆：后排比前排更靠外、略高一点。
         原来两排正对着摆（x 相同），前排那块立牌正好把后排整个挡住 ——
         手机上只看得到两块，等于挑不全四个构件。 */
      var GRID = [[-0.31, -0.75], [0.31, -0.75], [-0.66, -1.45], [0.66, -1.45]];
      p.list.forEach(function (ch, i) {
        var mats = [];
        for (var f = 0; f < 6; f++) {
          mats.push(f === BLK_FACE ? compMtl(ch) : blockSideMtl);
        }
        var mesh = new T.Mesh(blockGeo, mats);
        if (narrow) {
          var gp = GRID[i % GRID.length];
          /* 后排站在圆台上（台面 0.80）：抬 0.08 正好落座，台座也刚好没进台子里 */
          var gy = BLK_Y + (i >= 2 ? 0.08 : 0);
          mesh.position.set(gp[0], gy, gp[1]);
          mesh.rotation.y = gp[0] * 0.34;
        } else {
          /* 一横排：中间两块略靠前、两边略后，成一道浅弧。
             ⚠ 不许再按 2.05 的半径绕工作台排 —— 台沿在 z≈-0.9，
             那样排出来的两侧会退到圆台后面，下半截连同台座都被台子吃掉。 */
          var bx = (i - (n - 1) / 2) * 0.92;
          var bz = -0.60 - Math.abs(i - (n - 1) / 2) * 0.10;
          mesh.position.set(bx, BLK_Y, bz);
          /* 微微转向中间：四块朝人，但不至于排成一张完全平行的墙 */
          mesh.rotation.y = -bx * 0.16;
        }
        mesh.userData = { kind: 'block', ch: ch, slot: i };
        mesh.castShadow = !low;
        /* 台座跟着立牌一起抬：竖屏后排抬高 0.2，座子也得高 0.2，
           不然牌是浮在座子上方的 */
        var pedH = PED_H + (mesh.position.y - BLK_Y);
        var ped = new T.Mesh(
          new T.CylinderGeometry(0.255, 0.30, pedH, 14),
          std({ color: 0x3a2f24, roughness: 0.6, metalness: 0.2 })
        );
        ped.position.set(mesh.position.x, pedH / 2, mesh.position.z);
        buildG.add(ped);
        mesh.userData.ped = ped;
        buildG.add(mesh);
        pickables.push(mesh);
        bState.blocks.push({ mesh: mesh, ch: ch, up: false });
      });
      return p;
    }

    function buildTap(ch) {
      if (bState.done) { return { kind: 'build-done' }; }
      var b = null;
      for (var i = 0; i < bState.blocks.length; i++) {
        if (bState.blocks[i].ch === ch) { b = bState.blocks[i]; break; }
      }
      if (!b) { return null; }
      var at = bState.picks.indexOf(ch);
      if (at >= 0) { bState.picks.splice(at, 1); }
      else { bState.picks.push(ch); }
      b.up = at < 0;

      /* 台面上的字：放一个刻一个，位置按放上的先后（先放的靠右，同甲骨竖行） */
      var cols = bState.picks.map(function (c) { return c; });
      work.recarve(cols, { boost: 1.45 });
      bState.cut = 1;   /* 刚刻上去：骨面亮一下，让人看见"刻在这儿了" */

      if (bState.picks.length === 2) {
        var p = buildPair();
        var ok = p.pair.every(function (c) { return bState.picks.indexOf(c) >= 0; });
        if (ok) {
          bState.done = true;
          bState.flash = 1;
          bState.solved += 1;
          if (App.progress && p.word && p.word.g) {
            App.progress.add('build', String(p.word.g));   /* 三关收口也记一笔 */
          }
          spawnSparks(new T.Vector3(0, 1.7, -2.5), 90, 0xffd9a0);
          /* 盖一枚章。差一枚不满时只是"又多一枚"，盖满那一下换题头。 */
          var full = addStamp(p.word.g);
          paintBuildSign('成 字 「' + p.word.g + '」',
            full
              ? '五枚齐了 —— 这一局的五个字都盖在左手边那块牌子上'
              : '骨上这道刻好了 —— 看完讲解再点「下一个字」（已集 ' +
                stampChars.length + '/' + STAMP_N + ' 印）',
            '', 'rgba(255,214,150,.96)', p.pair, p.word.g);
          /* 交给馆里弹讲解卡；玩家点「下一个字」才 buildNext() */
          if (App.emit) {
            App.emit('museum-build', { solved: bState.solved, target: p.word.g, done: true });
            App.emit('museum-build-solved', {
              word: p.word, pair: p.pair, seq: bState.idx % bDeck.length,
              total: bDeck.length, solved: bState.solved,
              stamps: stampChars.slice(), stampFull: full
            });
          }
          return { kind: 'build-ok', word: p.word };
        }
        if (App.museumAudio && App.museumAudio.part) { App.museumAudio.part(); }
        paintBuildSign('差 一 点',
          '这两块拼不成「' + p.word.g + '」　·　点亮的方块再点一次就取下来',
          '', 'rgba(226,150,120,.94)', p.pair, p.word.g);
        bState.flash = 1;
        setTimeout(function () {
          if (bState.done) { return; }
          bState.picks = [];
          bState.blocks.forEach(function (b) { b.up = false; });
          work.recarve([]);
          paintBuildSign(
            '拼 出 「' + p.word.g + '」',
            '需要 ' + p.pair.length + ' 块构件：从下排四块里挑出来　·　已拼成 ' + bState.solved + ' 字',
            '', null, p.pair, p.word.g
          );
        }, 1200);
        return { kind: 'build-no', word: p.word };
      }
      return { kind: 'build-tap', picks: bState.picks.slice() };
    }

    /* ============================================================
       ② 考古任务区
       ============================================================ */
    var digG = new T.Group();
    digG.position.set(0, 0, ANX_Z - ANX_GAP);
    digG.visible = false;
    scene.add(digG);
    roomShell(digG, 15.5, 13, 6.0, 0xa58147);

    var dSignCv = App.museumTex.canvas(1024, 160);
    var dsc = dSignCv.getContext('2d');
    dsc.textAlign = 'center';
    dsc.textBaseline = 'middle';
    dsc.fillStyle = 'rgba(232,220,194,.9)';
    dsc.font = '600 62px "Songti SC","Noto Serif SC",serif';
    dsc.fillText('考 古 任 务 区', 512, 62);
    dsc.fillStyle = 'rgba(232,220,194,.46)';
    dsc.font = '400 30px "Songti SC","Noto Serif SC",serif';
    dsc.fillText('九个探方，三片刻着字的骨还埋在下面 —— 一层一层刮，别急着整块掀', 512, 122);
    var dSign = new T.Mesh(
      new T.PlaneGeometry(6.6, 1.03),
      new T.MeshBasicMaterial({ map: canvasTex(dSignCv, { srgb: true }), transparent: true })
    );
    dSign.position.set(0, 4.9, -12.6);
    digG.add(dSign);

    var soilMtl = std({ map: canvasTex(soilTex(), { srgb: true, repeat: [1, 1] }), roughness: 0.95, metalness: 0.02 });
    var cellGeo = new T.BoxGeometry(2.1, 0.52, 2.1);
    var D_FRAGS = [
      { i: 1, ch: '山' }, { i: 5, ch: '川' }, { i: 7, ch: '泉' }
    ];
    var dState = { cells: [], found: 0 };

    for (var di = 0; di < 9; di++) {
      var dr = Math.floor(di / 3), dc = di % 3;
      var dx = (dc - 1) * 2.22, dz = -5.6 + (dr - 1) * 2.22;
      var cell = new T.Mesh(cellGeo, soilMtl);
      cell.position.set(dx, 0.26 + (App.museumTex.hashStr('c' + di) % 7) * 0.012, dz);
      cell.receiveShadow = true;
      cell.userData = { kind: 'cell', slot: di };
      digG.add(cell);
      pickables.push(cell);

      var frag = null;
      for (var f2 = 0; f2 < D_FRAGS.length; f2++) {
        if (D_FRAGS[f2].i === di) { frag = D_FRAGS[f2]; break; }
      }
      var fragMesh = null;
      if (frag) {
        var sm = makeSlab(frag.ch, { size: 0.86, texSize: 384 });
        sm.mesh.position.set(dx, -0.62, dz);
        sm.mesh.rotation.set(-0.2, 0.3 + di * 0.2, 0.06);
        sm.mesh.visible = false;
        sm.mesh.userData = { kind: 'frag', char: frag.ch };
        digG.add(sm.mesh);
        fragMesh = sm.mesh;
      }
      dState.cells.push({
        mesh: cell, baseY: cell.position.y, targetY: cell.position.y,
        frag: fragMesh, ch: frag ? frag.ch : null, dug: false, t: 0
      });
    }

    function digTap(slot) {
      var c = dState.cells[slot];
      if (!c || c.dug) { return { kind: 'dig-same' }; }
      c.dug = true;
      c.targetY = -0.72;
      if (c.frag) {
        c.frag.visible = true;
        c.frag.position.y = -0.45;
        dState.found++;
        return { kind: 'dig-find', char: c.ch, found: dState.found, total: D_FRAGS.length };
      }
      return { kind: 'dig-empty', found: dState.found, total: D_FRAGS.length };
    }

    /* ============================================================
       ③ BOSS 挑战区
       ============================================================ */
    var bossG = new T.Group();
    bossG.position.set(0, 0, ANX_Z - ANX_GAP * 2);
    bossG.visible = false;
    scene.add(bossG);
    roomShell(bossG, 17, 14, 7.2, 0x8c3a2a);

    /* 石门：一进这个区先看到"关"在那边 */
    var gateMtl = std({ color: 0x241813, roughness: 0.6, metalness: 0.3, envMapIntensity: 0.9 });
    [-1, 1].forEach(function (s) {
      var pier = new T.Mesh(new T.BoxGeometry(0.7, 5.4, 0.9), gateMtl);
      pier.position.set(s * 3.1, 2.7, -7.4);
      bossG.add(pier);
    });
    var gl = new T.Mesh(new T.BoxGeometry(6.9, 0.7, 1.05), gateMtl);
    gl.position.set(0, 5.7, -7.4);
    bossG.add(gl);
    /* 门内是一片黑：不画东西，只把门做成"往里退"的洞口 */
    var gateDark = new T.Mesh(
      new T.PlaneGeometry(5.5, 5.3),
      new T.MeshBasicMaterial({ color: 0x070403, side: T.DoubleSide })
    );
    gateDark.position.set(0, 2.65, -7.9);
    bossG.add(gateDark);

    /* 悬在门前的「戈」：这一区的主字 */
    var geSlab = makeSlab('戈', { size: 2.15, texSize: 1024, ratio: 1.22 });
    geSlab.mesh.position.set(0, 4.0, -6.0);
    geSlab.mesh.userData = { kind: 'bosscore' };
    geSlab.mats[0].emissive = new T.Color(0x3a120c);
    geSlab.mats[0].emissiveIntensity = 1;
    bossG.add(geSlab.mesh);
    pickables.push(geSlab.mesh);

    var boSignCv = App.museumTex.canvas(1024, 160);
    var bosc = boSignCv.getContext('2d');
    bosc.textAlign = 'center';
    bosc.textBaseline = 'middle';
    bosc.fillStyle = 'rgba(240,222,204,.92)';
    bosc.font = '600 62px "Songti SC","Noto Serif SC",serif';
    bosc.fillText('B O S S 挑 战 区', 512, 62);
    bosc.fillStyle = 'rgba(240,222,204,.44)';
    bosc.font = '400 30px "Songti SC","Noto Serif SC",serif';
    bosc.fillText('名录墙上的形象都来自讨伐页 · 点一尊看它的破法', 512, 122);
    var boSign = new T.Mesh(
      new T.PlaneGeometry(6.8, 1.06),
      new T.MeshBasicMaterial({ map: canvasTex(boSignCv, { srgb: true }), transparent: true })
    );
    boSign.position.set(0, 6.3, -13.4);
    bossG.add(boSign);

    /* 名录墙：形象用 assets/boss 里既有的图，一尊一框 */
    var faces = [];
    var facesLoaded = false;
    var FACE_IDX = [0, 1, 2, 10];
    var texLoader = null;

    function loadFaces() {
      /* 名录墙已废弃（用户：这个部分没有用）。留代码不留画面：
         这一区现在直接进"守字之骨"三阶段关卡，不再摆墙。 */
      return;
      if (facesLoaded) { return; }
      facesLoaded = true;
      var entries = (App.levels && App.levels.bossCodex &&
        App.levels.bossCodex.entries) || [];
      if (!entries.length || !T.TextureLoader) { return; }
      texLoader = texLoader || new T.TextureLoader();
      FACE_IDX.forEach(function (ei, k) {
        var e = entries[ei];
        if (!e || !e.art) { return; }
        var x = -4.35 + k * 2.9;
        var frame = new T.Mesh(
          new T.BoxGeometry(2.05, 2.64, 0.16),
          std({ color: 0x2a1a13, roughness: 0.55, metalness: 0.35 })
        );
        frame.position.set(x, 2.0, -7.15);
        bossG.add(frame);

        var mat = new T.MeshStandardMaterial({
          color: 0xffffff, roughness: 0.72, metalness: 0.02,
          emissive: new T.Color(0x1a110a), emissiveIntensity: 1
        });
        var plane = new T.Mesh(new T.PlaneGeometry(1.86, 2.44), mat);
        plane.position.set(x, 2.0, -7.05);
        plane.userData = { kind: 'bossface', char: e.char, slot: k };
        bossG.add(plane);
        pickables.push(plane);

        texLoader.load(e.art, function (t) {
          t.encoding = T.sRGBEncoding;
          t.anisotropy = 4;
          mat.map = t;
          mat.needsUpdate = true;
        });

        var nm = App.museumTex.textCanvas(e.alt || e.char, {
          w: 256, h: 64, size: 38, color: '#e8dcc2',
          font: '"Songti SC","Noto Serif SC",serif', weight: '600'
        });
        var plate = new T.Mesh(
          new T.PlaneGeometry(1.05, 0.26),
          new T.MeshBasicMaterial({ map: canvasTex(nm, { srgb: true }), transparent: true })
        );
        plate.position.set(x, 0.52, -7.0);
        bossG.add(plate);

        faces.push({ char: e.char, entry: e });
      });
    }

    /* ---------- 拆解：把一尊形象的构件摆到门前，一件件拆下来 ----------
       构件名与效果全部来自 bossCodex 的 parts 字段，不另编。 */
    var bossState = { idx: -1, tiles: [], broken: 0 };
    var tileGeo = new T.BoxGeometry(0.92, 0.36, 0.92);

    function bossClearTiles() {
      bossState.tiles.forEach(function (t) {
        bossG.remove(t.mesh);
        if (t.mesh.material) { t.mesh.material.dispose(); }
      });
      bossState.tiles = [];
      bossState.broken = 0;
      bossState.idx = -1;
    }

    function bossSelect(idx) {
      bossClearTiles();
      var entries = (App.levels && App.levels.bossCodex &&
        App.levels.bossCodex.entries) || [];
      var e = entries[FACE_IDX[idx]];
      if (!e) { return null; }
      bossState.idx = idx;
      var parts = e.parts || [];
      var n = Math.max(1, parts.length);
      parts.forEach(function (p, k) {
        var cv = App.museumTex.canvas(256, 104);
        var c = cv.getContext('2d');
        c.fillStyle = '#2b1d16';
        c.fillRect(0, 0, 256, 104);
        c.strokeStyle = 'rgba(200,120,90,.55)';
        c.lineWidth = 3;
        c.strokeRect(4, 4, 248, 96);
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillStyle = '#f2e0cc';
        c.font = '600 40px "Songti SC","Noto Serif SC",serif';
        c.fillText(p.n || '构件', 128, p.a ? 44 : 52);
        if (p.a) {
          c.fillStyle = 'rgba(240,190,160,.62)';
          c.font = '400 20px "Songti SC","Noto Serif SC",serif';
          c.fillText(p.a, 128, 78);
        }
        var mat = std({
          map: canvasTex(cv, { srgb: true }), roughness: 0.66, metalness: 0.05,
          emissive: new T.Color(0x221008), emissiveIntensity: 1
        });
        var tile = new T.Mesh(tileGeo, mat);
        var a = (-0.86 + (k / Math.max(1, n - 1)) * 1.72);
        tile.position.set(Math.sin(a) * 3.5, 0.92, -3.5 + Math.cos(a) * 0.45);
        tile.userData = { kind: 'bosspart', slot: k };
        bossG.add(tile);
        pickables.push(tile);
        bossState.tiles.push({ mesh: tile, name: p.n || '构件', gone: false, t: 0 });
      });
      return { entry: e, parts: parts.length };
    }

    function bossTapPart(slot) {
      var t = bossState.tiles[slot];
      if (!t || t.gone) { return null; }
      t.gone = true;
      t.mesh.material.transparent = true;
      bossState.broken++;
      return {
        kind: 'boss-part', name: t.name,
        broken: bossState.broken, total: bossState.tiles.length
      };
    }

    /* ============================================================
       ④ 文明序厅：一块碑 + 一次灼骨
       说明不是一段弹窗文字，是刻在碑上的；"灼骨观兆"是可以点的一次演示。
       ============================================================ */
    var proG = new T.Group();
    proG.position.set(0, 0, ANX_Z - ANX_GAP * 3);
    proG.visible = false;
    scene.add(proG);
    roomShell(proG, 13.6, 12, 6.2, 0xa58147);

    var stele = new T.Mesh(
      new T.BoxGeometry(3.1, 4.5, 0.44),
      std({ color: 0x2b2018, roughness: 0.6, metalness: 0.22, envMapIntensity: 0.8 })
    );
    stele.position.set(0, 2.5, -7.5);
    proG.add(stele);

    /* 碑文：竖行、右起。三列，每列八字。 */
    var steleCv = App.museumTex.canvas(768, 1024);
    (function () {
      var c = steleCv.getContext('2d');
      c.fillStyle = '#241a12';
      c.fillRect(0, 0, 768, 1024);
      /* 石面不匀 */
      var R = App.museumTex.rng(99);
      for (var i = 0; i < 40; i++) {
        var x = R() * 768, y = R() * 1024, r = 30 + R() * 140;
        var g = c.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, R() > 0.5 ? 'rgba(90,70,48,.16)' : 'rgba(10,7,4,.20)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g;
        c.fillRect(x - r, y - r, r * 2, r * 2);
      }
      var cols = ['甲骨文商代晚期刻', '在龟甲牛肩胛骨上', '灼而观兆以断吉凶'];
      var fs = 76, gap = 96;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = '600 ' + fs + 'px "Songti SC","Noto Serif SC",serif';
      c.fillStyle = '#e9dcc3';
      c.shadowColor = 'rgba(0,0,0,.65)';
      c.shadowBlur = 6;
      c.shadowOffsetY = 2;
      for (var ci = 0; ci < cols.length; ci++) {
        var cx = 580 - ci * 210;
        for (var j = 0; j < cols[ci].length; j++) {
          c.fillText(cols[ci].charAt(j), cx, 170 + j * gap);
        }
      }
      c.shadowColor = 'transparent';
      c.fillStyle = 'rgba(233,220,195,.45)';
      c.font = '400 32px "Songti SC","Noto Serif SC",serif';
      c.fillText('一片骨，既是器物，也是一次提问的档案', 384, 940);
    })();
    var steleFace = new T.Mesh(
      new T.PlaneGeometry(2.5, 3.34),
      std({
        map: canvasTex(steleCv, { srgb: true, aniso: 8 }),
        roughness: 0.82, metalness: 0.05,
        emissive: new T.Color(0x1a140e), emissiveIntensity: 1
      })
    );
    steleFace.position.set(0, 2.62, -7.27);
    steleFace.userData = { kind: 'stele' };
    proG.add(steleFace);
    pickables.push(steleFace);

    /* 灼骨台：一块平放的骨，一道会亮的兆 */
    var proStand = new T.Mesh(new T.CylinderGeometry(1.0, 1.12, 0.92, 28), stoneMtl);
    proStand.position.set(0, 0.46, -2.6);
    proG.add(proStand);
    var proTop = new T.Mesh(new T.CylinderGeometry(1.02, 1.02, 0.06, 28),
      std({ color: 0x4c3d2d, roughness: 0.3, metalness: 0.34, envMapIntensity: 1.1 }));
    proTop.position.set(0, 0.95, -2.6);
    proG.add(proTop);

    var heatBone = makeSlab('卜', { size: 1.05, texSize: 512 });
    heatBone.mesh.position.set(0, 1.36, -2.6);
    heatBone.mesh.rotation.x = -1.28;   /* 近乎平放，但仍能看出是骨片 */
    heatBone.mesh.userData = { kind: 'heat' };
    proG.add(heatBone.mesh);
    pickables.push(heatBone.mesh);

    /* 兆：从灼点裂开的细纹。加色混合，只在"灼"的那几秒亮起来。 */
    var crackCv = App.museumTex.canvas(256, 256);
    (function () {
      var c = crackCv.getContext('2d');
      var R = App.museumTex.rng(2026);
      c.strokeStyle = 'rgba(255,178,96,.95)';
      c.lineCap = 'round';
      c.shadowColor = 'rgba(255,140,50,.95)';
      c.shadowBlur = 9;
      function branch(x, y, a0, len, w, depth) {
        var a = a0;
        for (var s = 0; s < len; s++) {
          a += (R() - 0.5) * 0.34;
          var nx = x + Math.cos(a) * 5, ny = y + Math.sin(a) * 5;
          c.beginPath();
          c.lineWidth = w;
          c.moveTo(x, y);
          c.lineTo(nx, ny);
          c.stroke();
          x = nx; y = ny;
          if (depth > 0 && R() > 0.80) {
            branch(x, y, a + (R() > 0.5 ? 0.9 : -0.9), len * 0.45, w * 0.62, depth - 1);
          }
        }
      }
      branch(128, 128, 1.35, 14, 4.2, 2);
      branch(128, 128, -1.15, 12, 3.6, 2);
      branch(128, 128, 2.7, 8, 2.8, 1);
    })();
    var crackMat = new T.MeshBasicMaterial({
      map: canvasTex(crackCv, { srgb: true }), transparent: true, opacity: 0,
      blending: T.AdditiveBlending, depthWrite: false
    });
    var crack = new T.Mesh(new T.PlaneGeometry(1.15, 1.15), crackMat);
    crack.position.set(0, 1.42, -2.6);
    crack.rotation.x = -1.28;
    proG.add(crack);

    /* 灼点：一小簇加色火焰（不占灯位，也用不着粒子系统） */
    var flameMat = new T.MeshBasicMaterial({
      color: 0xffb060, transparent: true, opacity: 0.0,
      blending: T.AdditiveBlending, depthWrite: false
    });
    var flame = new T.Mesh(new T.ConeGeometry(0.10, 0.42, 8, 1, true), flameMat);
    flame.position.set(0, 0.72, -2.15);
    proG.add(flame);

    var heatT = -1;   /* >0 表示正在灼 */

    /* ============================================================
       回主馆的交互碑（每个展区一块，摆在入口侧前方）
       ------------------------------------------------------------
       顶栏那颗"返回大厅"在视野之外，站着看展时不好找；
       这里在每间屋子靠门的一侧立一块小碑，点一下就回大厅。
       ============================================================ */
    function addBackPlaque(group, opt) {
      var o = opt || {};
      var w = 1.55, h = 0.52;
      var cv = App.museumTex.canvas(512, 172);
      var c = cv.getContext('2d');
      c.clearRect(0, 0, 512, 172);
      /* 石面 */
      var g = c.createLinearGradient(0, 0, 0, 172);
      g.addColorStop(0, 'rgba(58,46,34,.96)');
      g.addColorStop(1, 'rgba(32,25,19,.96)');
      c.fillStyle = g;
      c.fillRect(0, 0, 512, 172);
      c.strokeStyle = 'rgba(214,186,126,.55)';
      c.lineWidth = 5;
      c.strokeRect(9, 9, 494, 154);
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = 'rgba(240,226,200,.94)';
      c.font = '600 62px "Songti SC","Noto Serif SC",serif';
      c.fillText('← 回 主 馆', 256, 70);
      c.fillStyle = 'rgba(232,220,194,.46)';
      c.font = '400 26px "Songti SC","Noto Serif SC",serif';
      c.fillText('点此碑退出本展区', 256, 128);

      var mat = new T.MeshBasicMaterial({
        map: canvasTex(cv, { srgb: true }), transparent: true
      });
      var plaque = new T.Mesh(new T.PlaneGeometry(w, h), mat);
      plaque.position.set(o.x == null ? 3.65 : o.x, o.y == null ? 1.55 : o.y,
                          o.z == null ? -2.2 : o.z);
      plaque.rotation.y = o.ry == null ? -0.55 : o.ry;
      plaque.userData = { kind: 'back', zone: 'back' };
      group.add(plaque);
      pickables.push(plaque);

      /* 碑脚：一小段石座，免得牌子悬空 */
      var base = new T.Mesh(
        new T.BoxGeometry(w * 0.72, 0.16, 0.12),
        std({ color: 0x2a1f16, roughness: 0.9, metalness: 0.06 })
      );
      base.position.set(plaque.position.x, plaque.position.y - h * 0.5 - 0.06, plaque.position.z);
      base.rotation.y = plaque.rotation.y;
      group.add(base);
      return plaque;
    }

    addBackPlaque(proG, { x: 3.5, y: 1.6, z: -3.0 });
    addBackPlaque(gal, { x: -8.37, y: 1.72, z: -8.64, ry: 1.22 });
    /* ---------- 知识陈设：三块石板 ---------- */
    function knowledgeBoard(opt) {
      var cv = App.museumTex.canvas(640, 420);
      var c = cv.getContext('2d');
      /* 底色原来是近乎纯黑（52,42,32 → 28,22,17），在满室暖褐里像三块黑板。
         提到石灰的明度上，再用朱砂压标题，才和整个厅是一个族。 */
      var g = c.createLinearGradient(0, 0, 0, 420);
      g.addColorStop(0, 'rgba(92,74,54,.99)');
      g.addColorStop(0.55, 'rgba(70,56,41,.99)');
      g.addColorStop(1, 'rgba(48,38,28,.99)');
      c.fillStyle = g;
      c.fillRect(0, 0, 640, 420);
      /* 石面细砂，免得整块色太平 */
      var R = App.museumTex.rng(20261031);
      for (var gi = 0; gi < 2600; gi++) {
        c.fillStyle = 'rgba(255,232,196,' + (0.006 + R() * 0.022).toFixed(3) + ')';
        c.fillRect(R() * 640, R() * 420, 1, 1);
      }
      c.strokeStyle = 'rgba(214,186,126,.50)';
      c.lineWidth = 4;
      c.strokeRect(10, 10, 620, 400);
      c.strokeStyle = 'rgba(214,186,126,.22)';
      c.lineWidth = 1.5;
      c.strokeRect(22, 22, 596, 376);
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = 'rgba(250,238,214,.98)';
      c.font = '600 46px "Songti SC","Noto Serif SC",serif';
      c.fillText(opt.title, 320, 68);
      /* 标题下一条朱砂短线 */
      c.fillStyle = 'rgba(204,82,59,.78)';
      c.fillRect(292, 100, 56, 3);
      c.fillStyle = 'rgba(240,226,198,.82)';
      c.font = '400 26px "Songti SC","Noto Serif SC",serif';
      (opt.lines || []).forEach(function (line, i) {
        c.fillText(line, 320, 154 + i * 46);
      });
      c.fillStyle = 'rgba(240,226,198,.40)';
      c.font = '400 19px "Songti SC","Noto Serif SC",serif';
      c.fillText('点开细看', 320, 384);

      var bw = opt.w || 2.5;
      var bh = bw * 0.66;
      var by = opt.y || 2.5;
      var ry = opt.ry || 0;
      /* 法线方向：牌子朝圆心，所以背后就是它的反方向 */
      var nx = Math.sin(ry), nz = Math.cos(ry);

      /* 石背板：原来只有一张没有厚度的平面，挂在半空里像一块发光的屏。
         加一块略大的深色背板之后，它才有"板"这个身份。 */
      var frame = new T.Mesh(
        new T.BoxGeometry(bw + 0.15, bh + 0.15, 0.07),
        std({ color: 0x2b221a, roughness: 0.74, metalness: 0.14, envMapIntensity: 0.5 })
      );
      frame.position.set(opt.x - nx * 0.055, by, opt.z - nz * 0.055);
      frame.rotation.y = ry;
      gal.add(frame);

      /* 两根细吊索挂到顶棚：说明它是"吊起来的"，不是浮着的 */
      var ropeTop = galH - 0.06;
      var ropeH = ropeTop - (by + bh / 2);
      if (ropeH > 0.2) {
        var rx = Math.cos(ry), rz = -Math.sin(ry);
        [-1, 1].forEach(function (sgn) {
          var rope = new T.Mesh(
            new T.CylinderGeometry(0.012, 0.012, ropeH, 5, 1),
            std({ color: 0x6f5a3c, roughness: 0.42, metalness: 0.65 })
          );
          rope.position.set(
            opt.x + rx * sgn * bw * 0.34,
            by + bh / 2 + ropeH / 2,
            opt.z + rz * sgn * bw * 0.34
          );
          gal.add(rope);
        });
      }

      var mesh = new T.Mesh(
        new T.PlaneGeometry(bw, bh),
        new T.MeshBasicMaterial({ map: canvasTex(cv, { srgb: true }), transparent: true })
      );
      mesh.position.set(opt.x, by, opt.z);
      mesh.rotation.y = ry;
      mesh.userData = { kind: 'board', topic: opt.topic, zone: 'board' };
      gal.add(mesh);
      pickables.push(mesh);
      return mesh;
    }

    /* 三块石板插在环上（骨版之间），一起朝圆心 */
    function ringSpot(deg, r) {
      var a = deg * Math.PI / 180;
      return {
        x: Math.sin(a) * (r || RING_R), z: RING_CZ + Math.cos(a) * (r || RING_R),
        ry: a + Math.PI
      };
    }
    var b1 = ringSpot(-60, RING_R + 1.05);
    knowledgeBoard({
      topic: 'structure', title: '一片卜辞的结构',
      lines: ['叙辞：谁、在哪一天问', '命辞：要问的那件事',
              '占辞：商王看兆后的判断', '验辞：后来应验了没有'],
      x: b1.x, y: 3.55, z: b1.z, w: 1.95, ry: b1.ry
    });
    var b2 = ringSpot(60, RING_R + 1.05);
    knowledgeBoard({
      topic: 'periods', title: '甲骨文的五个时期',
      lines: ['一期 武丁', '二期 祖庚 · 祖甲', '三期 廪辛 · 康丁',
              '四期 武乙 · 文丁', '五期 帝乙 · 帝辛'],
      x: b2.x, y: 3.55, z: b2.z, w: 1.95, ry: b2.ry
    });
    var b3 = ringSpot(180, RING_R + 1.05);
    knowledgeBoard({
      topic: 'numbers', title: '数字说甲骨',
      lines: ['出土甲骨 约十五万片', '单字 约四千五百个',
              '已读 约一千三百字', '常用字基本认得出'],
      x: b3.x, y: 3.55, z: b3.z, w: 1.95, ry: b3.ry
    });

    /* ============================================================
       环上补四件陈设
       ------------------------------------------------------------
       一圈看下来原本只有"台座 + 骨版"重复十二次，外侧还只有三块知识
       石板、一块说明碑、一块回馆碑，而且都挤在一侧 —— 转到背光那半边
       就只剩十二块牌子，节奏是断的。
       这里补四件**不是骨版**的东西：
         龟甲（灼骨）· 青铜鼎 · 刻刀 · 卜辞拓片
       它们讲的不是"又一个字"，而是甲骨这条链上的四段：
       材料（甲）· 礼器（鼎）· 工具（刀）· 摹取（拓）。
       半径比骨版那圈再往外 1.5，不站在骨版那一排里。

       方位原本取 315 / 45 / 135 / 225（一个 X），只为"两前两后、转到哪边都有一件"。
       换成四段陈列之后按段归位：每件落在自己那一段的中间，于是每一段都是
       "两件骨版夹一件器物"，一段一个节奏：
         285° 龟甲（卜材）· 45° 青铜鼎（卜辞）· 135° 刻刀（文字）· 225° 拓片（发现）
       环上骨版的角位是 -90° + i×30°，卜材占 270/300、卜辞占 330~90、
       文字占 120~180、发现占 210~240 —— 上面四个角正好各落在段心。 */
    var PROP_R = RING_R + 1.5;
    var propStoneMtl = std({ color: 0x463e34, roughness: 0.62, metalness: 0.16, envMapIntensity: 0.55 });
    /* 铜在这么暗的洗墙灯下会糊成一团黑，所以带一点自发光把体积托出来 */
    var propBronzeMtl = std({
      color: 0x957641, roughness: 0.30, metalness: 0.82, envMapIntensity: 1.1,
      emissive: new T.Color(0x2e2211), emissiveIntensity: 0.6
    });
    var propWoodMtl = std({ color: 0x3a2b1d, roughness: 0.78, metalness: 0.06, envMapIntensity: 0.4 });

    /* 统一的小台座：和骨版那排台座同一族，但更矮更扁，不跟骨版抢 */
    function propBase(x, z, h, r) {
      var b = new T.Mesh(new T.CylinderGeometry(r || 0.44, (r || 0.44) + 0.05, h, 18, 1), propStoneMtl);
      b.position.set(x, h / 2, z);
      gal.add(b);
      var cap = new T.Mesh(new T.CylinderGeometry((r || 0.44) + 0.06, (r || 0.44) + 0.06, 0.05, 18, 1), propStoneMtl);
      cap.position.set(x, h + 0.02, z);
      gal.add(cap);
      return h + 0.045;
    }

    function propShadow(x, z, w) {
      var sh = new T.Mesh(new T.PlaneGeometry(w || 1.0, (w || 1.0) * 0.6), shadowMtl);
      sh.rotation.x = -Math.PI / 2;
      sh.position.set(x, 0.006, z);
      gal.add(sh);
    }

    /* ---------- ① 龟甲（灼骨） ---------- */
    (function plastronProp() {
      /* 285°：夹在「牛」与「卜」两件之间，正是卜材段的段心。
         原来在 315°，换成四段陈列之后它落到了卜材与卜辞的交界上，
         看起来像"还没入段"的一件东西。 */
      var sp = ringSpot(285, PROP_R);
      var top = propBase(sp.x, sp.z, 0.74, 0.40);
      propShadow(sp.x, sp.z, 1.2);
      var holder = new T.Group();
      holder.position.set(sp.x, top + 0.06, sp.z);
      holder.rotation.y = sp.ry;
      /* 甲面朝厅心微微仰起：平放着看只是一只盘子，仰起来才看得出是"甲" */
      holder.rotation.x = -0.34;
      gal.add(holder);

      /* 兜底：程序化的甲壳（GLB 没加载出来时也还有东西可看可点）。
         不是"一个扁球"：龟腹甲是甲片拼起来的，所以给一张自己画的甲纹贴图，
         中间一道中缝、两侧各四块甲片，外加三个钻凿过的圆槽。 */
      var shellCv = App.museumTex.canvas(512, 512);
      var sc = shellCv.getContext('2d');
      var sg = sc.createRadialGradient(256, 236, 40, 256, 256, 280);
      sg.addColorStop(0, '#e0d3b6');
      sg.addColorStop(0.7, '#cbbb98');
      sg.addColorStop(1, '#a89877');
      sc.fillStyle = sg;
      sc.fillRect(0, 0, 512, 512);
      sc.strokeStyle = 'rgba(96,74,44,.52)';
      sc.lineWidth = 4;
      /* 中缝 */
      sc.beginPath(); sc.moveTo(256, 40); sc.lineTo(256, 472); sc.stroke();
      /* 横缝 + 侧缝 */
      [-150, -40, 70, 180].forEach(function (dy) {
        sc.beginPath(); sc.moveTo(70, 256 + dy); sc.lineTo(442, 256 + dy); sc.stroke();
      });
      [-1, 1].forEach(function (s) {
        sc.beginPath(); sc.moveTo(256, 70); sc.lineTo(256 + s * 170, 256); sc.stroke();
        sc.beginPath(); sc.moveTo(256, 442); sc.lineTo(256 + s * 170, 256); sc.stroke();
      });
      /* 钻凿：三个椭圆槽 + 槽边的灼痕 */
      [[-70, -30], [40, 26], [-20, 120]].forEach(function (p) {
        sc.fillStyle = 'rgba(46,32,20,.82)';
        sc.beginPath();
        sc.ellipse(256 + p[0], 256 + p[1], 26, 15, 0.5, 0, Math.PI * 2);
        sc.fill();
        var hg = sc.createRadialGradient(256 + p[0] + 30, 256 + p[1] + 18, 2, 256 + p[0] + 30, 256 + p[1] + 18, 46);
        hg.addColorStop(0, 'rgba(150,74,26,.5)');
        hg.addColorStop(1, 'rgba(150,74,26,0)');
        sc.fillStyle = hg;
        sc.fillRect(256 + p[0] - 20, 256 + p[1] - 30, 100, 100);
      });

      var dome = new T.Mesh(
        new T.SphereGeometry(0.62, 30, 16),
        std({
          map: canvasTex(shellCv, { srgb: true }),
          color: 0xe2d7bd, roughness: 0.78, metalness: 0.02, envMapIntensity: 0.45
        })
      );
      dome.scale.set(1.05, 0.34, 1.22);
      dome.position.y = 0.13;
      dome.userData = { kind: 'plastron' };
      holder.add(dome);
      pickables.push(dome);

      /* GLB 读取器（getModel / MODELS / modelCache）是在这一大段之后才初始化的，
         这里直接调会在 modelCache 还是 undefined 时就进去 —— 推迟一个 tick 再取，
         那时整个 create() 的同步部分已经跑完。 */
      setTimeout(function () {
        getModel('plastron', function (err, g) {
          if (err || !g) { return; }
          var inst = g.clone(true);
          inst.scale.setScalar(1.02);
          inst.position.y = 0.10;
          inst.traverse(function (o) {
            if (!o.isMesh) { return; }
            o.userData = { kind: 'plastron' };
            pickables.push(o);
          });
          holder.add(inst);
          dome.visible = false;   /* 有真模型就把兜底的收起来（不销毁） */
        });
      }, 0);
    })();

    /* ---------- ② 青铜鼎 ---------- */
    (function bronzeDingProp() {
      var sp = ringSpot(45, PROP_R);
      var top = propBase(sp.x, sp.z, 0.62, 0.46);
      propShadow(sp.x, sp.z, 1.4);
      var g = new T.Group();
      g.position.set(sp.x, top, sp.z);
      g.rotation.y = sp.ry;
      /* 整体放大 1.35：台座那一圈的尺寸是按"手可持"定的，
         鼎按真尺寸放在这里就是台面上的一只小碗。 */
      g.scale.setScalar(1.35);
      gal.add(g);

      var tag = { kind: 'board', topic: 'bronze' };

      /* 腹：上宽下收，鼎是"三足两耳" */
      var body = new T.Mesh(new T.CylinderGeometry(0.40, 0.31, 0.44, 26, 1), propBronzeMtl);
      body.position.y = 0.52;
      body.userData = tag;
      g.add(body);
      pickables.push(body);

      var rim = new T.Mesh(new T.CylinderGeometry(0.44, 0.44, 0.055, 26, 1), propBronzeMtl);
      rim.position.y = 0.75;
      rim.userData = tag;
      g.add(rim);
      pickables.push(rim);

      /* 三足 */
      for (var i = 0; i < 3; i++) {
        var a = (i / 3) * Math.PI * 2 + 0.5;
        var leg = new T.Mesh(new T.CylinderGeometry(0.052, 0.072, 0.42, 10, 1), propBronzeMtl);
        leg.position.set(Math.cos(a) * 0.24, 0.21, Math.sin(a) * 0.24);
        leg.userData = tag;
        g.add(leg);
        pickables.push(leg);
      }

      /* 两耳：立在口沿上。
         原来给了 rotation.y = 90°，半圆环整个转成侧向 —— 从厅中心看过去
         只剩一条边，等于没有耳朵。这里留在 XY 平面里，正面就看得出是"两耳"。 */
      [-1, 1].forEach(function (s) {
        var ear = new T.Mesh(new T.TorusGeometry(0.115, 0.038, 10, 20, Math.PI), propBronzeMtl);
        ear.position.set(s * 0.29, 0.78, 0);
        ear.userData = tag;
        g.add(ear);
        pickables.push(ear);
      });

      /* 一点铜绿：老器物不是新铸的金色 */
      var patina = new T.Mesh(
        new T.TorusGeometry(0.395, 0.012, 6, 30),
        new T.MeshBasicMaterial({ color: 0x4f7c6a, transparent: true, opacity: 0.35 })
      );
      patina.position.y = 0.42;
      patina.rotation.x = Math.PI / 2;
      g.add(patina);

      /* 点击热区：三足之间是空的，光标从缝里穿过去会点不到 ——
         加一个不显示但参与射线的大圆柱，随便点哪个方向都算点到这件鼎。 */
      var hit = new T.Mesh(
        new T.CylinderGeometry(0.50, 0.50, 1.02, 12, 1),
        new T.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
      );
      hit.position.y = 0.5;
      hit.userData = tag;
      hit.renderOrder = -1;
      g.add(hit);
      pickables.push(hit);
    })();

    /* ---------- ③ 刻刀 ---------- */
    (function graverProp() {
      var sp = ringSpot(135, PROP_R);
      var top = propBase(sp.x, sp.z, 0.74, 0.52);
      propShadow(sp.x, sp.z, 1.3);
      var g = new T.Group();
      g.position.set(sp.x, top, sp.z);
      g.rotation.y = sp.ry;
      gal.add(g);
      var tag = { kind: 'board', topic: 'graver' };

      /* 托板 */
      var board = new T.Mesh(new T.BoxGeometry(1.12, 0.08, 0.62), propWoodMtl);
      board.position.y = 0.06;
      board.userData = tag;
      g.add(board);
      pickables.push(board);

      /* 刀身：斜着搁在托板上。这里所有尺寸都比"真刀"放大了一圈 ——
         展厅里没人会凑到 30cm 内看，按真实尺寸做出来就是一根看不见的线。 */
      var blade = new T.Group();
      blade.position.set(0, 0.20, 0.02);
      blade.rotation.y = 0.30;
      blade.rotation.z = 0.05;
      g.add(blade);

      var shaft = new T.Mesh(new T.BoxGeometry(0.92, 0.075, 0.095), propBronzeMtl);
      shaft.userData = tag;
      blade.add(shaft);
      pickables.push(shaft);

      /* 刃口：一条压亮的窄面，让刀"有锋" */
      var edge = new T.Mesh(
        new T.BoxGeometry(0.92, 0.016, 0.020),
        std({ color: 0xd8b877, roughness: 0.18, metalness: 0.95, envMapIntensity: 1.4 })
      );
      edge.position.set(0, 0.046, 0);
      blade.add(edge);

      var tip = new T.Mesh(new T.ConeGeometry(0.045, 0.20, 10), propBronzeMtl);
      tip.rotation.z = -Math.PI / 2;
      tip.position.x = 0.55;
      tip.userData = tag;
      blade.add(tip);
      pickables.push(tip);

      var grip = new T.Mesh(new T.CylinderGeometry(0.075, 0.068, 0.34, 14), propWoodMtl);
      grip.rotation.z = Math.PI / 2;
      grip.position.x = -0.50;
      grip.userData = tag;
      blade.add(grip);
      pickables.push(grip);

      /* 旁边一小块待刻的骨：让"刀"和"骨"同框 */
      var frag = makeSlab('卜', { size: 0.46, texSize: 256 });
      frag.mesh.position.set(-0.26, 0.14, -0.17);
      frag.mesh.rotation.x = -Math.PI / 2 + 0.08;
      frag.mesh.rotation.z = 0.5;
      frag.mesh.userData = tag;
      g.add(frag.mesh);
      pickables.push(frag.mesh);
    })();

    /* ---------- ④ 完整卜辞拓片 ---------- */
    (function rubbingProp() {
      var sp = ringSpot(225, PROP_R);
      var top = propBase(sp.x, sp.z, 0.66, 0.5);
      propShadow(sp.x, sp.z, 1.3);
      var g = new T.Group();
      g.position.set(sp.x, top, sp.z);
      g.rotation.y = sp.ry;
      gal.add(g);
      var tag = { kind: 'board', topic: 'rubbing' };

      /* 立架：两根短柱把拓片撑起来，别让它悬空 */
      [-1, 1].forEach(function (s) {
        var pole = new T.Mesh(new T.BoxGeometry(0.05, 1.26, 0.05), propWoodMtl);
        pole.position.set(s * 0.5, 0.63, 0.02);
        g.add(pole);
      });

      /* 拓片画面：墨面 + 白字（甲骨是刻的，字口不着墨 —— 拓出来字是白的） */
      var W = 720, H = 960;
      var cv = App.museumTex.canvas(W, H);
      var c = cv.getContext('2d');
      var ink = c.createLinearGradient(0, 0, W, H);
      ink.addColorStop(0, '#1c1712');
      ink.addColorStop(0.55, '#141009');
      ink.addColorStop(1, '#0e0b07');
      c.fillStyle = ink;
      c.fillRect(0, 0, W, H);
      /* 打墨不匀：几团浅一点的墨晕 */
      var R = App.museumTex.rng(77);
      for (var m = 0; m < 12; m++) {
        var mx = R() * W, my = R() * H, mr = (0.10 + R() * 0.30) * W;
        var mg = c.createRadialGradient(mx, my, 0, mx, my, mr);
        mg.addColorStop(0, 'rgba(60,50,38,.22)');
        mg.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = mg;
        c.fillRect(mx - mr, my - mr, mr * 2, mr * 2);
      }
      /* 双线边框 */
      c.strokeStyle = 'rgba(226,214,186,.5)';
      c.lineWidth = 3;
      c.strokeRect(22, 22, W - 44, H - 44);
      c.lineWidth = 1;
      c.strokeRect(32, 32, W - 64, H - 64);

      /* 四列竖行，右起（和骨版上一样：一列写完换左边一列）
         排的是厅里这十二件陈列的字 —— 讲清"行款"，不冒充某片出土拓片。
         从 EXHIBITS 现拼，环上换了陈列这里自动跟着换。 */
      var RCOLS = ['', '', '', ''];
      EXHIBITS.forEach(function (e, i) { RCOLS[Math.floor(i / 3) % 4] += e.ch; });
      var cell = 132, top0 = 132, colGap = 152;
      var tmp = App.museumTex.canvas(cell, cell);
      RCOLS.forEach(function (col, ci) {
        var cx = W - 108 - ci * colGap;
        for (var k = 0; k < col.length; k++) {
          var tc = tmp.getContext('2d');
          tc.clearRect(0, 0, cell, cell);
          App.museumTex.paintGlyph(tmp, col.charAt(k), {
            color: '#e9dfc8', weight: 1.16,
            shadow: { color: 'rgba(0,0,0,.55)', blur: 4, ox: 0, oy: 2 }
          });
          c.drawImage(tmp, cx - cell / 2, top0 + k * 176, cell, cell);
        }
      });
      /* 左下角一枚小朱印：拓片收尾都会钤印 */
      c.fillStyle = 'rgba(150,52,32,.86)';
      c.fillRect(64, H - 150, 74, 74);
      c.strokeStyle = 'rgba(240,226,200,.55)';
      c.lineWidth = 2;
      c.strokeRect(70, H - 144, 62, 62);
      c.fillStyle = '#f0e2c8';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = '600 34px "Songti SC","Noto Serif SC",serif';
      c.fillText('拓', 101, H - 113);

      var paper = new T.Mesh(
        new T.PlaneGeometry(1.02, 1.36),
        new T.MeshBasicMaterial({ map: canvasTex(cv, { srgb: true, aniso: 8 }), transparent: true })
      );
      paper.position.set(0, 0.66, 0.02);
      paper.userData = tag;
      g.add(paper);
      pickables.push(paper);

      /* 一根横杆压住上沿 */
      var bar = new T.Mesh(new T.BoxGeometry(1.12, 0.045, 0.06), propWoodMtl);
      bar.position.set(0, 1.36, 0.02);
      bar.userData = tag;
      g.add(bar);
      pickables.push(bar);
    })();

    /* 序厅并进来之后，它的内容改成厅里这块说明碑：点开就是原来的序厅面板 */
    (function prologueTablet() {
      var cv = App.museumTex.canvas(512, 200);
      var c = cv.getContext('2d');
      c.fillStyle = 'rgba(58,46,34,.96)';
      c.fillRect(0, 0, 512, 200);
      c.strokeStyle = 'rgba(214,186,126,.55)';
      c.lineWidth = 5;
      c.strokeRect(9, 9, 494, 182);
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = 'rgba(240,226,200,.94)';
      c.font = '600 54px "Songti SC","Noto Serif SC",serif';
      c.fillText('甲 骨 是 什 么', 256, 74);
      c.fillStyle = 'rgba(232,220,194,.5)';
      c.font = '400 26px "Songti SC","Noto Serif SC",serif';
      c.fillText('点开看：甲骨、灼骨与兆纹', 256, 138);
      var mesh = new T.Mesh(
        new T.PlaneGeometry(1.85, 0.72),
        new T.MeshBasicMaterial({ map: canvasTex(cv, { srgb: true }), transparent: true })
      );
      mesh.position.set(8.37, 1.78, -8.64);
      mesh.rotation.y = 5.06;
      mesh.userData = { kind: 'prologue', zone: 'prologue' };
      gal.add(mesh);
      pickables.push(mesh);
    })();
    addBackPlaque(buildG, { x: 4.2, y: 1.6, z: -2.6 });
    addBackPlaque(digG, { x: 4.2, y: 1.6, z: -2.6 });
    addBackPlaque(bossG, { x: 4.4, y: 1.6, z: -2.6 });

    /* ============================================================
       ⑤ 我的典藏区：一面陈列柜，十二个龛
       看过哪一件，哪个龛就亮起来 —— 进度不是一句文字，是墙上的状态。
       ============================================================ */
    var collG = new T.Group();
    collG.position.set(0, 0, ANX_Z - ANX_GAP * 4);
    collG.visible = false;
    scene.add(collG);
    roomShell(collG, 14.4, 12, 6.4, 0x527d91);
    addBackPlaque(collG, { x: 4.0, y: 1.6, z: -2.2 });   /* 典藏区也要能回主馆 */

    var cabMtl = std({ color: 0x241a12, roughness: 0.66, metalness: 0.22, envMapIntensity: 0.6 });
    var cabBack = new T.Mesh(new T.BoxGeometry(10.6, 5.9, 0.34), cabMtl);
    /* 柜体整体前移 0.6：附区后墙的前表面在 -7.8，柜子原来贴着 -8.15 会被墙挡掉
       —— 结果只看到一面墙，龛一个都看不见。 */
    cabBack.position.set(0, 3.35, -7.55);
    collG.add(cabBack);
    /* 柜体框线：横托板 + 竖隔 */
    [-1.42, 0.28, 1.98].forEach(function (yy) {
      var shelf = new T.Mesh(new T.BoxGeometry(10.6, 0.12, 0.6), cabMtl);
      shelf.position.set(0, 3.35 + yy - 0.86, -7.30);
      collG.add(shelf);
    });
    [-3.4, -1.15, 1.15, 3.4].forEach(function (xx) {
      var div = new T.Mesh(new T.BoxGeometry(0.12, 5.9, 0.6), cabMtl);
      div.position.set(xx, 3.35, -7.30);
      collG.add(div);
    });

    var collSlots = [];
    var qMarkCv = App.museumTex.textCanvas('未观', {
      w: 128, h: 48, size: 26, color: 'rgba(232,220,194,.52)',
      font: '"Songti SC","Noto Serif SC",serif', weight: '400'
    });
    var qMarkTex = canvasTex(qMarkCv, { srgb: true });

    var SLOT_POS = [];
    for (var sr = 0; sr < 3; sr++) {
      for (var sc2 = 0; sc2 < 4; sc2++) {
        SLOT_POS.push({ x: -3.45 + sc2 * 2.3, y: 1.62 + (2 - sr) * 1.70 });
      }
    }

    EXHIBITS.forEach(function (e, i) {
      var p = SLOT_POS[i];
      /* 龛：一块凹进去的暗面 */
      var niche = new T.Mesh(
        new T.BoxGeometry(2.02, 1.52, 0.28),
        std({ color: 0x0a0705, roughness: 1, metalness: 0 })
      );
      niche.position.set(p.x, p.y, -7.35);
      collG.add(niche);

      var s = makeSlab(e.ch, { size: 0.66, texSize: 384 });
      s.mesh.position.set(p.x, p.y, -6.98);
      s.mesh.userData = { kind: 'slot', char: e.ch, slot: i };
      collG.add(s.mesh);
      pickables.push(s.mesh);

      var tag = new T.Mesh(
        new T.PlaneGeometry(0.72, 0.2),
        new T.MeshBasicMaterial({ map: qMarkTex, transparent: true })
      );
      tag.position.set(p.x, p.y - 0.86, -6.90);
      /* 空龛的"未观"牌也要能点：没看过的格子点开会说明它是什么、怎么去看。
         骨版在未观时是 hidden，射线打不到，所以这里给牌子挂同一个 pick 语义。 */
      tag.userData = { kind: 'slot', char: e.ch, slot: i };
      collG.add(tag);
      pickables.push(tag);

      collSlots.push({ char: e.ch, slab: s, tag: tag, seen: false, y: p.y });
    });

    /* 柜台：写着"已观展 N / 12" */
    var collCountCv = App.museumTex.canvas(1024, 256);
    var collCountTex = canvasTex(collCountCv, { srgb: true, aniso: 8 });
    var collCounter = new T.Mesh(
      new T.PlaneGeometry(3.6, 0.9),
      new T.MeshBasicMaterial({ map: collCountTex, transparent: true })
    );
    collCounter.position.set(0, 0.86, -5.4);
    collG.add(collCounter);

    var collPlinth = new T.Mesh(new T.BoxGeometry(4.0, 0.5, 0.42), cabMtl);
    collPlinth.position.set(0, 0.25, -5.4);
    collG.add(collPlinth);

    function refreshCollection() {
      var n = 0;
      collSlots.forEach(function (sl) {
        /* 这里外层必须有 !!(...)：写成 !!A && B && C 得到的是 undefined，
           而 three 只认严格 false，undefined 等于「显示」—— 空龛就永远是满的。 */
        var on = !!(App.museum && App.museum._seen && App.museum._seen[sl.char]);
        sl.seen = on;
        if (on) { n++; }
        /* 没看过=空龛（只有一块"未观"牌），看过=骨版亮着。
           这比"把骨版调暗"清楚得多：柜子是空的还是满的，一眼就分得开。 */
        sl.slab.mesh.visible = on;
        var m = sl.slab.mats[0];
        m.color.setHex(0xdbcfb8);
        m.emissive = new T.Color(on ? 0x322412 : 0x000000);
        m.emissiveMap = on ? sl.slab.map : null;
        m.emissiveIntensity = on ? 0.9 : 0;
        m.needsUpdate = true;
        sl.tag.visible = !on;
      });
      var c = collCountCv.getContext('2d');
      c.clearRect(0, 0, 1024, 256);
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = '#e8dcc2';
      c.font = '600 96px "Songti SC","Noto Serif SC",serif';
      c.fillText('已观展 ' + n + ' / 12', 512, 96);
      c.fillStyle = 'rgba(232,220,194,.42)';
      c.font = '400 34px "Songti SC","Noto Serif SC",serif';
      c.fillText(n ? '点任一件，可以重新读它的展签' : '去甲骨文展厅，看过就收进这里', 512, 186);
      collCountTex.needsUpdate = true;
      return n;
    }

    /* 序厅：龟甲（艺术化复原）摆在灼骨台左边，单独一个托座 */
    getModel('plastron', function (err, g) {
      if (err || !g) { return; }
      var stand = new T.Mesh(new T.CylinderGeometry(0.44, 0.50, 0.64, 20), stoneMtl);
      stand.position.set(-2.55, 0.32, -2.6);
      proG.add(stand);
      var cap2 = new T.Mesh(new T.CylinderGeometry(0.47, 0.47, 0.05, 20),
        std({ color: 0x4c3d2d, roughness: 0.32, metalness: 0.32 }));
      cap2.position.set(-2.55, 0.665, -2.6);
      proG.add(cap2);
      var inst = g.clone(true);
      inst.position.set(-2.55, 0.78, -2.6);
      inst.rotation.x = -0.16;
      inst.rotation.y = 0.28;
      inst.scale.setScalar(0.86);
      inst.traverse(function (o) {
        if (!o.isMesh) { return; }
        o.userData = { kind: 'plastron' };
        pickables.push(o);
      });
      proG.add(inst);
    });

    /* 展厅：一只展柜，里面放一件骨版（鼎）—— 展柜自己有玻璃，玻璃也挡光 */
    getModel('case', function (err, g) {
      if (err || !g) { return; }
      var inst = g.clone(true);
      inst.position.set(11.2, 0, -8.6);
      inst.rotation.y = -0.42;
      inst.traverse(function (o) {
        if (!o.isMesh) { return; }
        o.userData = { kind: 'case' };
        pickables.push(o);
      });
      gal.add(inst);

      var inner = makeSlab('鼎', { size: 0.52, texSize: 512 });
      inner.mesh.position.set(11.2, 0.86, -8.6);
      inner.mesh.rotation.y = -0.42;
      inner.mesh.userData = { kind: 'exhibit', char: '鼎' };
      gal.add(inner.mesh);
      pickables.push(inner.mesh);
    });

    var geSpin = 0.0;
    var gePulse = 0;

    var ctrl = {
      target: new T.Vector3(0, 3.5, 0),
      tTarget: new T.Vector3(0, 3.5, 0),
      theta: 0.16, phi: 1.43, radius: 21.0,
      tTheta: 0.16, tPhi: 1.43, tRadius: 21.0,
      minPhi: 0.62, maxPhi: 1.47,
      minR: 7.5, maxR: 27,
      dragging: false, moved: 0
    };

    function applyCamera() {
      var sp = Math.sin(ctrl.phi), cp = Math.cos(ctrl.phi);
      camera.position.set(
        ctrl.target.x + ctrl.radius * sp * Math.sin(ctrl.theta),
        Math.max(0.75, ctrl.target.y + ctrl.radius * cp),
        ctrl.target.z + ctrl.radius * sp * Math.cos(ctrl.theta)
      );
      camera.lookAt(ctrl.target);
    }

    function setView(v) {
      if (v.target) { ctrl.tTarget.copy(v.target); }
      if (v.theta != null) { ctrl.tTheta = v.theta; }
      if (v.phi != null) { ctrl.tPhi = v.phi; }
      if (v.radius != null) { ctrl.tRadius = v.radius; }
      if (v.minPhi != null) { ctrl.minPhi = v.minPhi; }
      if (v.maxPhi != null) { ctrl.maxPhi = v.maxPhi; }
      if (v.minR != null) { ctrl.minR = v.minR; }
      if (v.maxR != null) { ctrl.maxR = v.maxR; }
    }

    /* ---------- 指针交互 ---------- */
    var el = renderer.domElement;
    var last = { x: 0, y: 0, t: 0 };
    var pointers = {};
    var pinchStart = 0, pinchR0 = 0;

    function pos(e) {
      var r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height };
    }

    function onDown(e) {
      pointers[e.pointerId] = pos(e);
      if (Object.keys(pointers).length === 2) {
        var k = Object.keys(pointers);
        var a = pointers[k[0]], b = pointers[k[1]];
        pinchStart = Math.hypot(a.x - b.x, a.y - b.y);
        pinchR0 = ctrl.tRadius;
        ctrl.dragging = false;
        return;
      }
      ctrl.dragging = true;
      ctrl.moved = 0;
      last.x = e.clientX;
      last.y = e.clientY;
      last.t = performance.now();
      if (el.setPointerCapture) { try { el.setPointerCapture(e.pointerId); } catch (err) {} }
    }

    function onMove(e) {
      if (pointers[e.pointerId]) { pointers[e.pointerId] = pos(e); }
      var keys = Object.keys(pointers);
      if (keys.length === 2) {
        var a = pointers[keys[0]], b = pointers[keys[1]];
        var d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchStart > 0) {
          ctrl.tRadius = Math.min(ctrl.maxR, Math.max(ctrl.minR, pinchR0 * (pinchStart / Math.max(1, d))));
        }
        return;
      }
      if (!ctrl.dragging) { hover(e); return; }
      var dx = e.clientX - last.x;
      var dy = e.clientY - last.y;
      ctrl.moved += Math.abs(dx) + Math.abs(dy);
      last.x = e.clientX;
      last.y = e.clientY;
      /* 选中了某件展品时，拖拽转的是这件东西，不是整个视角 ——
         看文物就该这样：手一动，东西在手里转。 */
      if (selectedMesh) {
        selectedMesh.rotation.y += dx * 0.011;
        selectedMesh.rotation.x = Math.max(-0.5, Math.min(0.5,
          selectedMesh.rotation.x - dy * 0.006));
        return;
      }
      ctrl.tTheta -= dx * 0.0052;
      ctrl.tPhi = Math.min(ctrl.maxPhi, Math.max(ctrl.minPhi, ctrl.tPhi - dy * 0.0038));
    }

    function onUp(e) {
      var wasDragging = ctrl.dragging;
      var moved = ctrl.moved;
      delete pointers[e.pointerId];
      if (Object.keys(pointers).length < 2) { pinchStart = 0; }
      ctrl.dragging = false;
      if (wasDragging && moved < 7) { pickAt(e); }
    }

    function onLeave() {
      ctrl.dragging = false;
      pointers = {};
      if (opt.onHover) { opt.onHover(null); }
    }

    function onWheel(e) {
      e.preventDefault();
      var k = e.deltaMode === 1 ? 16 : 1;
      ctrl.tRadius = Math.min(ctrl.maxR, Math.max(ctrl.minR,
        ctrl.tRadius * (1 + e.deltaY * 0.0011 * k)));
    }

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onLeave);
    el.addEventListener('pointerleave', onLeave);
    el.addEventListener('wheel', onWheel, { passive: false });

    /* ---------- 拾取 ---------- */
    var ray = new T.Raycaster();
    var ndc = new T.Vector2();

    /* 拾取要排除"看不见的屋子"：大厅、展厅、五个附区同处一个大场景，
       射线穿过去会先撞上远处另一间屋子里的东西。 */
    function shown(o) {
      var p = o;
      while (p) {
        if (p.visible === false) { return false; }
        p = p.parent;
      }
      return true;
    }

    function hitTest(e) {
      var p = pos(e);
      ndc.set((p.x / p.w) * 2 - 1, -(p.y / p.h) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      var hits = ray.intersectObjects(pickables, false);
      for (var i = 0; i < hits.length; i++) {
        var o = hits[i].object;
        if (o.userData && o.userData.kind && shown(o)) { return o; }
      }
      return null;
    }

    function hover(e) {
      if (!opt.onHover) { return; }
      var o = hitTest(e);
      el.style.cursor = o ? 'pointer' : 'grab';
      opt.onHover(o ? (o.userData.kind === 'exhibit' ? 'exhibit' : (o.userData.zone || 'obj')) : null);
    }

    function pickAt(e) {
      var o = hitTest(e);
      var send = function (payload) { if (opt.onPick) { opt.onPick(payload); } };
      if (!o) { send(null); return; }
      var u = o.userData;
      if (u.kind === 'exhibit') {
        select(u.char);
        send({ type: 'exhibit', char: u.char });
      } else if (u.kind === 'hero') {
        /* 骨版上现在是哪个字，展签就开哪个 */
        send({ type: 'hero', char: (HERO_CYCLE[heroIdx] || {}).ch || '卜' });
      } else if (u.kind === 'portal') {
        send({ type: 'portal', zone: u.zone });
      } else if (u.kind === 'tablet') {
        send({ type: 'tablet' });
      } else if (u.kind === 'work') {
        send({ type: 'build-work' });
      } else if (u.kind === 'block') {
        send({ type: 'build', ch: u.ch, r: buildTap(u.ch) });
      } else if (u.kind === 'cell') {
        send({ type: 'dig', r: digTap(u.slot) });
      } else if (u.kind === 'frag') {
        send({ type: 'frag', char: u.char });
      } else if (u.kind === 'bosscore') {
        send({ type: 'bosscore' });
      } else if (u.kind === 'bossface') {
        var r = bossSelect(u.slot);
        send({ type: 'bossface', char: u.char, r: r });
      } else if (u.kind === 'bosspart') {
        send({ type: 'bosspart', r: bossTapPart(u.slot) });
      } else if (u.kind === 'slot') {
        send({ type: 'slot', char: u.char });
      } else if (u.kind === 'stele') {
        send({ type: 'stele' });
      } else if (u.kind === 'heat') {
        heatT = 2.8;
        send({ type: 'heat' });
      } else if (u.kind === 'back') {
        send({ type: 'back' });
      } else if (u.kind === 'prologue') {
        send({ type: 'prologue' });
      } else if (u.kind === 'board') {
        send({ type: 'board', topic: u.topic });
      } else if (u.kind === 'plastron') {
        /* 龟甲：序厅那件和知识厅环上新补的那件都走这里。
           原来 pickAt 没有这个分支 —— 龟甲在场景里能被 hover 到（光标会变手），
           但点下去什么也不会发生，馆那边 openPlastron() 从来没被触发过。 */
        send({ type: 'plastron' });
      }
    }

    /* ---------- 选中：亮灯 + 微微前倾 ---------- */
    var selected = null;
    var selectedMesh = null;
    function select(ch) {
      selected = ch || null;
      selectedMesh = null;
      exhibits.forEach(function (ex) {
        var on = ex.data.ch === selected;
        var s = on ? 1.14 : 1.0;
        ex.mesh.scale.setScalar(s);
        ex.mats[0].emissive = new T.Color(on ? 0x2a1c0c : 0x000000);
        ex.mats[0].emissiveIntensity = on ? 1 : 0;
      });
      var hit = null;
      for (var i = 0; i < exhibits.length; i++) {
        if (exhibits[i].data.ch === selected) { hit = exhibits[i]; break; }
      }
      if (hit) {
        selectedMesh = hit.mesh;
        hit.mesh.rotation.y = 0;   /* 每次选中先摆正，免得越转越歪 */
        pickSpot.intensity = 1.9;
        pickSpot.position.set(hit.mesh.position.x, 6.4, hit.mesh.position.z + 3.2);
        pickSpot.target.position.set(hit.mesh.position.x, 2.2, hit.mesh.position.z);
        pickSpot.target.updateMatrixWorld();
      } else {
        pickSpot.intensity = 0;
      }
    }

    /* ---------- 区域切换 ----------
       现在六个展区里的每一个都有一间自己的 3D 屋子（大厅 + 展厅 + 序厅、
       造字、考古、BOSS、典藏 = 七个区），点门就是走过去，不再跳回 2D 页。
       七个区共用一个渲染器，切区只切 visible —— 渲染器不重建。 */
    var area = 'hall';

    var AREAS = {
      hall:       { z: 0,                  y: 3.05, dz: 0,    r: 19.0, phi: 1.43, minPhi: 0.62, maxPhi: 1.47, minR: 7.5, maxR: 27, fog: 0.020 },
      /* 知识厅：镜头在厅中央，绕着环看；可以拉远看全厅 */
      gallery:    { z: GAL_Z - 5.6,        y: 2.9, dz: 0,     r: 9.4, phi: 1.30, minPhi: 0.66, maxPhi: 1.50, minR: 2.6, maxR: 10.2, fog: 0.022 },
      /* maxR 从 18 收到 10.2：环厅补了一圈半径 11.2 的内壁，
         再拉到 18 就穿出壁外，看见的是一块没有背面的黑。 */
      prologue:   { z: ANX_Z - ANX_GAP * 3, y: 2.4, dz: -2.8, r: 6.9, phi: 1.30, minPhi: 0.92, maxPhi: 1.46, minR: 3.4, maxR: 12, fog: 0.026 },
      build:      { z: ANX_Z,              y: 1.8, dz: -2.5,  r: 7.6, phi: 1.36, minPhi: 0.90, maxPhi: 1.46, minR: 3.6, maxR: 13, fog: 0.020 },
      excavate:   { z: ANX_Z - ANX_GAP,    y: 1.0, dz: -4.2,  r: 8.2, phi: 0.98, minPhi: 0.55, maxPhi: 1.42, minR: 4.0, maxR: 14, fog: 0.022 },
      boss:       { z: ANX_Z - ANX_GAP * 2, y: 2.6, dz: -4.0, r: 10.0, phi: 1.34, minPhi: 0.90, maxPhi: 1.46, minR: 4.6, maxR: 16, fog: 0.018 },
      collection: { z: ANX_Z - ANX_GAP * 4, y: 3.2, dz: -4.6, r: 7.6, phi: 1.35, minPhi: 0.94, maxPhi: 1.46, minR: 3.6, maxR: 13, fog: 0.022 }
    };

    var GROUPS = {
      hall: hall, gallery: gal, prologue: proG, build: buildG,
      excavate: digG, boss: bossG, collection: collG
    };

    /* 竖屏 / 横屏两套取景。竖屏横向只有三十几度视野，
       与其硬塞十二件进去（每件只剩一条缝），不如靠近看清楚。 */
    function viewFor(areaId) {
      var a = AREAS[areaId] || AREAS.hall;
      var narrow = camera.aspect < 0.95;
      var out = {
        r: a.r, phi: a.phi, y: a.y, z: a.z, dz: a.dz,
        minR: a.minR, maxR: a.maxR, minPhi: a.minPhi, maxPhi: a.maxPhi,
        fog: a.fog
      };
      if (areaId === 'hall' && narrow) {
        out.r = 12.4; out.y = 2.75; out.phi = 1.47;
      } else if (areaId === 'gallery' && narrow) {
        /* 竖屏：r 8.8 的机位正好贴在骨版环（7.9）外面，
           正对着的那块骨版离镜头不足一米 —— 手机上就是一块填满屏幕的骨面。
           这里退到 8.6 但把镜头抬到 4.4 米、并把方位让开 15°（落在两块骨版中间），
           于是最近的两块都退到画面两侧，中间留给中庭那件大骨版。 */
        out.r = 8.6; out.y = 3.3; out.phi = 1.48; out.theta = 0.26;
      } else if (narrow) {
        /* 附区里的东西比展厅紧凑，竖屏往里收 30% 就够 */
        out.r = a.r * 0.70;
        out.minR = a.minR * 0.75;
      }
      return out;
    }

    function setArea(id) {
      if (!GROUPS[id]) { id = 'hall'; }
      var v = viewFor(id);
      Object.keys(GROUPS).forEach(function (k) {
        GROUPS[k].visible = (k === id);
      });
      area = id;
      if (id !== 'gallery') { select(null); }

      setView({
        target: new T.Vector3(0, v.y, v.z + v.dz),
        theta: v.theta != null ? v.theta : (id === 'hall' ? 0.16 : 0),
        phi: v.phi, radius: v.r,
        minPhi: v.minPhi, maxPhi: v.maxPhi, minR: v.minR, maxR: v.maxR
      });
      /* 跨区一次走 150~700 单位，用阻尼飞过去等于穿墙。
         这里直接落位：切区是"换一间屋子"，不是"在一条走廊上滑行"。 */
      ctrl.theta = ctrl.tTheta;
      ctrl.phi = ctrl.tPhi;
      ctrl.radius = ctrl.tRadius;
      ctrl.target.copy(ctrl.tTarget);
      applyCamera();
      scene.fog.density = v.fog;

      /* 附区共用一盏灯：灯位跟着屋子走，别为六间屋子各开一盏 */
      if (id === 'hall' || id === 'gallery') {
        annexKey.intensity = 0;
      } else {
        annexKey.position.set(0, id === 'excavate' ? 7.6 : 5.4, v.z - 1.2);
        annexKey.target.position.set(0, id === 'excavate' ? 0.2 : 1.5, v.z - 4.6);
        annexKey.target.updateMatrixWorld();
        annexKey.intensity = 0.86;
      }

      if (id === 'boss') { loadFaces(); }
      if (id === 'collection') { refreshCollection(); }
      if (id === 'build') {
        if (!bState.blocks.length) { buildLayout(); }
        /* 进造字区时相机已经落位，题面牌的尺寸这时才量得准。
           重绘的内容要和 buildLayout 里那一版一致 —— 少了副标题，
           横屏就会变成一块只写着"第 N/5"的空牌子。 */
        if (bSign) {
          fitBuildSign();
          var bw = bState.target;
          var bpair = bw ? String(bw.w || '').split('+').filter(Boolean) : null;
          var bseq = (bState.idx % bDeck.length) + 1;
          paintBuildSign(
            '第 ' + bseq + ' / ' + bDeck.length + '　拼 出 「' + (bw ? bw.g : '') + '」',
            '需要 ' + (bpair ? bpair.length : 2) + ' 块构件：从下排四块里挑出来　·　已拼成 ' +
              bState.solved + ' 字',
            '', null, bpair, bw ? bw.g : ''
          );
        }
      }
      return id;
    }

    /* 聚光开关：把展厅的洗墙灯压到很低，只剩展品上的那几盏 ——
       博物馆的"闭馆看展"模式，也方便在暗环境里看清字形。 */
    var spotOn = true;
    function toggleSpots() {
      spotOn = !spotOn;
      galKey.intensity = spotOn ? 1.05 : 0.22;
      galRim.intensity = spotOn ? 0.28 : 0.08;
      /* 厅内顶光也要跟着「聚光」开关走，否则关掉聚光它还是全亮 */
      galDeck.intensity = spotOn ? 2.6 : 1.35;
      keySpot.intensity = spotOn ? 2.15 : 1.25;
      annexKey.intensity = (area === 'hall' || area === 'gallery')
        ? 0 : (spotOn ? 1.95 : 1.05);
      return spotOn;
    }

    function resetView() {
      var keep = area;
      setArea(keep);
      /* 大厅多一层：把水平角也拧回正对中央展台 */
      if (keep === 'hall') {
        ctrl.theta = ctrl.tTheta = 0.16;
        applyCamera();
      }
      return keep;
    }

    /* 聚焦某件展品：把相机推近，同时开灯 */
    function focusExhibit(ch) {
      for (var i = 0; i < exhibits.length; i++) {
        if (exhibits[i].data.ch === ch) {
          var p = exhibits[i].mesh.position;
          select(ch);
          ctrl.tTarget.set(p.x, 2.15, p.z + GAL_Z);
          ctrl.tRadius = 4.6;
          ctrl.tTheta = 0; ctrl.tPhi = 1.30;
          ctrl.minR = 3.4; ctrl.maxR = 11;
          return true;
        }
      }
      return false;
    }

    /* ---------- 尺寸 ---------- */
    function resize() {
      var w = host.clientWidth || window.innerWidth;
      var h = host.clientHeight || window.innerHeight;
      renderer.setSize(w, h, false);
      var aspect = w / Math.max(1, h);
      camera.aspect = aspect;
      /* 竖屏时如果还按 42° 垂直视角，水平只剩 20° 左右 —— 看见的东西太少。
         这里按"画面别太窄"补一点垂直视角，上限 66°，避免透视拉扯。
         横屏（宽高比 ≥ 1.2）保持 42°。 */
      camera.fov = aspect >= 1.2 ? 42 : Math.min(57, 42 + (1.2 - aspect) * 19);
      camera.updateProjectionMatrix();
      /* 造字区那块题面牌是按视野宽度算尺寸的，窗口一变就得重算 */
      if (bSign) { fitBuildSign(); }
    }
    resize();
    /* 初次进场按当前屏幕比例取景（竖屏直接给"靠近"的那套） */
    (function () {
      var v = viewFor('hall');
      ctrl.radius = ctrl.tRadius = v.r;
      ctrl.phi = ctrl.tPhi = v.phi;
      ctrl.target.y = ctrl.tTarget.y = v.y;
      applyCamera();
    })();

    var ro = null;
    if (window.ResizeObserver) {
      ro = new ResizeObserver(resize);
      ro.observe(host);
    } else {
      window.addEventListener('resize', resize);
    }

    /* ---------- 主循环 ---------- */
    var clock = new T.Clock();
    var raf = 0, alive = true, frames = 0;
    var reduceMotion = window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false;

    function tick() {
      if (!alive) { return; }
      raf = requestAnimationFrame(tick);
      var dt = Math.min(0.05, clock.getDelta());

      /* 阻尼：跟目标值缓慢靠近。不做缓动库，两行就够。 */
      var k = 1 - Math.pow(0.0025, dt);
      ctrl.theta += (ctrl.tTheta - ctrl.theta) * k;
      ctrl.phi += (ctrl.tPhi - ctrl.phi) * k;
      ctrl.radius += (ctrl.tRadius - ctrl.radius) * k;
      ctrl.target.lerp(ctrl.tTarget, k);
      applyCamera();

      /* 中央那件不是一直转 —— 原来 0.05 rad/s 转一圈两分钟，
         大半时间骨版是侧着的，刻辞根本看不见。
         改成极小幅度地来回摆（±0.42 rad，约 35 秒一个来回）：
         看得出它是件立体的东西，但正面始终朝着人。 */
      if (!reduceMotion && !ctrl.dragging) {
        var sway = Math.sin(clock.elapsedTime * 0.18) * 0.42;
        if (heroHolder) { heroHolder.rotation.y = sway; }
        else if (heroSlab) { heroSlab.mesh.rotation.y = sway; }
      }

      /* 中央那件换字：停一会儿换一个，换的时候旧字化开、新字凝住。
         只在序厅跑 —— 别的屋子看不见它，白烧 CPU。 */
      if (area === 'hall' && heroSlab) {
        if (heroFading >= 0) {
          heroFading += dt;
          var hk = Math.min(1, heroFading / HERO_XFADE);
          heroFade.uMix.value = hk * hk * (3 - 2 * hk);
          if (hk >= 1) { heroCommit(); }
        } else {
          heroWait += dt;
          if (heroWait >= HERO_HOLD) {
            heroStartSwap();
            /* 关掉动效的机器：不化，直接换 */
            if (reduceMotion) { heroCommit(); }
          }
        }
      }
      /* 门的呼吸光：幅度很小，只是让空间"活着" */
      if (!reduceMotion) {
        portals.forEach(function (p, i) {
          p.veil.material.opacity = 0.74 + Math.sin(clock.elapsedTime * 0.55 + i * 0.9) * 0.12;
        });
      }

      /* ---------- 附区里的小动作 ---------- */
      if (!reduceMotion && area === 'boss') {
        geSlab.mesh.rotation.y += dt * 0.22;
      }

      if (area === 'build') {
        var kb = Math.min(1, dt * 9);
        bState.blocks.forEach(function (b) {
          /* 选中就抬起来一点：立牌比原来的方块轻，抬 0.2 就看得出来 */
          var ty = b.up ? BLK_Y + 0.20 : BLK_Y;
          b.mesh.position.y += (ty - b.mesh.position.y) * kb;
          /* 正面（+z）是本品字形贴图，选中时自发光 */
          var mt = b.mesh.material[BLK_FACE];
          if (mt && mt.emissive) {
            mt.emissive.setHex(b.up ? 0x4a3410 : 0x000000);
          }
        });
        stepSparks(dt);
        var wm = work.mats[0];
        if (!wm.emissive) { wm.emissive = new T.Color(0x000000); }
        if (bState.flash > 0) {
          /* 拼成了：整块骨亮起来 */
          bState.flash = Math.max(0, bState.flash - dt * 0.55);
          wm.emissive.setHex(0x3a2a10);
          wm.emissiveIntensity = 0.4 + bState.flash * 1.6;
        } else if (bState.cut > 0) {
          /* 刚刻上一道：只在刻痕那一瞬亮一下，0.5 秒退干净 */
          bState.cut = Math.max(0, bState.cut - dt * 2.0);
          wm.emissive.setHex(0x4a3413);
          wm.emissiveIntensity = bState.cut * 0.85;
        } else {
          wm.emissiveIntensity = 0;
        }
      }

      if (area === 'excavate') {
        var kd = Math.min(1, dt * 5);
        dState.cells.forEach(function (c) {
          if (Math.abs(c.mesh.position.y - c.targetY) > 0.003) {
            c.mesh.position.y += (c.targetY - c.mesh.position.y) * kd;
          }
          if (c.frag && c.frag.visible) {
            c.frag.position.y += (0.62 - c.frag.position.y) * Math.min(1, dt * 3);
            if (!reduceMotion) { c.frag.rotation.y += dt * 0.32; }
          }
        });
      }

      if (area === 'boss') {
        bossState.tiles.forEach(function (t) {
          if (t.gone && t.mesh.visible) {
            t.mesh.position.y += dt * 2.0;
            t.mesh.material.opacity -= dt * 1.3;
            if (t.mesh.material.opacity <= 0.02) { t.mesh.visible = false; }
          }
        });
      }

      if (area === 'prologue' && heatT > 0) {
        heatT -= dt;
        var kh = Math.max(0, heatT / 2.8);
        crackMat.opacity = (0.28 + 0.72 * Math.abs(Math.sin(heatT * 7.5))) * kh;
        flameMat.opacity = 0.62 * kh;
        if (heatT <= 0) { crackMat.opacity = 0; flameMat.opacity = 0; }
      }

      renderer.render(scene, camera);
      frames++;
      if (frames === 2 && opt.onReady) { opt.onReady(); }
    }
    tick();

    if (document.addEventListener) {
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) {
          if (raf) { cancelAnimationFrame(raf); raf = 0; }
        } else if (alive && !raf) {
          clock.getDelta();
          tick();
        }
      });
    }

    /* ---------- 释放 ---------- */
    function dispose() {
      alive = false;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      if (ro) { ro.disconnect(); }
      else { window.removeEventListener('resize', resize); }
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onLeave);
      el.removeEventListener('pointerleave', onLeave);
      el.removeEventListener('wheel', onWheel);

      scene.traverse(function (o) {
        if (o.geometry) { o.geometry.dispose(); }
        if (o.material) {
          var ms = Array.isArray(o.material) ? o.material : [o.material];
          ms.forEach(function (m) {
            ['map', 'bumpMap', 'roughnessMap', 'normalMap', 'emissiveMap'].forEach(function (k) {
              if (m[k] && m[k].dispose) { m[k].dispose(); }
            });
            m.dispose();
          });
        }
      });
      if (envRT && envRT.texture) { envRT.texture.dispose(); }
      if (envTex) { envTex.dispose(); }
      scene.environment = null;
      renderer.dispose();
      if (renderer.forceContextLoss) { renderer.forceContextLoss(); }
      if (el.parentNode) { el.parentNode.removeChild(el); }
    }

    return {
      setArea: setArea,
      resetView: resetView,
      toggleSpots: toggleSpots,
      focusExhibit: focusExhibit,
      select: select,
      dispose: dispose,
      resize: resize,
      zones: ZONE_DEF,
      exhibits: EXHIBITS,
      areas: Object.keys(GROUPS),

      /* 造字区 */
      buildReset: function () {
        var p = buildLayout();
        return { pair: p.pair, target: p.word.g };
      },
      buildTap: buildTap,
      /* 看完讲解 → 下一题（由馆里的卡片按钮调用） */
      buildNext: function () {
        bState.idx += 1;
        bState.done = false;
        var p = buildLayout();
        return { target: p.word.g, seq: bState.idx % bDeck.length, total: bDeck.length };
      },
      buildState: function () {
        return {
          done: bState.done, picks: bState.picks.slice(),
          solved: bState.solved,
          target: bState.target ? bState.target.g : null,
          seq: bState.idx % bDeck.length, total: bDeck.length,
          need: bState.target ? String(bState.target.w || '').split('+').filter(Boolean).length : 2,
          blocks: bState.blocks.map(function (b) { return b.ch; }),
          /* 集章：已经盖了哪些、满没满 */
          stamps: stampChars.slice(), stampTotal: STAMP_N,
          stampsFull: stampChars.length >= STAMP_N
        };
      },

      /* 自查 / 讲解卡用：单独取一次集章状态 */
      stamps: function () { return stampChars.slice(); },

      /* 考古区 */
      dig: digTap,
      digState: function () {
        return {
          found: dState.found, total: D_FRAGS.length,
          cells: dState.cells.map(function (c) { return c.dug; })
        };
      },
      digReset: function () {
        dState.found = 0;
        dState.cells.forEach(function (c) {
          c.dug = false;
          c.targetY = c.baseY;
          if (c.frag) {
            c.frag.visible = false;
            c.frag.position.y = -0.62;
          }
        });
        return true;
      },

      /* BOSS 区 */
      bossSelect: bossSelect,
      bossTapPart: bossTapPart,
      bossClear: bossClearTiles,
      bossState: function () {
        return { idx: bossState.idx, broken: bossState.broken, total: bossState.tiles.length };
      },

      /* 序厅 */
      heat: function () { heatT = 2.8; return true; },
      heatState: function () { return heatT; },

      /* 模型状态（自查用：GLB 到底加载上没上） */
      models: function () {
        var hero = [];
        scene.traverse(function (o) {
          if (o.isMesh && o.userData && o.userData.kind === 'hero') {
            o.geometry.computeBoundingBox();
            var bb = o.geometry.boundingBox;
            hero.push({
              vis: o.visible,
              mat: (o.material && o.material.name) || '',
              n: o.geometry.attributes.position.count,
              idx: o.geometry.index ? o.geometry.index.count : 0,
              bb: [+bb.min.x.toFixed(2), +bb.min.y.toFixed(2), +bb.min.z.toFixed(2),
                   +bb.max.x.toFixed(2), +bb.max.y.toFixed(2), +bb.max.z.toFixed(2)]
            });
          }
        });
        return { state: modelState, hero: hero };
      },

      /* 典藏区：把"看过哪些"交给场景，柜子里对应那个龛亮起来 */
      refresh: refreshCollection,

      /* 自查用：环上四件陈设到底在不在、能不能被点到（界面代码不走这里） */
      props: function () {
        var out = [];
        var wp = new T.Vector3();
        pickables.forEach(function (o) {
          var u = o.userData || {};
          var key = u.kind === 'plastron' ? 'plastron' : (u.kind === 'board' ? u.topic : null);
          if (!key || ['plastron', 'bronze', 'graver', 'rubbing', 'structure', 'periods', 'numbers'].indexOf(key) < 0) { return; }
          o.getWorldPosition(wp);
          var vis = true;
          for (var n = o; n; n = n.parent) { if (n.visible === false) { vis = false; break; } }
          out.push({
            key: key,
            at: [+wp.x.toFixed(2), +wp.y.toFixed(2), +wp.z.toFixed(2)],
            vis: vis && o.visible !== false,
            tris: o.geometry ? (o.geometry.index ? o.geometry.index.count / 3
              : (o.geometry.attributes.position ? o.geometry.attributes.position.count / 3 : 0)) : 0
          });
        });
        return out;
      },

      info: function () {
        return {
          area: area, frames: frames,
          draw: renderer.info.render.calls, tris: renderer.info.render.triangles,
          fov: +camera.fov.toFixed(1), aspect: +camera.aspect.toFixed(3),
          radius: +ctrl.radius.toFixed(2), targetY: +ctrl.target.y.toFixed(2),
          buildDone: bState.done, digFound: dState.found,
          picks: bState.picks.join(''), buildIdx: bState.idx,
          bossBroken: bossState.broken,
          signK: bSign ? +bSign.scale.x.toFixed(3) : -1,
          signY: bSign ? +bSign.position.y.toFixed(2) : -1
        };
      },

      /* 自查用：中央那件现在刻的是哪个字、换到第几个、过渡进行到哪儿 */
      hero: function () {
        var mtl = heroSlab ? heroSlab.mats[0] : null;
        return {
          ch: (HERO_CYCLE[heroIdx] || {}).ch || '',
          idx: heroIdx, n: HERO_CYCLE.length,
          wait: +heroWait.toFixed(2), fading: +heroFading.toFixed(2),
          mix: +heroFade.uMix.value.toFixed(3),
          pending: heroNext ? heroNext.ch : '',
          mapId: mtl && mtl.map ? mtl.map.uuid.slice(0, 8) : '',
          sameAsPending: !!(mtl && heroNext && mtl.map === heroNext.map)
        };
      }
    };
  }

  /* WebGL / WebGL2 探测。失败不走 3D，交给 2D 展厅，绝不白屏。 */
  function supported() {
    try {
      var c = document.createElement('canvas');
      var gl = c.getContext('webgl2') || c.getContext('webgl') ||
        c.getContext('experimental-webgl');
      if (!gl) { return false; }
      var lose = gl.getExtension('WEBGL_lose_context');
      if (lose) { lose.loseContext(); }
      return true;
    } catch (e) { return false; }
  }

  App.museum3d = { create: create, supported: supported, ZONES: ZONE_DEF };
})(window.App = window.App || {});
