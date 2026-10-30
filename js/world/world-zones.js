/* ============================================================
   甲骨奇谭 · 3D 王邑：五区地貌差异（world-zones）
   ------------------------------------------------------------
   为什么单独一个文件：
     world-build.js 负责"王邑该有的东西"（宗庙、门阙、字区），
     这里只负责"每个区凭什么长得不一样"。两者改动的理由不同，
     混在一起会让 869 行的场景文件再涨一半。

   做法（三条，都不是加装饰）：
     1. 地皮：每区一块贴地的地貌面（草 / 砾石 / 夯土 / 干草 / 踩实的村落土），
        边缘用 alphaMap 渐隐，避免出现"一块圆饼盖在土上"的硬边。
        这一层解决"五个区同一种地面"的问题 —— 光靠换陈列物没用，
        人眼第一眼读的是脚下。
     2. 地标：每区一座有明确剪影的构筑（观星石阵 / 断崖 / 竹海 / 兽栏 / 井亭），
        让玩家在广场上就能指认"那边是天象台"。
     3. 地表散件：按区撒不同的东西（卵石、芦苇、落叶、陶片、禾束），
        贴地、有体积、会投影 —— 不是贴图。

   不引入新依赖；所有几何都交给 world-build 的 add() 按材质合并。
   ============================================================ */
