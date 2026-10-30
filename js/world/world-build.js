/* ============================================================
   甲骨奇谭 · 3D 世界：聚落场景构建
   —— 纯几何 / 材质 / 碰撞体，不含渲染循环与输入。
      被 world3d.js 调用，产出：
        root       Group（地形、道路、建筑、树林、遗址）
        colliders  [{ x, z, hx, hz }]  轴对齐阻挡盒（角色按圆形推挤解算）
        spots      [{ id, kind, name, x, z, r, data }]  可交互点
        spawn      出生点

   设计约束（对齐「全面转向 3D」的指令）：
     · 真三维：地形有高度、建筑有体量、角色要绕墙走 —— 不是斜放的平面图
     · 按 levels.json 的五区组织聚落：天象 / 山川 / 草木 / 禽兽 / 人居
     · 不引入物理引擎：碰撞只用「圆 vs AABB」，够用且零依赖
     · 面数克制：同类构件按材质合并，整座聚落约 12 个 draw call
   ============================================================ */
(function (App) {
  'use strict';

  var T = null;

  /* 配色沿用展馆：土黄、深褐、暖光、青灰 */
  var COL = {
    earth:    0x6f5c3e,
    earthDk:  0x4f3f2b,
    road:     0x7a6849,
    /* 石材抬亮并去暖：夯土地面是暖褐，台基/阶条/铺石必须是偏冷的浅灰，
       两者明度差一档，画面才有"人造物"与"土地"的分层。原来 0x6a6157 太接近地面。 */
    stone:    0x8f8b80,
    stoneDk:  0x5e574b,
    wood:     0x3a2a1b,
    /* 草顶压暗：屋面上半部要能被天光"吃"进去，否则远看是一块浅色板 */
    thatch:   0x3f3323,
    plaster:  0xa89272,
    leaf:     0x4c5a3a,
    leafDk:   0x36412a,
    water:    0x27383a,
    ember:    0xffb066
  };

  /* ---------------- 噪声 ---------------- */
  function hash2(i, j) {
    var n = i * 374761393 + j * 668265263;
    n = (n ^ (n >> 13)) * 1274126177;
    return ((n ^ (n >> 16)) >>> 0) / 4294967295;
  }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function vnoise(x, z) {
    var xi = Math.floor(x), zi = Math.floor(z);
    var xf = smooth(x - xi), zf = smooth(z - zi);
    var a = hash2(xi, zi), b = hash2(xi + 1, zi);
    var c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
    return (a * (1 - xf) + b * xf) * (1 - zf) + (c * (1 - xf) + d * xf) * zf;
  }
  function sstep(e0, e1, x) {
    var t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  }

  /* 地形高度：中心广场压平，外圈隆起成山（自然的活动边界）。
     角色贴地、建筑落座、草丛分布都读这一个函数，所以三者永远吻合。 */
  function terrainH(x, z) {
    var r = Math.sqrt(x * x + z * z);
    var h = 0;
    h += Math.sin(x * 0.052 + 1.3) * Math.cos(z * 0.045 - 0.7) * 1.15;
    h += Math.sin(x * 0.017 - 0.4) * Math.cos(z * 0.021 + 1.1) * 2.30;
    h += (vnoise(x * 0.03, z * 0.03) - 0.5) * 3.0;
    h += Math.sin(x * 0.085 + z * 0.031) * Math.cos(z * 0.072 - 0.4) * 0.85;
    h *= sstep(14, 30, r);
    var rim = Math.max(0, (r - 58) / 24);
    h += rim * rim * 15;
    h += (vnoise(x * 0.26, z * 0.26) - 0.5) * 0.10 * sstep(10, 30, r);
    /* 出生台地：广场南侧一整块 3.2 米高的缓台。
       这一条是"平面地图"和"可探索空间"的分水岭 —— 玩家站在高处往下看，
       近景是脚下的坡与草、中景是环形道路与广场、远景是宗庙屋脊与五区地标，
       三个层次同时进画；停在平地中央时，这三层是压扁在一起的。 */
    h += Math.exp(-Math.pow((x) * 0.062, 2) - Math.pow((z - 27) * 0.058, 2)) * 3.2 * sstep(13.5, 19, r);
    return h;
  }

  /* ---------------- 几何合并 ----------------
     没有引入 BufferGeometryUtils（它在 examples 里，UMD 版没打包），
     自己拼一次：所有几何先转非索引，再按 attribute 拷进一个大 Float32Array。
     一座聚落的上百个构件因此只留十几个 draw call。 */
  function mergeGeos(items) {
    var gs = [], total = 0, i, g;
    for (i = 0; i < items.length; i++) {
      g = items[i].g;
      g = g.index ? g.toNonIndexed() : g.clone();
      if (items[i].m) { g.applyMatrix4(items[i].m); }
      if (!g.attributes.normal) { g.computeVertexNormals(); }
      gs.push(g);
      total += g.attributes.position.count;
    }
    if (!total) { return null; }
    var pos = new Float32Array(total * 3);
    var nor = new Float32Array(total * 3);
    var uv = new Float32Array(total * 2);
    var o = 0;
    for (i = 0; i < gs.length; i++) {
      g = gs[i];
      var n = g.attributes.position.count;
      pos.set(g.attributes.position.array.subarray(0, n * 3), o * 3);
      nor.set(g.attributes.normal.array.subarray(0, n * 3), o * 3);
      if (g.attributes.uv) { uv.set(g.attributes.uv.array.subarray(0, n * 2), o * 2); }
      o += n;
      g.dispose();
    }
    var out = new T.BufferGeometry();
    out.setAttribute('position', new T.BufferAttribute(pos, 3));
    out.setAttribute('normal', new T.BufferAttribute(nor, 3));
    out.setAttribute('uv', new T.BufferAttribute(uv, 2));
    return out;
  }

  function m4(x, y, z, rx, ry, rz, sx, sy, sz) {
    var m = new T.Matrix4();
    var q = new T.Quaternion().setFromEuler(new T.Euler(rx || 0, ry || 0, rz || 0, 'YXZ'));
    m.compose(new T.Vector3(x, y, z), q, new T.Vector3(sx == null ? 1 : sx, sy == null ? 1 : sy, sz == null ? 1 : sz));
    return m;
  }

  /* ---------------- 地表纹理 ----------------
     一张 512 的土面：底色 + 细颗粒 + 几块深斑 + 零星石子。
     不做无缝处理也不做 UV 接缝修饰 —— 重复 12 次后，接缝在这个尺度上看不出来。 */
  function soilTex() {
    var S = 512;
    var cv = document.createElement('canvas');
    cv.width = cv.height = S;
    var c = cv.getContext('2d');
    var R = App.museumTex ? App.museumTex.rng(4242) : Math.random;
    c.fillStyle = '#7a6647'; c.fillRect(0, 0, S, S);
    /* 深色斑块：用一圈软圆，避免出现硬边色块 */
    for (var b = 0; b < 26; b++) {
      var bx = R() * S, by = R() * S, br = 30 + R() * 90;
      var g = c.createRadialGradient(bx, by, 2, bx, by, br);
      var dark = R() > 0.5;
      g.addColorStop(0, dark ? 'rgba(66,52,34,.24)' : 'rgba(146,126,92,.20)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g;
      c.fillRect(bx - br, by - br, br * 2, br * 2);
    }
    /* 颗粒 */
    for (var i = 0; i < 14000; i++) {
      var x = R() * S, y = R() * S, r = 0.5 + R() * 1.7;
      var v = 0.32 + R() * 0.46;
      c.fillStyle = R() > 0.5
        ? 'rgba(' + Math.round(52 * v + 40) + ',' + Math.round(44 * v + 32) + ',' + Math.round(30 * v + 22) + ',.5)'
        : 'rgba(' + Math.round(200 * v + 40) + ',' + Math.round(180 * v + 36) + ',' + Math.round(146 * v + 30) + ',.28)';
      c.fillRect(x, y, r, r);
    }
    /* 石子：少量浅色小点，走起来有尺度感 */
    for (var k = 0; k < 260; k++) {
      var sx = R() * S, sy = R() * S, sr = 1.2 + R() * 3.2;
      c.beginPath();
      c.ellipse(sx, sy, sr, sr * (0.6 + R() * 0.5), R() * 3, 0, Math.PI * 2);
      c.fillStyle = 'rgba(' + Math.round(150 + R() * 60) + ',' + Math.round(136 + R() * 50) + ',' +
        Math.round(110 + R() * 40) + ',.5)';
      c.fill();
    }
    return cv;
  }
  function canvasTex(cv, rep) {
    var t = new T.CanvasTexture(cv);
    if (T.SRGBColorSpace) { t.colorSpace = T.SRGBColorSpace; }
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set(rep || 1, rep || 1);
    t.anisotropy = 4;
    return t;
  }

  /* 草顶贴图：一把把顺坡压下去的茅草 + 两道捆扎横线。
     没有它，屋顶就是一个纯色多面体 —— 从上方俯视时整块深褐色，
     读起来像"盖了块板"，有茅草纹理之后才有"层层铺草"的量感。 */
  function thatchTex() {
    var S = 256;
    var cv = document.createElement('canvas');
    cv.width = cv.height = S;
    var c = cv.getContext('2d');
    var R = App.museumTex ? App.museumTex.rng(9137) : Math.random;
    c.fillStyle = '#6b5734'; c.fillRect(0, 0, S, S);
    /* 草茎：竖向短笔，末端渐细，深浅交替 */
    for (var i = 0; i < 2600; i++) {
      var x = R() * S, y = R() * S, len = 10 + R() * 26, w = 1 + R() * 1.6;
      var v = R();
      var col = v < 0.42 ? 'rgba(58,44,26,.55)'
              : v < 0.78 ? 'rgba(126,102,62,.50)'
                         : 'rgba(178,150,100,.40)';
      c.strokeStyle = col;
      c.lineWidth = w;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + (R() - 0.5) * 5, y + len);
      c.stroke();
    }
    /* 捆扎横线：三条略弯的深线，模拟草束之间的压条 */
    c.strokeStyle = 'rgba(42,32,18,.42)';
    for (var k = 0; k < 3; k++) {
      var yy = 42 + k * 78;
      c.lineWidth = 3.5;
      c.beginPath();
      c.moveTo(0, yy);
      for (var xx = 0; xx <= S; xx += 16) { c.lineTo(xx, yy + Math.sin(xx * 0.08 + k) * 2.5); }
      c.stroke();
    }
    return cv;
  }

  /* ---------------- 材质 ---------------- */
  function build(opts) {
    T = window.THREE;
    var o = opts || {};
    var root = new T.Group();
    root.name = 'settlement';

    var MAT = {
      earth:   new T.MeshStandardMaterial({ color: COL.earth, roughness: 0.98, metalness: 0.0 }),
      /* 路面也走土石贴图：纯色面在带纹理的地面上会显得"刷了一条白漆"。
         注意 map 会和 color 相乘 —— 上一版 color 给 0x8f7f66，乘上土黄贴图直接压成
         一条深褐色沟（看着像护城河）。这里反过来：color 给亮米色，只当"压实了的浅土"。 */
      road:    new T.MeshStandardMaterial({ map: canvasTex(soilTex(), 26), color: 0xb09d80,
                                            roughness: 1.0, metalness: 0.0 }),
      stone:   new T.MeshStandardMaterial({ color: COL.stone, roughness: 0.9, metalness: 0.03 }),
      stoneDk: new T.MeshStandardMaterial({ color: COL.stoneDk, roughness: 0.86, metalness: 0.05 }),
      wood:    new T.MeshStandardMaterial({ color: COL.wood, roughness: 0.82, metalness: 0.04 }),
      thatch:  new T.MeshStandardMaterial({ color: 0x8a7448, map: canvasTex(thatchTex(), 1),
                                            roughness: 1.0, metalness: 0.0, side: T.DoubleSide }),
      plaster: new T.MeshStandardMaterial({ color: COL.plaster, roughness: 0.95, metalness: 0.0 }),
      boneFace: new T.MeshStandardMaterial({ color: 0xcfc39c, roughness: 0.72, metalness: 0.03 }),
      bronze: new T.MeshStandardMaterial({ color: 0x6f8163, roughness: 0.44, metalness: 0.58 }),
      leaf:    new T.MeshStandardMaterial({ color: COL.leaf, roughness: 0.95, metalness: 0.0 }),
      leafDk:  new T.MeshStandardMaterial({ color: COL.leafDk, roughness: 0.95, metalness: 0.0 }),
      water:   new T.MeshStandardMaterial({ color: COL.water, roughness: 0.16, metalness: 0.55,
                                            transparent: true, opacity: 0.86 })
    };

    /* 按材质分组收集，最后一材质一 mesh */
    var buckets = {};
    function add(key, g, x, y, z, rx, ry, rz, sx, sy, sz) {
      (buckets[key] || (buckets[key] = [])).push({
        g: g, m: m4(x, y, z, rx, ry, rz, sx, sy, sz)
      });
    }

    /* 单位四棱锥不再用于屋顶：从上方看，锥的轮廓是菱形，一眼假。
       改成真正的庑殿顶（矩形檐口 + 一条屋脊），这是中国早期建筑的正形：
         檐口四角 A B C D，屋脊 P–Q 沿长边、两端各内收 inset
         前后两坡 + 左右两个三角山面 + 底面封板
       绕序按"法线朝外"写，另开 DoubleSide 兜底，任何一面都不至于漏光。 */
    function hipRoofGeo(w, d, h, inset) {
      var hw = w / 2, hd = d / 2;
      var A = [-hw, 0, -hd], B = [hw, 0, -hd], C = [hw, 0, hd], D = [-hw, 0, hd];
      var P = [-hw + inset, h, 0], Q = [hw - inset, h, 0];
      var tris = [
        A, B, Q, A, Q, P,          /* 前坡 */
        C, D, P, C, P, Q,          /* 后坡 */
        D, A, P,                   /* 左山 */
        B, C, Q,                   /* 右山 */
        A, D, C, A, C, B           /* 底面 */
      ];
      /* 绕序必须逐面反一次。
         上面那组顶点顺序算出来的法线全部朝内（用 (v1-v0)×(v2-v0) 验算：
         前坡 y 分量为负、左山 x 分量为正），结果整片屋顶是背面 —— 被背面剔除后
         表现就是"房子没有顶"，从上往下看能直接看进屋里。这里统一交换 v1/v2 修正。 */
      var pos = new Float32Array(tris.length * 3);
      for (var i = 0; i < tris.length; i += 3) {
        var a = tris[i], b = tris[i + 2], c = tris[i + 1];
        pos[i * 3] = a[0]; pos[i * 3 + 1] = a[1]; pos[i * 3 + 2] = a[2];
        pos[(i + 1) * 3] = b[0]; pos[(i + 1) * 3 + 1] = b[1]; pos[(i + 1) * 3 + 2] = b[2];
        pos[(i + 2) * 3] = c[0]; pos[(i + 2) * 3 + 1] = c[1]; pos[(i + 2) * 3 + 2] = c[2];
      }
      var g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(pos, 3));
      /* 平面投影 UV：草顶贴图沿屋面铺，按屋面的宽/深归一化。
         没有 uv 的话，MAT.thatch 上挂的 map 会被整片忽略 —— 屋顶退回纯色板。 */
      var uv = new Float32Array((pos.length / 3) * 2);
      for (var u = 0; u < pos.length; u += 3) {
        var vi = (u / 3) * 2;
        uv[vi] = pos[u] / w * 3.0 + 1.5;
        uv[vi + 1] = pos[u + 2] / d * 3.0 + 1.5;
      }
      g.setAttribute('uv', new T.BufferAttribute(uv, 2));
      g.computeVertexNormals();
      return g;
    }
    var roofCache = {};
    function roof(key, x, y, z, w, d, h, rot) {
      var kk = [Math.round(w * 10), Math.round(d * 10), Math.round(h * 10)].join('_');
      var g = roofCache[kk];
      if (!g) {
        /* 脊长取短边的 45%：太短成攒尖，太长成硬山 */
        g = roofCache[kk] = hipRoofGeo(w, d, h, Math.min(w, d) * 0.30);
      }
      add(key, g, x, y, z, 0, rot || 0, 0);
    }

    var colliders = [];
    var spots = [];
    var glyphItems = [];
    var charPlates = [];                /* 保留字段：旧的平面碑面已全部换成实体物件，这里恒为空 */
    var fires = [];                    /* 火塘：门阙与祭坛都要往里加，所以先声明 */
    /* 五区归入三关：时间顺序上的三节课，不是随手点的地图。
       0 = 随时可自由探索的额外内容。 */
    var LEVEL_OF = { sky: 1, land: 2, plant: 2, beast: 3, life: 3 };
    /* 碰撞盒带高度：角色只关心 x/z（走不过去），
       相机要关心 y —— 相机比屋顶高时不该被"挡住"，否则抬头就被强行拉近。 */
    function block(x, z, hx, hz, h) {
      colliders.push({ x: x, z: z, hx: hx, hz: hz, h: h == null ? 6.5 : h });
    }

    /* ---------------- 地形 ---------------- */
    var SIZE = 150, SEG = 108;
    var tg = new T.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    tg.rotateX(-Math.PI / 2);
    var tp = tg.attributes.position;
    var tint = new Float32Array(tp.count * 3);
    for (var vi = 0; vi < tp.count; vi++) {
      var px = tp.getX(vi), pz = tp.getZ(vi);
      var hh = terrainH(px, pz);
      tp.setY(vi, hh);
      /* 顶点色只做明暗（0.72~1.02），颜色交给土层贴图 —— 两个都上色会糊成一团 */
      var sh = 0.72 + sstep(-1.5, 4.0, hh) * 0.20 + vnoise(px * 0.09, pz * 0.09) * 0.10;
      tint[vi * 3] = sh; tint[vi * 3 + 1] = sh * 0.985; tint[vi * 3 + 2] = sh * 0.955;
    }
    tg.setAttribute('color', new T.BufferAttribute(tint, 3));
    tg.computeVertexNormals();
    var ground = new T.Mesh(tg, new T.MeshStandardMaterial({
      map: canvasTex(soilTex(), 14),
      vertexColors: true, roughness: 0.99, metalness: 0.0
    }));
    ground.receiveShadow = true;
    ground.name = 'terrain';
    root.add(ground);

    /* ---------------- 道路 ----------------
       不能用"平铺的薄箱去贴地形"：地形有起伏，盒子之间立刻现出锯齿和台阶。
       正确做法是按路径生成一条贴地的三角带 —— 每个顶点各自采样 terrainH，
       路面因此永远跟着地走，不会一段悬空一段埋进土里。 */
    var ZONES = [
      { id: 'sky',   name: '天象台', x: 0,   z: -44, glyph: '日' },
      { id: 'land',  name: '山川道', x: 42,  z: -16, glyph: '山' },
      { id: 'plant', name: '草木林', x: -44, z: -6,  glyph: '木' },
      { id: 'beast', name: '禽兽圈', x: 33,  z: 30,  glyph: '鹿' },
      { id: 'life',  name: '人居里', x: -29, z: 34,  glyph: '邑' }
    ];

    function ribbon(pts, halfW, lift) {
      /* pts: [{x,z}]；生成左右两条边，逐点贴地 */
      var L = [], R = [], i, n = pts.length;
      for (i = 0; i < n; i++) {
        var p = pts[i];
        var a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
        var dx = b.x - a.x, dz = b.z - a.z;
        var len = Math.hypot(dx, dz) || 1;
        var nx = -dz / len, nz = dx / len;
        /* 抬升基准取"邻域最高"而不是当前点：渲染出来的地形按 1.389 米的格子插值，
           格心处的真值可以比三角面低十几厘米 —— 路面按真值铺就会被地形咬掉一块。
           再叠 0.16 米，正好压在地皮（cellTop + 0.05）上面一点，两者不会互相切。 */
        var y = Math.max(terrainH(p.x, p.z),
                         terrainH(p.x + 0.9, p.z), terrainH(p.x - 0.9, p.z),
                         terrainH(p.x, p.z + 0.9), terrainH(p.x, p.z - 0.9))
                + (lift == null ? 0.16 : lift);
        L.push([p.x + nx * halfW, y, p.z + nz * halfW]);
        R.push([p.x - nx * halfW, y, p.z - nz * halfW]);
      }
      var pos = [];
      for (i = 0; i < n - 1; i++) {
        var l0 = L[i], r0 = R[i], l1 = L[i + 1], r1 = R[i + 1];
        /* 绕序必须让法线朝上：(l0→l1→r0) 的叉积才是 +y。
           反过来写，路面会朝下、被背面剔除 —— 表现就是"路根本没画出来"。 */
        pos.push(l0[0], l0[1], l0[2], l1[0], l1[1], l1[2], r0[0], r0[1], r0[2]);
        pos.push(r0[0], r0[1], r0[2], l1[0], l1[1], l1[2], r1[0], r1[1], r1[2]);
      }
      var g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(new Float32Array(pos), 3));
      g.computeVertexNormals();
      return g;
    }
    function road(x1, z1, x2, z2, w) {
      var pts = [], SEGS = 14;
      for (var i = 0; i <= SEGS; i++) {
        var t = i / SEGS;
        pts.push({ x: x1 + (x2 - x1) * t, z: z1 + (z2 - z1) * t });
      }
      add('road', ribbon(pts, w / 2), 0, 0, 0);
    }
    /* 环广场一圈 */
    (function ring() {
      var pts = [];
      for (var i = 0; i <= 40; i++) {
        var a = (i / 40) * Math.PI * 2;
        pts.push({ x: Math.sin(a) * 15, z: Math.cos(a) * 15 });
      }
      add('road', ribbon(pts, 1.45), 0, 0, 0);
    })();
    ZONES.forEach(function (z) {
      var a0 = Math.atan2(z.x, z.z);
      /* 起点从 14 挪到 16.5：14 时这条岔路和 r15 的环路重叠一米多，
         两条路面同高 → z-fighting，截图里路就成了深浅两块拼起来的补丁。 */
      road(Math.sin(a0) * 16.5, Math.cos(a0) * 16.5, z.x, z.z, 3.6);
    });

    /* ---------------- 中央宗庙 ----------------
       夯土台基 + 两排柱 + 重檐草顶。玩家在广场上第一眼要看见它。 */
    (function shrine() {
      /* 尺度收紧：原来 W17×D12、檐口 5.05 米、总高 8.35 米，站在 13 米外的广场上，
         整个上半屏都是它的屋面（俯视看是一块深褐色大板）。
         改成 W13×D9，屋面进深减少、坡度从 14° 提到 32° —— 现在读作"檐口在头顶上方"，
         而不是"头上盖了一块板"。 */
      var W = 13, D = 9, BASE = 1.15;
      add('stoneDk', new T.BoxGeometry(W, BASE, D), 0, BASE / 2, 0);
      add('stone', new T.BoxGeometry(W + 1.2, 0.32, D + 1.2), 0, BASE + 0.05, 0);
      block(0, 0, W / 2 + 0.6, D / 2 + 0.6, 9.0);

      var colGeo = new T.CylinderGeometry(0.22, 0.27, 4.0, 10, 1);
      var nC = 5;
      for (var cx = 0; cx < nC; cx++) {
        var x = -W / 2 + 1.2 + cx * ((W - 2.4) / (nC - 1));
        add('wood', colGeo, x, BASE + 2.0, D / 2 - 1.2);
        add('wood', colGeo, x, BASE + 2.0, -D / 2 + 1.2);
      }
      /* 墙体内收，柱廊在外 */
      add('plaster', new T.BoxGeometry(W - 3.6, 3.1, D - 4.6), 0, BASE + 1.55, 0);
      add('wood', new T.BoxGeometry(2.2, 2.2, 0.5), 0, BASE + 1.1, (D - 4.6) / 2);
      add('wood', new T.BoxGeometry(W - 2.4, 0.40, D - 3.4), 0, BASE + 3.35, 0);
      /* 重檐：下檐压在柱顶，上檐坐在下檐屋脊处 */
      var eave = BASE + 3.35;
      roof('thatch', 0, eave, 0, W + 2.8, D + 2.8, 3.60);
      roof('thatch', 0, eave + 3.28, 0, W - 2.2, D - 2.2, 2.60);
      /* 门前台阶：四级，全部落在台基外侧 */
      for (var s = 0; s < 4; s++) {
        add('stone', new T.BoxGeometry(4.6, 0.30, 0.95), 0, 0.15 + s * 0.27,
          D / 2 + 0.50 + (3 - s) * 0.86);
      }
    })();

    /* ---------------- 观星台（天象） ---------------- */
    (function observatory() {
      var zx = 0, zz = -44;
      for (var t = 0; t < 3; t++) {
        var w = 13 - t * 3.2;
        add('stoneDk', new T.BoxGeometry(w, 1.15, w), zx, 0.58 + t * 1.15, zz);
      }
      block(zx, zz, 6.6, 6.6, 9.0);
      var TOP = 3.45;
      /* 台上四柱 */
      var pg = new T.CylinderGeometry(0.20, 0.24, 3.0, 10);
      [[-2.5, -2.5], [2.5, -2.5], [-2.5, 2.5], [2.5, 2.5]].forEach(function (p) {
        add('wood', pg, zx + p[0], TOP + 1.5, zz + p[1]);
      });
      /* 柱顶横梁围成方框（原来是个悬空圆环，看着像呼啦圈） */
      var BEAM = new T.BoxGeometry(1, 1, 1);
      add('wood', BEAM, zx, TOP + 3.02, zz - 2.5, 0, 0, 0, 5.6, 0.26, 0.26);
      add('wood', BEAM, zx, TOP + 3.02, zz + 2.5, 0, 0, 0, 5.6, 0.26, 0.26);
      add('wood', BEAM, zx - 2.5, TOP + 3.02, zz, 0, 0, 0, 0.26, 0.26, 5.6);
      add('wood', BEAM, zx + 2.5, TOP + 3.02, zz, 0, 0, 0, 0.26, 0.26, 5.6);
      /* 中央表木：立杆测影，杆顶一块小圆盘 —— 商代观象的"表" */
      /* 表木加粗一档：原来 Φ0.10×4.1 太细，50 米外只剩一根头发丝，
         正对镜头时像"地面上扎了一根针"。改成 Φ0.24 并压到 3.2 米。 */
      add('wood', new T.CylinderGeometry(0.20, 0.26, 3.2, 10), zx, TOP + 1.60, zz);
      add('stone', new T.CylinderGeometry(0.50, 0.50, 0.12, 18), zx, TOP + 3.26, zz);
      /* 上台阶：三层夯土台之间原来没有任何连接，
         从广场看过去就是"三个叠起来的盒子"，根本读不出这是能走上去的台。
         南面补一道 9 级踏步（每级 0.38 米高 ≈ 两级夯土），把三层串成一条路。 */
      for (var st2 = 0; st2 < 9; st2++) {
        var sh2 = 0.38, sw = 3.4;
        add('stone', new T.BoxGeometry(sw, sh2, 0.62),
          zx, 0.19 + st2 * sh2, zz + 6.4 + (8 - st2) * 0.52);
      }
      /* 地面上的南北刻线：影子落在这条线上 */
      add('stone', new T.BoxGeometry(0.30, 0.06, 8.0), zx, 0.07, zz + 6.2);
    })();

    /* ---------------- 山川：三峰与泉 ---------------- */
    (function mountains() {
      var mx = 42, mz = -16;
      /* 三峰并立（不是七颗乱石）：主峰高、两翼低，山脚用缓坡接住 */
      [{ dx: 0, dz: -3.0, r: 5.4, h: 8.2 },
       { dx: 4.6, dz: 1.6, r: 4.0, h: 5.6 },
       { dx: -4.8, dz: 2.0, r: 3.4, h: 4.6 }].forEach(function (m) {
        /* 山体必须坐在真实地面上。原来 y 写死 h/2-0.4，而 (42,-16) 的地形是起伏的，
           山头要么悬空一截，要么半截埋进土里。 */
        var mgy = terrainH(mx + m.dx, mz + m.dz) - 0.35;
        add('stoneDk', new T.ConeGeometry(m.r, m.h, 6, 1), mx + m.dx, mgy + m.h / 2, mz + m.dz,
          0, m.dx, 0, 1, 1, 0.92);
        /* 山脚一圈碎石，压住"锥体直接插在地上"的假 */
        for (var k = 0; k < 5; k++) {
          var a = k / 5 * Math.PI * 2 + m.dx;
          add('stoneDk', new T.ConeGeometry(1.0 + (k % 2) * 0.4, 1.1, 5, 1),
            mx + m.dx + Math.cos(a) * (m.r * 0.86), mgy + 0.7,
            mz + m.dz + Math.sin(a) * (m.r * 0.86), 0, a, 0, 1, 1, 0.92);
        }
      });
      block(mx, mz, 8.0, 8.0, 6.0);
      /* 泉：一圈石砌，中间暗水面 */
      var sx = mx - 9, sz = mz + 7;
      add('stone', new T.TorusGeometry(2.5, 0.34, 6, 20), sx, 0.2, sz, Math.PI / 2, 0, 0);
      add('water', new T.CircleGeometry(2.35, 24), sx, 0.16, sz, -Math.PI / 2, 0, 0);
    })();

    /* ---------------- 草木：树林 ---------------- */
    (function forest() {
      var fx = -44, fz = -6;
      var R = App.museumTex ? App.museumTex.rng(7717) : Math.random;
      /* 树必须围成一圈，中间留出空地 —— 学习字碑就摆在这块空地上。
         上一版 rr = 3 + R*13 把树直接种进了区心：站进去满屏树干与锥形树冠，
         连自己角色都看不见，更别说字碑。现在中心 10 米留空，树只在 10~21 米环上。 */
      var trunk = new T.CylinderGeometry(0.22, 0.32, 2.2, 7);
      var crown = new T.ConeGeometry(1.45, 2.9, 7, 1);
      var crown2 = new T.ConeGeometry(1.05, 2.0, 7, 1);
      for (var i = 0; i < 26; i++) {
        var a = (i / 26) * Math.PI * 2 + (R() - 0.5) * 0.22;
        var rr = 10.5 + R() * 10.0;
        var tx = fx + Math.cos(a) * rr, tz = fz + Math.sin(a) * rr;
        var sc = 0.8 + R() * 0.6;
        var gy = terrainH(tx, tz);
        add('wood', trunk, tx, gy + 1.0 * sc, tz, 0, R() * 6, 0, sc, sc, sc);
        add(R() > 0.5 ? 'leaf' : 'leafDk', crown, tx, gy + 2.0 * sc + 1.35 * sc, tz, 0, R() * 6, 0, sc, sc, sc);
        add(R() > 0.4 ? 'leafDk' : 'leaf', crown2, tx, gy + 2.0 * sc + 2.45 * sc, tz, 0, R() * 6, 0, sc, sc, sc);
      }
      /* 竹丛：细高杆，一丛一丛 */
      var bamboo = new T.CylinderGeometry(0.075, 0.10, 2.5, 5);
      for (var b = 0; b < 9; b++) {
        var ba = R() * Math.PI * 2, br = 11 + R() * 7;
        var bx = fx + Math.cos(ba) * br, bz = fz + Math.sin(ba) * br;
        var by = terrainH(bx, bz);
        for (var k = 0; k < 5; k++) {
          add('leafDk', bamboo, bx + (R() - 0.5) * 1.1, by + 1.25, bz + (R() - 0.5) * 1.1,
            (R() - 0.5) * 0.1, 0, (R() - 0.5) * 0.1);
        }
      }
      /* 树林不做整块阻挡：树是散的，绕树走才是对的 */
    })();

    /* ---------------- 禽兽：圈栏与水塘 ---------------- */
    (function pasture() {
      var px = 33, pz = 30;
      /* 木栅：一圈短柱 + 两道横杆 */
      var post = new T.CylinderGeometry(0.10, 0.12, 1.35, 6);
      var N = 26, RR = 9.5;
      for (var i = 0; i < N; i++) {
        var a = i / N * Math.PI * 2;
        var x = px + Math.cos(a) * RR, z = pz + Math.sin(a) * RR;
        var y = terrainH(x, z);
        add('wood', post, x, y + 0.67, z);
        var a2 = (i + 1) / N * Math.PI * 2;
        var x2 = px + Math.cos(a2) * RR, z2 = pz + Math.sin(a2) * RR;
        var mx = (x + x2) / 2, mz = (z + z2) / 2;
        var len = Math.hypot(x2 - x, z2 - z);
        var rot = Math.atan2(x2 - x, z2 - z);
        add('wood', new T.BoxGeometry(0.08, 0.09, len), mx, y + 1.02, mz, 0, rot, 0);
        add('wood', new T.BoxGeometry(0.08, 0.09, len), mx, y + 0.52, mz, 0, rot, 0);
      }
      block(px, pz, 9.5, 9.5, 0.9);
      /* 水塘 */
      add('water', new T.CircleGeometry(4.2, 28), px - 12, -0.35, pz + 4, -Math.PI / 2, 0, 0);
      add('stone', new T.TorusGeometry(4.2, 0.42, 6, 26), px - 12, -0.30, pz + 4, Math.PI / 2, 0, 0);
    })();

    /* ---------------- 人居：屋舍群 ---------------- */
    (function village() {
      var vx = -29, vz = 34;
      var R = App.museumTex ? App.museumTex.rng(3311) : Math.random;
      var HOUSES = [
        [-7, -5, 0.5, 1.0], [0, -8, -0.2, 1.15], [7, -4, 0.9, 0.9],
        [-8, 3, -0.6, 1.05], [1, 2, 0.15, 1.25], [8, 4, -0.9, 0.95]
      ];
      HOUSES.forEach(function (h) {
        var x = vx + h[0], z = vz + h[1], rot = h[2], sc = h[3];
        var w = 4.4 * sc, d = 3.6 * sc, bh = 2.3 * sc;
        var gy = terrainH(x, z);
        /* 台基 */
        add('stone', new T.BoxGeometry(w + 0.7, 0.34, d + 0.7), x, gy + 0.17, z, 0, rot, 0);
        /* 墙 */
        add('plaster', new T.BoxGeometry(w, bh, d), x, gy + 0.34 + bh / 2, z, 0, rot, 0);
        /* 四坡草顶：出檐 12%，脊高 0.9 倍墙高 */
        roof('thatch', x, gy + 0.34 + bh - 0.05 * sc, z,
          w * 1.12, d * 1.12, 1.18 * sc, rot);
        /* 门洞：一块深色薄片贴在正面 */
        add('wood', new T.BoxGeometry(1.0 * sc, 1.55 * sc, 0.12),
          x + Math.sin(rot) * (d / 2 + 0.04), gy + 0.34 + 0.78 * sc, z + Math.cos(rot) * (d / 2 + 0.04),
          0, rot, 0);
        block(x, z, w / 2 + 0.4, d / 2 + 0.4, 0.34 + bh + 1.2 * sc);
      });
      /* 陶窑：一座圆顶小窑，冒火光 */
      var kx = vx + 13, kz = vz - 3;
      add('stoneDk', new T.CylinderGeometry(1.5, 1.9, 1.8, 16, 1), kx, terrainH(kx, kz) + 0.9, kz);
      add('stoneDk', new T.SphereGeometry(1.5, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), kx,
        terrainH(kx, kz) + 1.8, kz, 0, 0, 0, 1, 0.62, 1);
      block(kx, kz, 1.9, 1.9, 2.8);
    })();

    /* ---------------- 遗址探方 ----------------
       下沉的方坑 + 三级土阶 + 坑壁露出的骨片。这是"考古"在世界上留下的痕迹，
       也是第一个真正可交互的目标（靠近可以下坑捡骨、读字）。 */
    (function pit() {
      var x = 19, z = 15, W = 9, D = 7, DEP = 1.5;
      var gy = terrainH(x, z);
      /* 坑：四壁 + 底（用薄板围，不挖地形 —— 挖地形要重算整张网格） */
      add('earthDk', new T.BoxGeometry(W, 0.1, D), x, gy - DEP, z);
      add('earthDk', new T.BoxGeometry(W, DEP, 0.55), x, gy - DEP / 2, z - D / 2);
      add('earthDk', new T.BoxGeometry(W, DEP, 0.55), x, gy - DEP / 2, z + D / 2);
      add('earthDk', new T.BoxGeometry(0.55, DEP, D), x - W / 2, gy - DEP / 2, z);
      add('earthDk', new T.BoxGeometry(0.55, DEP, D), x + W / 2, gy - DEP / 2, z);
      /* 三级台阶下坑（南侧） */
      for (var s = 0; s < 3; s++) {
        add('earth', new T.BoxGeometry(2.4, 0.5, 0.9), x, gy - 0.25 - s * 0.5, z + D / 2 - 0.6 - s * 0.9);
      }
      /* 坑壁上的骨片（白点）：只是视觉线索，真交互走 spots */
      var R = App.museumTex ? App.museumTex.rng(99) : Math.random;
      for (var i = 0; i < 7; i++) {
        add('plaster', new T.BoxGeometry(0.5 + R() * 0.4, 0.07, 0.34 + R() * 0.3),
          x - 3 + R() * 6, gy - DEP + 0.06, z - 2 + R() * 4, 0, R() * 3, 0);
      }
      block(x - W / 2 - 0.4, z, 0.5, D / 2, 0.0);
      block(x + W / 2 + 0.4, z, 0.5, D / 2, 0.0);
      block(x, z - D / 2 - 0.4, W / 2, 0.5, 0.0);
      block(x, z + D / 2 + 0.4, W / 2, 0.5, 0.0);
      spots.push({ id: 'pit', kind: 'dig', name: '发掘中的探方', x: x, z: z + D / 2 + 1.2, r: 3.4,
        data: { char: '骨' } });
    })();

    /* ---------------- 地点碑：五区入口 ----------------
       原来是一块"贴了字贴图的薄石板"。现在换成真正的实体石刻：
       立石本体 + 从石面凸出来的甲骨字（ExtrudeGeometry 挤出的实体笔画，
       侧面有厚度、会投影），站在下面就能一眼读出来这是什么地方。 */
    var GK = App.worldGlyph;
    ZONES.forEach(function (z, zi) {
      var gy0 = terrainH(z.x, z.z);
      var face = z.x + (z.x === 0 ? 0 : (z.x > 0 ? -2.6 : 2.6));
      var fz = z.z + (z.z > 0 ? -3.8 : 3.8);
      var fy = terrainH(face, fz);
      var ang = Math.atan2(face, fz);
      var zoneId = z.id;
      if (GK) {
        var it = GK.buildItem({ char: z.glyph, style: 'stele', size: 0.62, seed: 900 + zi * 37, zone: zoneId, marker: true });
        it.group.position.set(face, fy, fz);
        it.group.rotation.y = ang + Math.PI;        /* 面朝来路 */
        it.group.name = 'zonestele-' + zoneId;
        it.group.traverse(function (ob) {
          if (ob.isMesh) { ob.userData.kind = 'zone'; ob.userData.zone = zoneId; ob.userData.item = it; }
        });
        root.add(it.group);
        glyphItems.push(it);
        var cc = it.collider;
        block(face, fz, cc.hx, cc.hz, cc.h);
        /* 两侧各一根木柱，把"这里是入口"这件事做清楚 */
        [-1.7, 1.7].forEach(function (dx) {
          var px0 = face + Math.cos(ang) * dx, pz0 = fz - Math.sin(ang) * dx;
          add('wood', new T.CylinderGeometry(0.13, 0.17, 2.7, 7), px0, terrainH(px0, pz0) + 1.35, pz0);
        });
        spots.push({ id: 'zone-' + zoneId, kind: 'zone', name: z.name, x: face, z: fz, r: 3.2,
          data: { zone: zoneId, glyph: z.glyph, level: LEVEL_OF[zoneId] || 0 } });
      } else {
        add('stoneDk', new T.BoxGeometry(2.0, 0.42, 1.1), face, fy + 0.21, fz);
        add('stone', new T.BoxGeometry(1.5, 2.5, 0.26), face, fy + 1.65, fz, 0, ang, 0);
        block(face, fz, 1.0, 0.6, 2.9);
        spots.push({ id: 'zone-' + zoneId, kind: 'zone', name: z.name, x: face, z: fz, r: 3.0,
          data: { zone: zoneId, glyph: z.glyph, level: LEVEL_OF[zoneId] || 0 } });
      }
    });

    /* ---------------- 实体文字区：38 个字各有载体 ----------------
       载体按分区语义来：
         天象 → 龟腹甲（卜辞正写在腹甲上）
         山川 → 整块立石（摩崖、碑碣）
         草木 → 整治过的骨片
         禽兽 → 牛肩胛骨（占卜用骨）
         人居 → 陶片 / 青铜牌（日用器物上的刻符）
       字不是"贴"上去的：每一笔都从 glyph-parts.json 的真字形笔画挤出，
       带倒角、有厚度、会投影，绕到侧面看是立体的。
       第二关要拆开拼的字另做成"青铜构件装置"。 */
    var MAP = (App.levels && App.levels.map) || null;
    if (MAP && MAP.zones && GK) {
      var FIELD = {
        sky:   { x: 0,    z: -34 },
        land:  { x: 33,   z: -13 },
        plant: { x: -35,  z: -6 },
        beast: { x: 23,   z: 26 },
        life:  { x: -18,  z: 25 }
      };
      var STYLE = { sky: 'plastron', plant: 'bone', beast: 'scapula', land: 'stele', life: 'pot' };
      /* 第二关的构字装置：这些字要被拆成实体构件再拼回去 */
      var ASSEMBLY = { '林': 2, '泉': 3, '谷': 2 };

      /* ★ 排布：不做等距方阵。
         上一版是 cols×rows 的矩形网格，33 个字排成 5×7 —— 一眼就是"仓库货架"，
         与"每个字都是值得走过去看的一件实物"这个前提冲突。
         现在改成「几处台地，每处 6~8 件，绕区心摆成一圈」：
           · 每处台地的朝向不同，走进去时看到的是斜侧面，不是一排正面朝天的方阵
           · 台地之间留 2~3 米的空，容得下走过去、绕过去
           · 同一件字在台地上的高度略有差，避免"全部同一个平面" */
      MAP.zones.forEach(function (zd) {
        if (!zd) { return; }
        var cen = FIELD[zd.id];
        if (!cen) { return; }
        var objs = (zd.objects || []).slice();
        var extra = (zd.extra || []).slice();
        var all = objs.concat(extra);
        if (!all.length) { return; }

        /* 需要拼的字单独拿出来：它是"主目标"，不能混在普通字里找不着 */
        var asms = all.filter(function (o) { return !!ASSEMBLY[o.char]; });
        var plain = all.filter(function (o) { return !ASSEMBLY[o.char]; });

        var GY0 = terrainH(cen.x, cen.z);
        /* 每处台地 6~8 件 */
        var PER = 7;
        var clusters = Math.max(1, Math.ceil(plain.length / PER));
        for (var ci = 0; ci < clusters; ci++) {
          var slice = plain.slice(ci * PER, (ci + 1) * PER);
          var ca = (ci / clusters) * Math.PI * 2 + (zd.id.length * 0.7);
          /* 只有一处台地就压在区心，多处则绕心一圈 */
          var crad = clusters === 1 ? 0 : 7.4;
          var ccx = cen.x + Math.cos(ca) * crad;
          var ccz = cen.z + Math.sin(ca) * crad;
          /* 台地上的字沿一条与视线垂直的弧排开，面朝区心 */
          var span = Math.PI * 0.62;
          slice.forEach(function (o, i) {
            var t = slice.length === 1 ? 0.5 : i / (slice.length - 1);
            var ang = ca + Math.PI / 2 + (t - 0.5) * span;
            var rad = 2.5 + (i % 2) * 0.55;
            var bx = ccx + Math.cos(ang) * rad;
            var bz = ccz + Math.sin(ang) * rad;
            var isAsm = false;
            var gy = terrainH(bx, bz);
            var it = GK.buildItem({
              char: o.char, zone: zd.id, seed: 1000 + i * 91 + ci * 17 + zd.id.length * 13,
              size: 0.40 + ((i % 3) * 0.022),
              style: STYLE[zd.id] || 'stele',
              clusters: 2
            });
            it.group.position.set(bx, gy, bz);
            /* 面朝区心（来路），再各偏一点，免得像仪仗队 */
            it.group.rotation.y = Math.atan2(cen.x - bx, cen.z - bz) + (((i * 7) % 5) - 2) * 0.035;
            root.add(it.group);
            glyphItems.push(it);
            var cc = it.collider;
            block(bx, bz, cc.hx, cc.hz, cc.h);
            spots.push({
              id: 'char-' + zd.id + '-' + o.char, kind: 'char', name: o.char,
              x: bx, z: bz, r: 2.0,
              data: { char: o.char, zone: zd.id, meaning: o.meaning, form: o.form,
                level: LEVEL_OF[zd.id] || 0, task: isAsm ? 'assembly' : 'read' }
            });
          });
        }

        /* 构字装置：区心正前，一个独立的高台，走到它面前就是要拼字 */
        asms.forEach(function (o, i) {
          var ang = (i - (asms.length - 1) / 2) * 0.55;
          var bx = cen.x + Math.sin(ang) * 3.2;
          var bz = cen.z - Math.cos(ang) * 3.2;
          var gy = terrainH(bx, bz);
          var it = GK.buildItem({
            char: o.char, zone: zd.id, seed: 500 + i * 37,
            size: 0.55, style: 'assembly', clusters: ASSEMBLY[o.char] || 2
          });
          it.group.position.set(bx, gy, bz);
          it.group.rotation.y = Math.atan2(cen.x - bx, cen.z - bz);
          root.add(it.group);
          glyphItems.push(it);
          var cc2 = it.collider;
          block(bx, bz, cc2.hx, cc2.hz, cc2.h);
          /* 装置座：一圈青铜基座，让它明显高出一个头 */
          add('bronze', new T.CylinderGeometry(1.15, 1.30, 0.26, 18), bx, gy + 0.13, bz);
          spots.push({
            id: 'char-' + zd.id + '-' + o.char, kind: 'char', name: o.char,
            x: bx, z: bz, r: 3.0,
            data: { char: o.char, zone: zd.id, meaning: o.meaning, form: o.form,
              level: LEVEL_OF[zd.id] || 0, task: 'assembly' }
          });
        });
      });

      /* 兵器架：人居区那 6 个"器物类"字（弓矢刀斧斤戈）总得有个实物在旁边，
         否则它们和"陶片上的刻符"没有区别。 */
      (function armRack() {
        var cen = FIELD.life;
        var bx = cen.x + 7.0, bz = cen.z - 5.0;
        var gy = terrainH(bx, bz);
        add('wood', new T.BoxGeometry(4.4, 0.22, 0.30), bx, gy + 1.95, bz, 0, 0.3, 0);
        [-2.0, 2.0].forEach(function (dx) {
          add('wood', new T.CylinderGeometry(0.10, 0.13, 2.0, 8),
            bx + Math.cos(0.3) * dx, gy + 1.0, bz - Math.sin(0.3) * dx);
        });
        /* 三把戈/刀横挂 + 两束矢 */
        for (var i = 0; i < 3; i++) {
          var xx = bx - 1.3 + i * 1.3;
          add('bronze', new T.BoxGeometry(0.09, 0.62, 0.035), xx, gy + 1.55, bz - 0.18, 0, 0.3, 0.12);
          add('bronze', new T.BoxGeometry(0.26, 0.10, 0.035), xx + 0.10, gy + 1.86, bz - 0.18, 0, 0.3, 0.5);
        }
        [0, 1].forEach(function (i) {
          var xx = bx + 1.05 + i * 0.30;
          for (var k = 0; k < 4; k++) {
            add('wood', new T.CylinderGeometry(0.016, 0.016, 1.05, 5),
              xx + k * 0.05, gy + 1.25, bz - 0.05, 0.10, 0, 0.05);
          }
        });
        block(bx, bz, 2.2, 0.4, 2.2);
      })();
    }

    /* ---------------- 关卡门阙 ----------------
       五区各有一座石阙立在来路上，隶属于某一关。
       没到那一关，门洞被一块"骨封牌"堵着（连同实体的碰撞），过不去。
       通关之后封牌升起来收进门楣里，这就是"关卡入口开启动画"。
       每座阙自带一个发微光的侦测点，走近会提示"第几关 · 未开启"。 */
    var gates = [];
    (function buildGates() {
      var LOCK = { sky: '日', land: '山', plant: '木', beast: '鹿', life: '邑' };
      ZONES.forEach(function (z, zi) {
        var lvl = LEVEL_OF[z.id] || 0;
        if (!lvl) { return; }
        var ang = Math.atan2(z.x, z.z);              /* 从广场望向该区的方向 */
        var R0 = 18.5;
        var gx = Math.sin(ang) * R0, gz = Math.cos(ang) * R0;
        var gy = terrainH(gx, gz);
        var perp = ang + Math.PI / 2;                /* 门朝向：横跨来路 */
        var hw = 2.5;
        function at(dx, dy, dz) {                    /* 沿"横向"偏移 */
          return [gx + Math.sin(perp) * dx, gy + dy, gz + Math.cos(perp) * dx + dz];
        }
        var p1 = at(-hw, 0, 0), p2 = at(hw, 0, 0);
        var pier = new T.BoxGeometry(0.78, 3.2, 0.86);
        add('stoneDk', pier, p1[0], p1[1] + 1.6, p1[2], 0, perp, 0);
        add('stoneDk', pier, p2[0], p2[1] + 1.6, p2[2], 0, perp, 0);
        /* 柱础 */
        add('stone', new T.BoxGeometry(1.05, 0.34, 1.1), p1[0], p1[1] + 0.17, p1[2], 0, perp, 0);
        add('stone', new T.BoxGeometry(1.05, 0.34, 1.1), p2[0], p2[1] + 0.17, p2[2], 0, perp, 0);
        /* 门楣 + 小檐 */
        var m1 = at(0, 3.25, 0), m2 = at(0, 3.85, 0);
        add('wood', new T.BoxGeometry(hw * 2 + 0.9, 0.44, 0.62), m1[0], m1[1], m1[2], 0, perp, 0);
        roof('thatch', at(0, 4.10, 0)[0], gy + 4.10, at(0, 4.10, 0)[2], hw * 2 + 1.8, 2.7, 1.55, perp);
        /* 檐下悬着的两片小骨：有风的样子靠后续 world3d 的轻微摆动 */
        [-1.1, 1.1].forEach(function (dx) {
          var t = at(dx, 2.6, 0);
          add('wood', new T.BoxGeometry(0.05, 0.5, 0.05), t[0], t[1], t[2], 0, perp, 0);
          add('boneFace', new T.BoxGeometry(0.34, 0.52, 0.06), t[0], t[1] - 0.55, t[2], 0, perp, 0);
        });
        /* 封牌：整块 —— 提升时连牌面带着字一起收进楣子里 */
        var seal = new T.Group();
        seal.position.set(gx, gy, gz);
        seal.rotation.y = perp + Math.PI;
        var panel = new T.Mesh(new T.BoxGeometry(hw * 1.75, 2.0, 0.16),
          new T.MeshStandardMaterial({ color: 0xb9ab86, roughness: 0.8, metalness: 0.03 }));
        panel.castShadow = true;
        var gm = GK ? GK.glyphMesh(LOCK[z.id] || z.glyph, 1.05, { color: 0x2f2618 }) : null;
        if (gm) { gm.position.set(0, 0.05, 0.10); gm.castShadow = true; }
        var postL = new T.Mesh(new T.BoxGeometry(0.16, 2.0, 0.2),
          new T.MeshStandardMaterial({ color: 0x4a3524, roughness: 0.85 }));
        postL.position.set(-hw * 0.87, 0, 0);
        var postR = postL.clone(); postR.position.x = hw * 0.87;
        seal.add(panel); seal.add(postL); seal.add(postR);
        if (gm) { seal.add(gm); }
        seal.position.y = gy + 1.18;
        seal.name = 'gate-seal-' + z.id;
        root.add(seal);

        block(p1[0], p1[2], 0.5, 0.5, 3.4);
        block(p2[0], p2[2], 0.5, 0.5, 3.4);
        var gb = { x: gx, z: gz, hx: hw * 0.92, hz: 0.45, h: 2.4, gate: z.id, level: lvl };
        if (lvl > 1) { colliders.push(gb); }
        gates.push({ id: z.id, level: lvl, zone: z.id, name: z.name,
          x: gx, z: gz, seal: seal, baseY: gy + 1.18, block: gb, open: lvl === 1 });
        spots.push({ id: 'gate-' + z.id, kind: 'gatezone', name: z.name + ' · 第' + lvl + '关',
          x: gx, z: gz, r: 3.4, data: { level: lvl, zone: z.id, glyph: z.glyph } });
      });
    })();

    /* ---------------- 第三关 · 祭坛 ----------------
       三层圆坛 + 一圈立石 + 青铜冂门。这里是第三关的入口，
       也是整张地图上唯一通向不隶属于"逛街"的地方 —— 进去就是 BOSS 战。
       祭坛刻意做成黑色石 + 青铜 + 火，与聚落的夯土茅草拉开气质。 */
    (function altar() {
      var ax = 34, az = -2;
      var base = terrainH(ax, az);
      [[7.6, 0.55], [6.1, 0.55], [4.7, 0.5]].forEach(function (t, k) {
        add(k === 1 ? 'stone' : 'stoneDk', new T.CylinderGeometry(t[0], t[0] + 0.55, t[1], 22),
          ax, base + 0.275 + k * 0.55, az);
      });
      /* 西侧的台阶：走势在哪边一眼能看懂 */
      for (var s2 = 0; s2 < 3; s2++) {
        add('stone', new T.BoxGeometry(2.4, 0.4, 1.0), ax - 6.4 + s2 * 0.9, base + 0.2 + s2 * 0.5, az);
      }
      /* 一圈立石（四块），每块正面一块实体甲骨字 —— 借 wg 的 chức năng */
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (q, k) {
        var px2 = ax + q[0] * 5.2, pz2 = az + q[1] * 5.2;
        var py2 = terrainH(px2, pz2);
        add('stoneDk', new T.BoxGeometry(1.1, 2.4, 0.8), px2, py2 + 1.2, pz2, 0, 0, 0);
        add('stone', new T.BoxGeometry(1.25, 0.26, 1.0), px2, py2 + 0.13, pz2, 0, 0, 0);
        if (GK) {
          var gm2 = GK.glyphMesh(['占', '祀', '祖', '龍'][k], 0.62,
            { color: 0x2a2118, emissive: 0xff9a4a, glow: 0.16 });
          if (gm2) {
            gm2.position.set(px2 + q[0] * 0.42, py2 + 1.35, pz2 + q[1] * 0.42);
            gm2.rotation.y = Math.atan2(-q[0], -q[1]) + Math.PI;
            gm2.castShadow = true;
            root.add(gm2);
          }
        }
        block(px2, pz2, 0.62, 0.62, 2.6);
      });
      /* 坛顶：青铜甗 + 火盆（视觉中心） */
      add('bronze', new T.CylinderGeometry(0.85, 0.62, 1.15, 18), ax, base + 2.15, az);
      add('bronze', new T.TorusGeometry(0.9, 0.09, 8, 20), ax, base + 2.72, az, Math.PI / 2, 0, 0);
      add('stoneDk', new T.CylinderGeometry(1.25, 1.4, 0.42, 16), ax, base + 3.05, az);
      fires.push({ x: ax, y: base + 3.35, z: az });
      /* 冂门（传递门）：两根铜柱 + 悬着的转盘 */
      var fz2 = az + 6.6, fy2 = terrainH(ax, fz2);
      [-1.5, 1.5].forEach(function (dx) {
        add('bronze', new T.CylinderGeometry(0.16, 0.20, 3.2, 10), ax + dx, fy2 + 1.6, fz2);
        add('stoneDk', new T.BoxGeometry(0.6, 0.3, 0.6), ax + dx, fy2 + 0.15, fz2);
      });
      add('bronze', new T.BoxGeometry(3.6, 0.26, 0.3), ax, fy2 + 3.3, fz2);
      var ringG = new T.TorusGeometry(0.85, 0.075, 8, 26);
      var ringM = new T.MeshStandardMaterial({ color: 0x86a06f, roughness: 0.35, metalness: 0.7,
        emissive: new T.Color(0xffb066), emissiveIntensity: 0.22 });
      var ring = new T.Mesh(ringG, ringM);
      ring.position.set(ax, fy2 + 1.95, fz2);
      ring.name = 'boss-portal-ring';
      root.add(ring);
      var disc = new T.Mesh(new T.CircleGeometry(0.8, 26),
        new T.MeshBasicMaterial({ color: 0xd9a45f, transparent: true, opacity: 0.24 }));
      disc.position.copy(ring.position);
      disc.name = 'boss-portal-disc';
      root.add(disc);
      block(ax, fz2, 2.0, 0.4, 0.0);
      spots.push({ id: 'portal-boss', kind: 'portal', name: '冂门 · 第三关',
        x: ax, z: fz2 + 1.6, r: 3.6, data: { level: 3 } });
      spots.push({ id: 'altar-mid', kind: 'altar', name: '祭坛 · 第三关',
        x: ax, z: az, r: 6.0, data: { level: 3 } });
    })();

    /* ---------------- 远山与洹水 ----------------
       地图原本只有一圈碗状隆起，中远景是空的 —— 看过去全是土色，
       没有"远、中、近"三层。这里补两样东西：
       远处一圈独立山头（有轮廓才有纵深），以及一条从泉眼流向畜圈水塘的溪流
       （一条起伏的水带立刻把地形走向交代清楚）。 */
    (function landscape() {
      var R = App.museumTex ? App.museumTex.rng(515) : Math.random;
      /* 远：26 座山头坐落在外圈上，高矮错落 */
      /* 每座山用"主峰 + 一个偏肩"两个锥叠出来：
         单个 6 棱锥的剪影是标准的"派对帽"，一眼看出是程序生成的。
         两锥一高一低的组合，轮廓才像山脊。全部用 stoneDk —— 雾会把它压淡，
         起点必须比雾色深，远处才有"深色剪影"而不是一团发白的三角。 */
      for (var i = 0; i < 26; i++) {
        var a = i / 26 * Math.PI * 2 + R() * 0.16;
        var rr = 63 + R() * 9;
        var hx2 = Math.cos(a) * rr, hz2 = Math.sin(a) * rr;
        var hh = 6 + R() * 12;
        var rad = 4.5 + R() * 6.5;
        var gy = terrainH(hx2, hz2);
        add('stoneDk', new T.ConeGeometry(rad, hh, 6, 1),
          hx2, gy + hh * 0.46, hz2, 0, a, 0, 1, 1, 0.9);
        add('stoneDk', new T.ConeGeometry(rad * 0.62, hh * 0.55, 5, 1),
          hx2 + Math.cos(a + 1.1) * rad * 0.72, gy + hh * 0.28,
          hz2 + Math.sin(a + 1.1) * rad * 0.72, 0, a * 1.7, 0, 1, 1, 0.9);
      }
      /* 近：沿河边散几块大石，破掉草地的一马平川 */
      for (var k = 0; k < 12; k++) {
        var ka = R() * 6.28, kr = 22 + R() * 26;
        var kx = Math.cos(ka) * kr, kz = Math.sin(ka) * kr;
        add('stone', new T.ConeGeometry(0.6 + R() * 1.1, 0.9 + R() * 1.2, 5, 1),
          kx, terrainH(kx, kz) + 0.35, kz, 0.16, R() * 6, 0.2, 1, 1, 0.85);
      }
      /* 洹水：一条贴地的水带。起自山川的泉眼，注入禽兽圈旁的水塘 */
      var pts = [];
      var path = [[33, -9], [31, -2], [29, 6], [26, 14], [23, 21], [21, 28], [21, 34]];
      for (var seg = 0; seg < path.length - 1; seg++) {
        for (var t = 0; t < 6; t++) {
          var tt = t / 6;
          pts.push({ x: path[seg][0] + (path[seg + 1][0] - path[seg][0]) * tt,
                     z: path[seg][1] + (path[seg + 1][1] - path[seg][1]) * tt });
        }
      }
      pts.push(path[path.length - 1]);
      add('water', ribbon(pts, 1.6, 0.20), 0, 0, 0);
      /* 河滩：水两侧一圈湿石，让水带不是"一条贴图贴在地上" */
      add('stoneDk', ribbon(pts, 2.5, 0.15), 0, 0, 0);
    })();

    /* ---------------- 出口：聚落城门 ----------------
       放在广场南侧。出城 = 回博物馆（世界 ↔ 展馆的连通口）。 */
    /* 城门离出生点必须留出相机的退身空间：出生点 z=13、相机最远退到 z≈26，
       原来城门就在 z=24，一拉远相机就穿到门洞外面（画面被门楣糊上半屏）。
       挪到 z=34，南边留出 20 米的空地。 */
    spots.push({ id: 'gate', kind: 'gate', name: '城门 · 回博物馆', x: 0, z: 44, r: 4.6, data: {} });
    (function gate() {
      /* 再往外挪到 z=44：
         出生台地在 z≈27、默认机位在它后方约 12 米，门楼原先正好卡在机位背后，
         一进游戏上半屏就是门楣底面（截图里那块巨大的草顶）。 */
      var z = 44, gy = terrainH(0, z);
      add('stoneDk', new T.BoxGeometry(11, 1.0, 4.2), 0, gy + 0.5, z);
      add('wood', new T.BoxGeometry(1.2, 6.0, 1.6), -3.6, gy + 3.0, z);
      add('wood', new T.BoxGeometry(1.2, 6.0, 1.6), 3.6, gy + 3.0, z);
      add('wood', new T.BoxGeometry(9.4, 0.8, 1.5), 0, gy + 6.2, z);
      roof('thatch', 0, gy + 6.4, z, 10.4, 4.6, 2.1);
      block(-3.6, z, 1.1, 1.1, 7.4);
      block(3.6, z, 1.1, 1.1, 7.4);
    })();

    /* ---------------- 火堆：广场四角 ----------------
       夜里的聚落要有可读的光源。四个火塘，也是"有人在住"的证据。 */
    [[-9, 9], [9, 9], [-9, -9], [9, -9]].forEach(function (p) {
      var gy = terrainH(p[0], p[1]);
      add('stoneDk', new T.CylinderGeometry(0.85, 0.95, 0.3, 12), p[0], gy + 0.15, p[1]);
      add('wood', new T.BoxGeometry(0.16, 0.7, 0.16), p[0], gy + 0.5, p[1], 0.4, p[0], 0.3);
      add('wood', new T.BoxGeometry(0.16, 0.7, 0.16), p[0], gy + 0.5, p[1], -0.35, 1.2, -0.4);
      fires.push({ x: p[0], y: gy + 0.75, z: p[1] });
      block(p[0], p[1], 1.0, 1.0, 0.8);
    });

    /* ---------------- 五区地貌差异 ----------------
       地皮贴图、地表散件、地标交给 world-zones.js（与"王邑该有什么"分开维护）。
       必须在合并成 mesh 之前调用：散件要并进同一批 buckets，
       否则五个区各撒几百个物件就成了几百个 draw call。 */
    if (App.worldZones && App.worldZones.decorate) {
      App.worldZones.decorate({ T: T, add: add, block: block, spots: spots,
        terrainH: terrainH, root: root, MAT: MAT, GK: GK, fires: fires });
    }

    /* ---------------- 落盘：一材质一 mesh ---------------- */
    Object.keys(buckets).forEach(function (k) {
      var geo = mergeGeos(buckets[k]);
      if (!geo) { return; }
      var mesh = new T.Mesh(geo, MAT[k] || MAT.stone);
      mesh.castShadow = k !== 'road' && k !== 'water';
      mesh.receiveShadow = true;
      mesh.name = 'settle-' + k;
      root.add(mesh);
    });

    return {
      root: root,
      colliders: colliders,
      spots: spots,
      zones: ZONES,
      fires: fires,
      glyphItems: glyphItems,
      gates: gates,
      charPlates: charPlates,
      terrainH: terrainH,
      materials: MAT,
      spawn: { x: 0, z: 24 }
    };
  }

  App.worldBuild = { build: build, terrainH: terrainH, COL: COL };
})(window.App);