(function (App) {
  'use strict';

  /* 五区的地貌定义。x/z 必须与 world-build 的 ZONES 一致。 */
  var ZONE = [
    { id: 'sky',   x: 0,   z: -44, r: 24,
      ground: 'rammed', tint: '#8e8574', mul: 0.82,
      props: ['steleRing', 'starFloor'] },
    { id: 'land',  x: 42,  z: -16, r: 23,
      ground: 'gravel', tint: '#7d766a', mul: 0.88,
      props: ['cliff', 'boulders', 'streamStones'] },
    { id: 'plant', x: -44, z: -6,  r: 24,
      ground: 'grass',  tint: '#4f6136', mul: 0.96,
      props: ['bamboo', 'fern', 'leafFall'] },
    { id: 'beast', x: 33,  z: 30,  r: 22,
      ground: 'dry',    tint: '#9a8351', mul: 0.80,
      props: ['reeds', 'bones', 'fence'] },
    { id: 'life',  x: -29, z: 34,  r: 23,
      ground: 'trodden', tint: '#8a6f4a', mul: 0.70,
      props: ['jars', 'well', 'dryingRack'] }
  ];

  function hash(s) {
    var n = s | 0;
    return function () { n = (n * 1103515245 + 12345) % 2147483648; return n / 2147483648; };
  }

  /* ---------------- 地貌贴图 ----------------
     全部程序化：512 无缝平铺，靠"底色 + 颗粒 + 少量结构线"三层。
     这几种地貌的差异要一眼分得开：草是短竖线，砾石是圆点，
     夯土是水平夯层，干草是稀疏散乱，村落土是被踩实的浅色斑。 */
  function groundTex(kind, T) {
    var S = 512;
    var cv = document.createElement('canvas');
    cv.width = cv.height = S;
    var c = cv.getContext('2d');
    var R = hash(kind.length * 977 + 13);

    if (kind === 'grass') {
      c.fillStyle = '#465a30'; c.fillRect(0, 0, S, S);
      for (var g = 0; g < 4200; g++) {
        var gx = R() * S, gy = R() * S, gh = 4 + R() * 12;
        c.strokeStyle = 'rgba(' + (70 + R() * 52 | 0) + ',' + (92 + R() * 54 | 0) + ',' +
          (42 + R() * 34 | 0) + ',' + (0.35 + R() * 0.45).toFixed(2) + ')';
        c.lineWidth = 1 + R() * 1.6;
        c.beginPath(); c.moveTo(gx, gy); c.lineTo(gx + (R() - 0.5) * 4, gy - gh); c.stroke();
      }
      for (var p = 0; p < 24; p++) {
        var px = R() * S, py = R() * S, pr = 24 + R() * 60;
        var rg = c.createRadialGradient(px, py, 2, px, py, pr);
        rg.addColorStop(0, R() > 0.5 ? 'rgba(74,92,48,.30)' : 'rgba(110,124,70,.24)');
        rg.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = rg; c.fillRect(px - pr, py - pr, pr * 2, pr * 2);
      }
    } else if (kind === 'gravel') {
      c.fillStyle = '#7a7468'; c.fillRect(0, 0, S, S);
      for (var i = 0; i < 2600; i++) {
        var x = R() * S, y = R() * S, r = 1.4 + R() * 5.2;
        var v = 0.55 + R() * 0.5;
        c.beginPath();
        c.ellipse(x, y, r, r * (0.6 + R() * 0.5), R() * 3, 0, 6.283);
        c.fillStyle = 'rgba(' + (110 * v + 40 | 0) + ',' + (106 * v + 38 | 0) + ',' +
          (98 * v + 34 | 0) + ',.55)';
        c.fill();
      }
      for (var s2 = 0; s2 < 900; s2++) {
        c.fillStyle = 'rgba(60,56,50,' + (0.1 + R() * 0.2).toFixed(2) + ')';
        c.fillRect(R() * S, R() * S, 1 + R() * 2, 1 + R() * 2);
      }
    } else if (kind === 'rammed') {
      /* 夯土：水平夯层 + 夯窝。商代台基就是这个质感，别做成"石板"。 */
      c.fillStyle = '#8a8172'; c.fillRect(0, 0, S, S);
      /* 夯层线画成"断续的短段"：原来是一条贯通全宽的折线，
         512 贴图重复 5 次后，每 0.7 米一道、笔直不断 —— 远看就是一地木地板。
         真实的夯层是被夯杵一下下砸出来的，线是断的、深浅不匀。 */
      for (var L = 0; L < 18; L++) {
        var yy0 = L * (S / 18) + (R() - 0.5) * 8;
        for (var seg2 = 0; seg2 < 5; seg2++) {
          var sx0 = R() * S, slen = 26 + R() * 78;
          c.strokeStyle = 'rgba(78,71,60,' + (0.10 + R() * 0.13).toFixed(2) + ')';
          c.lineWidth = 1.2 + R() * 1.8;
          c.beginPath();
          c.moveTo(sx0, yy0 + (R() - 0.5) * 3);
          c.lineTo(sx0 + slen, yy0 + (R() - 0.5) * 5);
          c.stroke();
        }
        var yy = yy0;
        /* 夯窝 */
        for (var k = 0; k < 16; k++) {
          var hx = R() * S, hr = 3 + R() * 5;
          c.beginPath();
          c.ellipse(hx, yy + (S / 28), hr, hr * 0.7, 0, 0, 6.283);
          c.strokeStyle = 'rgba(96,88,74,.30)'; c.lineWidth = 1.2; c.stroke();
        }
      }
      for (var c2 = 0; c2 < 1800; c2++) {
        c.fillStyle = 'rgba(160,150,132,' + (0.05 + R() * 0.12).toFixed(2) + ')';
        c.fillRect(R() * S, R() * S, 1 + R() * 3, 1 + R() * 2);
      }
    } else if (kind === 'dry') {
      c.fillStyle = '#9a8351'; c.fillRect(0, 0, S, S);
      for (var d = 0; d < 2400; d++) {
        var dx = R() * S, dy = R() * S;
        c.strokeStyle = 'rgba(' + (150 + R() * 60 | 0) + ',' + (130 + R() * 50 | 0) + ',' +
          (72 + R() * 40 | 0) + ',' + (0.3 + R() * 0.4).toFixed(2) + ')';
        c.lineWidth = 1 + R();
        c.beginPath(); c.moveTo(dx, dy);
        c.lineTo(dx + (R() - 0.5) * 7, dy - 3 - R() * 9); c.stroke();
      }
      for (var b = 0; b < 20; b++) {
        var bx = R() * S, by = R() * S, br = 26 + R() * 54;
        var bg = c.createRadialGradient(bx, by, 2, bx, by, br);
        bg.addColorStop(0, R() > 0.5 ? 'rgba(124,104,60,.22)' : 'rgba(178,160,112,.20)');
        bg.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = bg; c.fillRect(bx - br, by - br, br * 2, br * 2);
      }
    } else {
      /* trodden：踩实的村土，浅、干、有碎陶 */
      c.fillStyle = '#8f7449'; c.fillRect(0, 0, S, S);
      for (var t = 0; t < 26; t++) {
        var tx = R() * S, ty = R() * S, tr = 30 + R() * 70;
        var tg = c.createRadialGradient(tx, ty, 3, tx, ty, tr);
        tg.addColorStop(0, R() > 0.5 ? 'rgba(168,146,104,.35)' : 'rgba(110,90,60,.30)');
        tg.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = tg; c.fillRect(tx - tr, ty - tr, tr * 2, tr * 2);
      }
      for (var q = 0; q < 1400; q++) {
        c.fillStyle = 'rgba(190,172,132,' + (0.08 + R() * 0.16).toFixed(2) + ')';
        c.fillRect(R() * S, R() * S, 1 + R() * 2.5, 1 + R() * 2);
      }
      /* 碎陶片：三角小片，别太多 */
      for (var sh = 0; sh < 34; sh++) {
        var sx = R() * S, sy = R() * S, sr = 3 + R() * 7;
        c.beginPath();
        c.moveTo(sx, sy);
        c.lineTo(sx + sr, sy + (R() - 0.5) * sr);
        c.lineTo(sx + sr * 0.4, sy + sr);
        c.closePath();
        c.fillStyle = 'rgba(198,178,138,.55)';
        c.fill();
      }
    }
    var tx2 = new T.CanvasTexture(cv);
    if (T.SRGBColorSpace) { tx2.colorSpace = T.SRGBColorSpace; }
    tx2.wrapS = tx2.wrapT = T.RepeatWrapping;
    /* 圆盘的 UV 是 0~1 铺满整块（直径约 48 米）。不设 repeat 的话，
       一张 512 的贴图被拉到 48 米宽 —— 一个像素 9 厘米，
       近处草皮就变成一片横向拖影。重复 5 次，密度才和地形土层贴图（14 次/150 米）一致。 */
    tx2.repeat.set(5, 5);
    tx2.anisotropy = 4;
    return tx2;
  }

  /* 边缘渐隐（alphaMap 只读绿通道） */
  function edgeFade(T) {
    var S = 256;
    var cv = document.createElement('canvas');
    cv.width = cv.height = S;
    var c = cv.getContext('2d');
    var g = c.createRadialGradient(S / 2, S / 2, S * 0.10, S / 2, S / 2, S * 0.50);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.62, '#e8e8e8');
    g.addColorStop(1, '#000000');
    c.fillStyle = g; c.fillRect(0, 0, S, S);
    return new T.CanvasTexture(cv);
  }

  /* 地形网格：PlaneGeometry(150,150,108,108) —— 1.389 米的格子。
     贴地皮必须按"渲染出来的那块三角面"取高，而不是按 terrainH 真值：
     真值在格子中间可以比三角面低 5~10 cm，地皮就会被地形顶穿出破洞
     （实测：草木区的草皮上有一片片土色破洞，就是这么来的）。 */
  var GRID = 150 / 108;
  function cellTop(terrainH, x, z) {
    var i = Math.floor((x + 75) / GRID), j = Math.floor((z + 75) / GRID);
    var x0 = -75 + i * GRID, z0 = -75 + j * GRID;
    var x1 = x0 + GRID, z1 = z0 + GRID;
    return Math.max(terrainH(x0, z0), terrainH(x1, z0), terrainH(x0, z1), terrainH(x1, z1));
  }

  /* 贴地圆盘：每个顶点取所在格子的最高角点，保证永远在渲染面之上 */
  function disc(T, terrainH, cx, cz, R0, segs, rings, lift, seed) {
    var pos = [], uv = [], idx = [];
    pos.push(cx, cellTop(terrainH, cx, cz) + lift, cz);
    uv.push(0.5, 0.5);
    for (var ri = 1; ri <= rings; ri++) {
      var rr = R0 * (ri / rings);
      for (var si = 0; si < segs; si++) {
        var a = si / segs * Math.PI * 2;
        var x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
        pos.push(x, cellTop(terrainH, x, z) + lift, z);
        uv.push(0.5 + Math.cos(a) * 0.5 * (ri / rings), 0.5 + Math.sin(a) * 0.5 * (ri / rings));
      }
    }
    /* ★ 绕序必须让法线朝上：(中心, s+1, s) 这个顺序的叉积才是 +y。
       反过来写，整块地皮是背面 —— 从上往下一片都看不到，
       而射线拾取（FrontSide）也打不中，症状是"地皮明明在场景里，就是没出现"。 */
    for (var s0 = 0; s0 < segs; s0++) {
      idx.push(0, 1 + (s0 + 1) % segs, 1 + s0);
    }
    for (var r0 = 1; r0 < rings; r0++) {
      var base = 1 + (r0 - 1) * segs, next = 1 + r0 * segs;
      for (var s1 = 0; s1 < segs; s1++) {
        var s2 = (s1 + 1) % segs;
        idx.push(base + s1, base + s2, next + s1);
        idx.push(base + s2, next + s2, next + s1);
      }
    }
    var g2 = new T.BufferGeometry();
    g2.setAttribute('position', new T.BufferAttribute(new Float32Array(pos), 3));
    g2.setAttribute('uv', new T.BufferAttribute(new Float32Array(uv), 2));
    g2.setIndex(idx);
    g2.computeVertexNormals();
    return g2;
  }

  /* ================= 主入口 ================= */
  function decorate(ctx) {
    var T = ctx.T, add = ctx.add, block = ctx.block, terrainH = ctx.terrainH, root = ctx.root;
    var fires = ctx.fires || null;   /* 火塘列表：world3d 会为每一项挂一盏点光 + 火苗 */
    var R = hash(20261029);

    /* ---------- 1. 每区一块地貌地皮 ---------- */
    var fade = edgeFade(T);
    ZONE.forEach(function (z) {
      var mat = new T.MeshStandardMaterial({
        map: groundTex(z.ground, T),
        /* 地形本体带 vertexColors（0.72~1.02 的明暗），地皮没有 ——
           不压一下，地皮会比周围亮一档，像贴了张白纸。 */
        color: new T.Color().setScalar(z.mul || 0.9),
        roughness: z.ground === 'gravel' ? 0.92 : 1.0,
        metalness: 0.0,
        depthWrite: true,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2
      });
      mat.map.repeat.set(z.r / 8, z.r / 8);
      /* 抬升 0.05 而不是 0.12：地皮压住路面时，路面会被切成碎片（截图里那块浅色楔形）。
         0.05 只保证不被地形三角面顶穿，把压住路面的余量让给路面自己。 */
      var m = new T.Mesh(disc(T, terrainH, z.x, z.z, z.r, 56, 22, 0.05, z.x * 0.07 + z.z * 0.11), mat);
      m.receiveShadow = true;
      m.name = 'zone-ground-' + z.id;
      m.renderOrder = 2;
      root.add(m);
    });

    /* ---------- 2. 散件：按 zone 撒 ---------- */
    function scatter(z, n, fn) {
      for (var i = 0; i < n; i++) {
        var a = R() * Math.PI * 2, rr = Math.sqrt(R()) * z.r * 0.88;
        var x = z.x + Math.cos(a) * rr, zz = z.z + Math.sin(a) * rr;
        /* 别长在字区正中间：字要能被看见 */
        if (Math.hypot(x - z.x, zz - z.z) < 3.2) { continue; }
        fn(x, zz, terrainH(x, zz));
      }
    }

    var pebble = new T.SphereGeometry(0.20, 6, 5);
    var rock = new T.ConeGeometry(0.42, 0.55, 5, 1);
    var tuft = new T.ConeGeometry(0.10, 0.46, 4, 1);
    /* 一片草叶：极扁的四棱柱（0.055 × 0.44 × 0.012），近景看是一条细叶，
       远景合并后是一片绒。比"锥体草丛"省面数，也不会读成迷你冷杉。 */
    var blade = new T.BoxGeometry(0.055, 0.44, 0.012);

    ZONE.forEach(function (z) {
      if (z.props.indexOf('boulders') >= 0) {
        scatter(z, 26, function (x, zz, gy) {
          var s = 0.7 + R() * 1.9;
          add('stone', rock, x, gy + 0.24 * s, zz, 0.2 + R() * 0.4, R() * 6, 0.2, s, s * 0.8, s);
        });
        scatter(z, 40, function (x, zz, gy) {
          var s = 0.5 + R() * 1.0;
          add(R() > 0.5 ? 'stone' : 'stoneDk', pebble, x, gy + 0.08 * s, zz,
            0, R() * 6, 0, s, s * 0.5, s);
        });
      }
      if (z.props.indexOf('fern') >= 0 || z.props.indexOf('leafFall') >= 0) {
        scatter(z, 120, function (x, zz, gy) {
          var s = 0.5 + R() * 1.1;
          add(R() > 0.4 ? 'leaf' : 'leafDk', tuft, x, gy + 0.20 * s, zz,
            (R() - 0.5) * 0.3, R() * 6, (R() - 0.5) * 0.3, s, s, s);
        });
        /* 落叶：薄片，贴地 */
        scatter(z, 60, function (x, zz, gy) {
          add('leafDk', pebble, x, gy + 0.02, zz, 0, R() * 6, 0, 0.9 + R(), 0.10, 0.7 + R() * 0.6);
        });
      }
      if (z.props.indexOf('reeds') >= 0) {
        scatter(z, 70, function (x, zz, gy) {
          var s = 0.8 + R() * 0.9;
          add('leaf', new T.CylinderGeometry(0.018, 0.030, 1.1, 4), x, gy + 0.55 * s, zz,
            (R() - 0.5) * 0.22, 0, (R() - 0.5) * 0.22, s, s, s);
          add('leafDk', tuft, x, gy + 1.08 * s, zz, 0, 0, 0, 0.9 * s, 0.8 * s, 0.9 * s);
        });
        scatter(z, 30, function (x, zz, gy) {
          add('stoneDk', pebble, x, gy + 0.06, zz, 0, R() * 6, 0, 1.2, 0.4, 1.0);
        });
      }
      if (z.props.indexOf('jars') >= 0) {
        scatter(z, 14, function (x, zz, gy) {
          var s = 0.6 + R() * 0.6;
          add('plaster', new T.CylinderGeometry(0.16, 0.10, 0.34, 12), x, gy + 0.17 * s, zz,
            0, R() * 6, 0, s, s, s);
          add('plaster', new T.SphereGeometry(0.16, 12, 8), x, gy + 0.36 * s, zz,
            0, 0, 0, s, 0.55 * s, s);
        });
      }
      if (z.props.indexOf('starFloor') >= 0) {
        /* 观星台脚下的放射刻线：不是贴图，是压在地里的细石条 */
        for (var k = 0; k < 12; k++) {
          var a2 = k / 12 * Math.PI * 2;
          var len = 7.4;
          add('stone', new T.BoxGeometry(0.16, 0.05, len),
            z.x + Math.sin(a2) * len / 2, terrainH(z.x, z.z) + 0.07,
            z.z + Math.cos(a2) * len / 2, 0, a2, 0);
        }
      }
    });

    /* ---------- 3. 五区地标（有剪影，远看能认方向） ---------- */
    /* 天象：一圈立石 + 中央石阵（比观星台更靠外，形成"外环"） */
    (function skyRing() {
      var z = ZONE[0];
      /* 半径 12.5 时，这一圈立石正好和"字碑台地"（距区心 7~11 米）撞在一起：
         一块 2.2 米高的石头就杵在「日」前面 1.4 米，站到字碑跟前只看得见石头。
         拉到 17 米 —— 立石变成外围的仪式感边界，字碑圈在里面自成一组。 */
      for (var i = 0; i < 8; i++) {
        var a = i / 8 * Math.PI * 2 + 0.2;
        /* 别让立石站在来路上：i=2 那块正好落在 x≈0 的路中间，
           从广场走上去整条视线都被一块 2 米高的石头钉住。 */
        if (Math.abs(Math.cos(a) * 17.0) < 3.6) { a += 0.34; }
        var x = z.x + Math.cos(a) * 17.0, zz = z.z + Math.sin(a) * 17.0;
        var gy = terrainH(x, zz);
        var h = 2.2 + (i % 3) * 0.55;
        add('stoneDk', new T.BoxGeometry(0.62, h, 0.42), x, gy + h / 2, zz, 0, -a, 0);
        add('stone', new T.BoxGeometry(0.78, 0.18, 0.56), x, gy + 0.09, zz, 0, -a, 0);
        block(x, zz, 0.5, 0.5, h);
      }
    })();

    /* 山川：一道断崖，把"山"这件事从广场视线里立起来 */
    (function cliff() {
      var z = ZONE[1];
      for (var i = 0; i < 5; i++) {
        var x = z.x + 6.5 + (i % 2) * 1.2, zz = z.z - 8 + i * 4.6;
        var gy = terrainH(x, zz);
        var h = 5.4 + (i % 3) * 2.2;
        add('stoneDk', new T.ConeGeometry(2.6 - i * 0.18, h, 5, 1), x, gy + h * 0.44, zz,
          0, i * 0.7, 0, 1, 1, 0.8);
      }
      block(z.x + 8.0, z.z, 2.6, 11, 7.0);
    })();

    /* 草木：竹海（细高杆，成丛，才像"林"不像"几根棍"） */
    (function bamboo() {
      var z = ZONE[2];
      var stalk = new T.CylinderGeometry(0.055, 0.075, 3.2, 5);
      for (var g = 0; g < 12; g++) {
        var a = R() * Math.PI * 2, rr = 5 + R() * 14;
        var bx = z.x + Math.cos(a) * rr, bz = z.z + Math.sin(a) * rr;
        var gy = terrainH(bx, bz);
        var n = 6 + (R() * 5 | 0);
        for (var k = 0; k < n; k++) {
          var ox = (R() - 0.5) * 1.5, oz = (R() - 0.5) * 1.5;
          var s = 0.8 + R() * 0.5;
          add('leafDk', stalk, bx + ox, gy + 1.6 * s, bz + oz,
            (R() - 0.5) * 0.10, 0, (R() - 0.5) * 0.10, s, s, s);
        }
        block(bx, bz, 0.9, 0.9, 3.4);
      }
    })();

    /* 禽兽：兽栏的入口（两根粗木 + 横梁 + 骨挂） */
    (function foldGate() {
      var z = ZONE[3];
      var gy = terrainH(z.x, z.z + 9.5);
      [-1.6, 1.6].forEach(function (dx) {
        add('wood', new T.CylinderGeometry(0.16, 0.20, 3.0, 8), z.x + dx, gy + 1.5, z.z + 9.5);
      });
      add('wood', new T.BoxGeometry(3.9, 0.26, 0.30), z.x, gy + 3.05, z.z + 9.5);
      add('boneFace', new T.BoxGeometry(0.42, 0.60, 0.09), z.x, gy + 2.45, z.z + 9.5, 0, 0, 0.10);
      block(z.x - 1.6, z.z + 9.5, 0.3, 0.3, 3.1);
      block(z.x + 1.6, z.z + 9.5, 0.3, 0.3, 3.1);
    })();

    /* 人居：井亭（四柱 + 顶），村子的第二个地标 */
    (function well() {
      var z = ZONE[4];
      var wx = z.x + 7.5, wz = z.z + 5.0;
      var gy = terrainH(wx, wz);
      add('stoneDk', new T.CylinderGeometry(1.05, 1.10, 0.55, 16), wx, gy + 0.27, wz);
      add('stone', new T.CylinderGeometry(0.86, 0.86, 0.10, 16), wx, gy + 0.56, wz);
      add('water', new T.CircleGeometry(0.78, 20), wx, gy + 0.60, wz, -Math.PI / 2, 0, 0);
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (q) {
        add('wood', new T.CylinderGeometry(0.10, 0.12, 2.4, 7),
          wx + q[0] * 1.0, gy + 1.2, wz + q[1] * 1.0);
      });
      add('thatch', new T.BoxGeometry(2.6, 0.16, 2.6), wx, gy + 2.42, wz);
      add('thatch', new T.ConeGeometry(1.9, 0.85, 4, 1), wx, gy + 2.92, wz, 0, Math.PI / 4, 0);
      block(wx, wz, 1.2, 1.2, 3.2);
    })();

    /* ---------- 3.5 地皮边缘的收口 ----------
       地皮是"贴在土上的一块"，硬边一定看得见。沿边界撒一圈矮灌木和碎石，
       让视线在边界处被植物接住 —— 比调 alpha 更可靠。 */
    ZONE.forEach(function (z) {
      for (var i = 0; i < 46; i++) {
        var a = i / 46 * Math.PI * 2 + (z.x + z.z) * 0.01;
        var wob = 1 + 0.10 * Math.sin(a * 3 + z.x * 0.07 + z.z * 0.11)
                    + 0.06 * Math.sin(a * 5 - (z.x * 0.07 + z.z * 0.11) * 1.7)
                    + 0.04 * Math.sin(a * 9 + (z.x * 0.07 + z.z * 0.11) * 0.6);
        var rr2 = z.r * wob * (0.94 + R() * 0.12);
        var x = z.x + Math.cos(a) * rr2, zz = z.z + Math.sin(a) * rr2;
        var gy = terrainH(x, zz);
        if (R() > 0.42) {
          var s2 = 0.5 + R() * 0.7;
          add(R() > 0.5 ? 'leafDk' : 'leaf', new T.SphereGeometry(0.40, 8, 6),
            x, gy + 0.24 * s2, zz, 0, R() * 6, 0, s2, s2 * 0.72, s2);
        } else {
          add('stoneDk', pebble, x, gy + 0.05, zz, 0, R() * 6, 0, 0.7 + R() * 0.9, 0.35, 0.7 + R() * 0.8);
        }
      }
    });

    /* ---------- 3.6 广场：别让中央只剩一圈空土 ----------
       原本广场 30 米见方，中间只有宗庙和四个火塘，航拍像一块空地。
       补三样有生活痕迹的东西：铺石、旗杆、市集摊 —— 都贴地、有影子。 */
    (function plaza() {
      /* 铺石：沿广场外环铺一圈"踏步石"。
         第一版是 2.0×1.5 的大板、离地 0.16 米，斜看像一圈扔在地上的白卡片 ——
         尺寸砍到 1.15×0.85、只露 0.05 米，视线才会把它读成"被踩实的铺地"。 */
      for (var i = 0; i < 26; i++) {
        var a = i / 26 * Math.PI * 2;
        var rr = 16.5 + (i % 2) * 0.45;
        var x = Math.cos(a) * rr, z = Math.sin(a) * rr;
        add('stone', new T.BoxGeometry(1.15, 0.16, 0.85), x, terrainH(x, z) + 0.06, z,
          0, -a + (i % 3) * 0.06, 0, 1, 1, 0.94 + (i % 4) * 0.03);
      }
      /* 旗杆：四根，顶端挂布。风吹不动（静态），但剪影把"高度"立起来了 */
      [[-13, 13], [13, 13], [-13, -13], [13, -13]].forEach(function (q, k) {
        var x = q[0], z = q[1], gy = terrainH(x, z);
        add('wood', new T.CylinderGeometry(0.09, 0.13, 5.2, 8), x, gy + 2.6, z);
        add('bronze', new T.SphereGeometry(0.12, 10, 8), x, gy + 5.25, z);
        /* 布：一块双面薄板，斜挂在杆上 */
        add('thatch', new T.BoxGeometry(0.06, 1.5, 0.9), x + 0.32, gy + 4.2, z, 0, 0.4 + k * 0.2, 0.06);
        block(x, z, 0.22, 0.22, 5.2);
      });
      /* 市集摊：两根柱 + 草棚 + 三个陶罐 */
      [[-15, 6], [15, -6]].forEach(function (q) {
        var x = q[0], z = q[1], gy = terrainH(x, z);
        add('wood', new T.CylinderGeometry(0.08, 0.10, 2.1, 7), x - 1.1, gy + 1.05, z);
        add('wood', new T.CylinderGeometry(0.08, 0.10, 2.1, 7), x + 1.1, gy + 1.05, z);
        add('thatch', new T.BoxGeometry(2.9, 0.12, 2.0), x, gy + 2.16, z, 0, 0.12, 0);
        add('plaster', new T.BoxGeometry(2.4, 0.10, 1.5), x, gy + 0.62, z, 0, 0.12, 0);
        for (var j = 0; j < 3; j++) {
          var jx = x - 0.7 + j * 0.7;
          add('plaster', new T.CylinderGeometry(0.15, 0.10, 0.30, 10), jx, gy + 0.80, z + 0.1);
        }
        block(x, z, 1.6, 1.2, 2.3);
      });
    })();

    /* ---------- 3.5 出生台地：把"近景"填起来 ----------
       默认机位在台地上俯看广场，画面前 40% 是这块坡面。
       它原来是光秃秃一片土，整个开场就读作"一块空沙地"。
       这里补三样：一条下坡的石阶路（给"往哪走"）、草簇与小石（给尺度）、
       两根门柱（给"入口"的框景）。 */
    (function approach() {
      var sxp = 0, szp = 24;                    /* 与 world.spawn 一致 */
      var gy0 = terrainH(sxp, szp);
      /* 1) 石阶：从台地顶走到广场边缘，逐级贴地。
         上一版是 0.14 米厚的薄板平铺在坡上 —— 斜坡一露边，立刻是一叠"白卡片"。
         改成 0.38 米厚、下沉 0.16 米，只露一层台阶面，缝隙才不会被看穿。 */
      for (var i = 0; i < 14; i++) {
        var t = i / 13;
        var zz = szp - 1.0 - t * 8.2;
        var xx = Math.sin(t * 2.4) * 0.55;
        var gy = terrainH(xx, zz);
        add('stoneDk', new T.BoxGeometry(2.05 + (i % 2) * 0.14, 0.38, 0.66),
          xx, gy + 0.03, zz, 0, (i % 3 - 1) * 0.04, 0);
      }
      /* 2) 草簇：台地坡面上撒，避开石阶走廊（|x|<1.3 且 15.5<z<24） */
      for (var k = 0; k < 190; k++) {
        var a = R() * Math.PI * 2;
        var rr = 15.2 + Math.pow(R(), 0.6) * 9.5;
        var x = Math.cos(a) * rr, z = Math.sin(a) * rr;
        if (z < 15.5) { continue; }
        if (Math.abs(x) < 1.5 && z > 15.0 && z < 24.6) { continue; }
        var gy2 = terrainH(x, z);
        var s = 0.55 + R() * 0.95;
        /* 草簇：三支细叶交错。原来的四棱锥近看就是一棵"小圣诞树"，
           换成叶片之后才读作草；三支一起撒，剪影才有疏密。 */
        var key2 = R() > 0.45 ? 'leaf' : 'leafDk';
        for (var b2 = 0; b2 < 3; b2++) {
          var bx2 = x + (R() - 0.5) * 0.26, bz2 = z + (R() - 0.5) * 0.26;
          add(key2, blade, bx2, gy2 + 0.22 * s, bz2,
            (R() - 0.5) * 0.34, R() * 6, (R() - 0.5) * 0.34,
            0.7 + R() * 0.5, s * (0.7 + R() * 0.7), 0.7 + R() * 0.5);
        }
      }
      /* 3) 小石：沿坡散落，压住"平面"的观感 */
      for (var m = 0; m < 34; m++) {
        var a2 = R() * Math.PI * 2, r2 = 15.0 + R() * 10.0;
        var x2 = Math.cos(a2) * r2, z2 = Math.sin(a2) * r2;
        if (z2 < 15) { continue; }
        var gy3 = terrainH(x2, z2);
        var s2 = 0.4 + R() * 0.9;
        add(R() > 0.5 ? 'stone' : 'stoneDk', pebble, x2, gy3 + 0.07 * s2, z2,
          0, R() * 6, 0, s2, s2 * 0.45, s2 * 0.85);
      }
      /* 4) 一对火盆：立在石阶两侧。
         上一版这里是两根 1.9 米高的石柱，正对镜头把宗庙挡掉一半，还像两根水泥墩。
         换成火盆：不挡视线、给暖光、给方向（"路从这里下去"），
         也是夜里第一眼能看见的东西。 */
      /* 盆体用 Lathe 旋一个"敞口盆"：CylinderGeometry 一定带顶盖，
         叠上去就是个扣了盖子的坛子（截图里正是这样）。 */
      var bowlPts = [
        new T.Vector2(0.03, 0.00), new T.Vector2(0.20, 0.02), new T.Vector2(0.24, 0.34),
        new T.Vector2(0.34, 0.52), new T.Vector2(0.44, 0.62), new T.Vector2(0.46, 0.70),
        new T.Vector2(0.40, 0.70), new T.Vector2(0.38, 0.62), new T.Vector2(0.28, 0.48)
      ];
      var bowlGeo = new T.LatheGeometry(bowlPts, 16);
      [-2.7, 2.7].forEach(function (dx) {
        var gz = szp - 2.2, gy4 = terrainH(dx, gz);
        add('stoneDk', bowlGeo, dx, gy4, gz);
        /* 盆沿三只小耳，让它像"商代铜炉"而不是石臼 */
        for (var e = 0; e < 3; e++) {
          var ea = e / 3 * Math.PI * 2 + 0.5;
          add('stone', new T.BoxGeometry(0.10, 0.16, 0.10),
            dx + Math.cos(ea) * 0.44, gy4 + 0.72, gz + Math.sin(ea) * 0.44, 0, -ea, 0);
        }
        block(dx, gz, 0.48, 0.48, 1.0);
        if (fires) { fires.push({ x: dx, y: gy4 + 0.86, z: gz }); }
      });
      void gy0;
    })();

    /* ---------- 4. 五区之间的"过渡带"：矮灌木 + 落石，避免两区硬拼 ---------- */
    for (var i = 0; i < 60; i++) {
      var a = R() * Math.PI * 2;
      var rr = 24 + R() * 14;
      var x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      var gy = terrainH(x, z);
      if (R() > 0.45) {
        var s = 0.5 + R() * 0.7;
        /* 灌木：一主一辅两瓣，压扁。单个球在近景里就是一个"绿藻球"。 */
        add('leafDk', new T.SphereGeometry(0.34, 8, 6), x, gy + 0.22 * s, z,
          0, R() * 6, 0, s, s * 0.62, s);
        add('leaf', new T.SphereGeometry(0.22, 7, 5),
          x + 0.26 * s, gy + 0.15 * s, z + 0.18 * s, 0, R() * 6, 0, s, s * 0.55, s);
      } else {
        add('stone', pebble, x, gy + 0.06, z, 0, R() * 6, 0, 0.8 + R(), 0.4, 0.8 + R());
      }
    }
  }

  App.worldZones = { decorate: decorate, ZONE: ZONE };
})(window.App);
