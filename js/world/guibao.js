/* ============================================================
   甲骨奇谭 · 龟宝（3D 角色）
   ------------------------------------------------------------
   依据《中原使者——龟宝》正面 / 侧面 / 背面三视图重建。

   ★ 坐标约定（改比例前先读这一条）
     root 原点 = 脚底，y=0 就是地面，面朝 +z。
     hips 只承担"整体沉浮/摇摆"，**静止时 hips.position.y = 0**，
     所以下面所有 y 都是**世界高度**，不是相对髋部的偏移。
     —— 第一版把 hips 定在 0.245 又按绝对高度写子件，
        结果脚底停在 0.29 米，整个人是飘着的。这个坑记在这。

   造型基准：
     总高      0.98（头顶）        头径 0.45（宽 0.477）
     头心      y = 0.755           壳宽 0.54（比腹甲宽，正面两侧露出）
     壳心      y = 0.44            腹甲 宽 0.38 高 0.40
     肩        y = 0.505           髋 y = 0.255，脚掌底 y ≈ 0

   结构规则：
     1. 头必须比身体大 —— 三视图里头宽≈壳宽，这是辨识度所在。
     2. 眼球中心压在头面以内 0.03、半径 0.070，只露 0.04：
        鼓出来才是眼，埋进去只剩一片绿。
     3. 壳是背上的穹顶（Lathe），缘口外翻；缘盾只排上半圈 + 两侧，
        不绕到腹甲前面 —— 否则正面看是一条金珠腰带。
     4. 四肢挂在肩/髋 pivot 上，摆动从关节转，脚才会离地。
   ============================================================ */
(function (App) {
  'use strict';

  function build(T, opt) {
    var root = new T.Group();
    root.name = 'guibao';

    function cv2(w, h) {
      var c = document.createElement('canvas');
      c.width = w; c.height = h;
      return c;
    }
    function tex(cv, rep) {
      var t = new T.CanvasTexture(cv);
      if (T.SRGBColorSpace) { t.colorSpace = T.SRGBColorSpace; }
      t.wrapS = t.wrapT = T.RepeatWrapping;
      if (rep) { t.repeat.set(rep, rep); }
      t.anisotropy = 4;
      return t;
    }
    function rand(seed) {
      var s = seed || 7;
      return function () { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
    }

    /* ---------------- 贴图 ---------------- */
    /* 皮肤：浅黄绿。饱和度要比"好看的米色"高一档 ——
       场景是黄昏暖光 + ACES 压暗，原色会被洗成奶油白。 */
    var skinTex = (function () {
      var S = 256, cv = cv2(S, S), c = cv.getContext('2d'), R = rand(31);
      var g = c.createLinearGradient(0, 0, 0, S);
      g.addColorStop(0, '#d3e57f');
      g.addColorStop(0.55, '#c4da72');
      g.addColorStop(1, '#adc964');
      c.fillStyle = g; c.fillRect(0, 0, S, S);
      for (var i = 0; i < 110; i++) {
        var x = R() * S, y = R() * S, r = 2 + R() * 6;
        c.beginPath(); c.arc(x, y, r, 0, 6.283);
        c.fillStyle = R() > 0.45
          ? 'rgba(140,172,80,' + (0.05 + R() * 0.07).toFixed(3) + ')'
          : 'rgba(214,232,158,' + (0.05 + R() * 0.07).toFixed(3) + ')';
        c.fill();
      }
      return tex(cv);
    })();

    /* 龟壳：Lathe 的 UV 是「u=绕一圈 / v=沿剖面」，
       同心甲缝 → 横线，放射肋 → 竖线，正好是甲片排布。 */
    var shellTex = (function () {
      var W = 512, H = 512, cv = cv2(W, H), c = cv.getContext('2d'), R = rand(77);
      c.fillStyle = '#37543a'; c.fillRect(0, 0, W, H);
      for (var b = 0; b < 70; b++) {
        var bx = R() * W, by = R() * H, br = 18 + R() * 62;
        var rg = c.createRadialGradient(bx, by, 2, bx, by, br);
        rg.addColorStop(0, R() > 0.5 ? 'rgba(74,108,70,.34)' : 'rgba(30,50,34,.40)');
        rg.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = rg; c.fillRect(bx - br, by - br, br * 2, br * 2);
      }
      /* 甲片：3 圈 × 10 格的"盾片"，相邻圈错开半格。
         之前是"2 圈甲缝 + 8 条放射肋"，从背面看就是一张蜘蛛网 / 切开的橙子。
         真实龟甲是十几片**大块多边形盾片**拼起来的：所以这里不是画线，
         而是把每一格填成一块内缩的圆角片，缝隙自然成为甲缝。
         Lathe 的 UV：u 绕一圈、v 沿剖面 —— 在 u-v 里画格子，
         到壳上正好是"一圈圈甲片"。 */
      var RINGS = [0.08, 0.32, 0.56, 0.80, 0.99];
      var SEG = 10;
      c.lineJoin = 'round';
      for (var r = 0; r < RINGS.length - 1; r++) {
        var v0 = RINGS[r], v1 = RINGS[r + 1];
        var off = (r % 2) * 0.5;
        for (var s2 = 0; s2 < SEG; s2++) {
          var u0 = (s2 + off) / SEG, u1 = (s2 + 1 + off) / SEG;
          var px0 = W * u0, px1 = W * u1;
          var py0 = H * (1 - v1), py1 = H * (1 - v0);
          var cw = px1 - px0, chh = py1 - py0;
          if (cw < 6 || chh < 6) { continue; }
          var sh = 0.84 + R() * 0.34;
          c.fillStyle = 'rgba(' + Math.round(62 * sh) + ',' +
                        Math.round(94 * sh) + ',' + Math.round(64 * sh) + ',.62)';
          c.beginPath();
          var rad = Math.min(cw, chh) * 0.26;
          if (c.roundRect) {
            c.roundRect(px0 + cw * 0.06, py0 + chh * 0.10, cw * 0.88, chh * 0.80, rad);
          } else {
            c.rect(px0 + cw * 0.06, py0 + chh * 0.10, cw * 0.88, chh * 0.80);
          }
          c.fill();
          c.strokeStyle = 'rgba(202,166,92,.44)';
          c.lineWidth = 3;
          c.stroke();
        }
      }
      return tex(cv);
    })();

    /* 腹甲：米白 + 甲缝（三横一竖） */
    var bellyTex = (function () {
      var W = 512, H = 256, cv = cv2(W, H), c = cv.getContext('2d');
      var g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#fbf3d4');
      g.addColorStop(0.6, '#f4e9c2');
      g.addColorStop(1, '#e7d8a6');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      c.strokeStyle = 'rgba(184,160,110,.72)'; c.lineWidth = 4;
      [0.30, 0.48, 0.66, 0.84].forEach(function (v) {
        c.beginPath(); c.moveTo(0, H * v); c.lineTo(W, H * v); c.stroke();
      });
      c.lineWidth = 3;
      c.beginPath(); c.moveTo(W * 0.50, H * 0.06); c.lineTo(W * 0.50, H * 0.94); c.stroke();
      return tex(cv);
    })();

    var MAT = {
      skin:  new T.MeshStandardMaterial({ map: skinTex, roughness: 0.78, metalness: 0.0 }),
      skin2: new T.MeshStandardMaterial({ color: 0xa8c25e, roughness: 0.80, metalness: 0.0 }),
      belly: new T.MeshStandardMaterial({ map: bellyTex, roughness: 0.74, metalness: 0.02 }),
      shell: new T.MeshStandardMaterial({ map: shellTex, roughness: 0.50, metalness: 0.12 }),
      gold:  new T.MeshStandardMaterial({ color: 0xc19a45, roughness: 0.36, metalness: 0.50 }),
      goldDk:new T.MeshStandardMaterial({ color: 0x8a6a2e, roughness: 0.50, metalness: 0.38 }),
      scarf: new T.MeshStandardMaterial({ color: 0x4e8f83, roughness: 0.88, metalness: 0.0 }),
      scarfP:new T.MeshStandardMaterial({ color: 0x8ac6b8, roughness: 0.9, metalness: 0.0 }),
      bag:   new T.MeshStandardMaterial({ color: 0xc2b088, roughness: 0.94, metalness: 0.0 }),
      bagDk: new T.MeshStandardMaterial({ color: 0xa89267, roughness: 0.9, metalness: 0.0 }),
      cord:  new T.MeshStandardMaterial({ color: 0x6f4f2b, roughness: 0.86, metalness: 0.02 }),
      jade:  new T.MeshStandardMaterial({ color: 0x9ec7a6, roughness: 0.38, metalness: 0.06 }),
      eye:   new T.MeshStandardMaterial({ color: 0x1e1204, roughness: 0.16, metalness: 0.10 }),
      iris:  new T.MeshStandardMaterial({ color: 0x7a4718, roughness: 0.24, metalness: 0.06 }),
      ink:   new T.MeshStandardMaterial({ color: 0x33220f, roughness: 0.55, metalness: 0.0 }),
      mouth: new T.MeshStandardMaterial({ color: 0x8b3b31, roughness: 0.6, metalness: 0.0 }),
      tongue:new T.MeshStandardMaterial({ color: 0xef8f86, roughness: 0.75, metalness: 0.0 }),
      blush: new T.MeshStandardMaterial({ color: 0xf08373, roughness: 0.9, metalness: 0.0,
                                          transparent: true, opacity: 0.80 }),
      white: new T.MeshBasicMaterial({ color: 0xffffff }),
      wood:  new T.MeshStandardMaterial({ color: 0x6b5133, roughness: 0.72, metalness: 0.02 })
    };

    /* ---------------- 骨架 ---------------- */
    var hips = new T.Group();          /* 只做沉浮/摇摆，静止为 y=0 */
    root.add(hips);

    function mesh(geo, mat, x, y, z) {
      var m = new T.Mesh(geo, mat);
      m.position.set(x || 0, y || 0, z || 0);
      m.castShadow = true;
      m.receiveShadow = true;
      return m;
    }

    /* ---------------- 龟壳 ----------------
       Lathe 剖面绕 Y 转一圈，再绕 X 转 -90°：穹顶朝 -z（背）。
       壳心比躯干高 0.02、靠后 0.085 —— 壳在背上，不是套住身体的球。 */
    /* 侧视是个短板：HH 0.238 / sz 1.02 → 壳只有 0.24 米进深，
       从侧面看就是"背了一面圆盾"，不是包住背的甲。
       加高加厚（穹顶 0.30、进深 1.16）并抬到躯干中线以上，
       壳才成为体块的一部分；宽度略放，正面的缘口仍然在手臂内外之间。 */
    var SH = { R: 0.252, HH: 0.300, cy: 0.462, cz: -0.088, sx: 1.32, sy: 1.06, sz: 1.16 };
    (function shell() {
      var pts = [];
      /* 内缘 → 最外缘 → 收一点 → 穹顶：这三笔给出"壳口有厚度"的剪影 */
      pts.push(new T.Vector2(SH.R * 0.935, -0.022));
      pts.push(new T.Vector2(SH.R * 1.030, 0.004));
      pts.push(new T.Vector2(SH.R * 0.995, 0.050));
      for (var i = 2; i <= 20; i++) {
        var a = i / 20 * Math.PI / 2;
        pts.push(new T.Vector2(SH.R * 0.995 * Math.cos(a), 0.050 + (SH.HH - 0.050) * Math.sin(a)));
      }
      var m = new T.Mesh(new T.LatheGeometry(pts, 48), MAT.shell);
      m.rotation.x = -Math.PI / 2 + 0.09;
      m.position.set(0, SH.cy, SH.cz);
      m.scale.set(SH.sx, SH.sy, SH.sz);
      m.castShadow = true; m.receiveShadow = true;
      hips.add(m);

      /* 壳口不做独立的"金珠串 + 金环"：
         那一圈在斜 45° 视角下会读成一条绕身绑的绳套，把角色绑成五花大绑。
         厚度交给剖面自己（缘口外翻再收回），颜色交给贴图 v≈0 的金边。 */

      /* 背心金徽 */
      var zApex = SH.cz - (SH.HH * Math.cos(0.09)) * SH.sz + 0.010;
      var ring = new T.Mesh(new T.TorusGeometry(0.066, 0.010, 8, 26), MAT.gold);
      ring.position.set(0, SH.cy, zApex + 0.006);
      hips.add(ring);
      var plate = new T.Mesh(new T.CylinderGeometry(0.050, 0.050, 0.012, 20), MAT.goldDk);
      plate.position.set(0, SH.cy, zApex + 0.004);
      plate.rotation.x = Math.PI / 2;
      hips.add(plate);
      hips.add(mesh(new T.BoxGeometry(0.044, 0.009, 0.007), MAT.gold, 0, SH.cy + 0.007, zApex + 0.011));
      hips.add(mesh(new T.BoxGeometry(0.009, 0.040, 0.007), MAT.gold, 0, SH.cy, zApex + 0.011));
    })();

    /* ---------------- 腹甲 ----------------
       宽扁的胸甲（不是花瓶）。剖面在中段就放到最大半径，
       上下两端各收一点；z 压到 0.72，正面才是"板"不是"球"。 */
    (function plastron() {
      var pts = [
        new T.Vector2(0.014, -0.200),
        new T.Vector2(0.105, -0.192),
        new T.Vector2(0.160, -0.165),
        new T.Vector2(0.184, -0.100),
        new T.Vector2(0.190, 0.000),
        new T.Vector2(0.176, 0.105),
        new T.Vector2(0.140, 0.165),
        new T.Vector2(0.082, 0.198),
        new T.Vector2(0.014, 0.205)
      ];
      var m = new T.Mesh(new T.LatheGeometry(pts, 40), MAT.belly);
      m.scale.set(1.0, 1.04, 0.74);
      m.position.set(0, 0.430, 0.030);
      m.castShadow = true; m.receiveShadow = true;
      hips.add(m);
    })();

    /* ---------------- 脖子 ---------------- */
    var neck = mesh(new T.CylinderGeometry(0.092, 0.125, 0.130, 22), MAT.skin, 0, 0.575, 0.015);
    neck.rotation.x = -0.10;
    hips.add(neck);

    /* ---------------- 头 ----------------
       headG 原点 = 头心（y = 0.755）；面部坐标都相对它，
       改头大小只改 R_HEAD，贴面关系不用重算。 */
    var R_HEAD = 0.225;
    var headG = new T.Group();
    headG.position.set(0, 0.755, 0.020);
    hips.add(headG);

    var head = mesh(new T.SphereGeometry(R_HEAD, 48, 36), MAT.skin);
    head.scale.set(1.06, 1.04, 1.0);
    headG.add(head);

    /* 头面 z：给定 (x,y) 求椭球表面，面部件的贴面全靠它 */
    function faceZ(x, y) {
      var rx = x / (R_HEAD * 1.06), ry = y / (R_HEAD * 1.04);
      var k = 1 - rx * rx - ry * ry;
      return k <= 0 ? 0 : Math.sqrt(k) * R_HEAD;
    }

    /* 眼：眼窝环 + 眼球 + 虹膜 + 瞳孔 + 双高光 */
    var eyes = [];
    function eye(sx) {
      var g = new T.Group();
      var zs = faceZ(sx, 0.012);
      g.position.set(sx, 0.012, zs - 0.042);
      var sock = new T.Mesh(new T.TorusGeometry(0.070, 0.012, 8, 26), MAT.skin2);
      sock.position.z = -0.004;
      g.add(sock);
      var ball = mesh(new T.SphereGeometry(0.070, 26, 20), MAT.eye, 0, 0, 0);
      ball.scale.set(1, 1.04, 0.94);
      g.add(ball);
      var iris = new T.Mesh(new T.SphereGeometry(0.054, 22, 18), MAT.iris);
      iris.position.set(0, -0.004, 0.028);
      iris.scale.set(1, 1.02, 0.42);
      g.add(iris);
      var pupil = new T.Mesh(new T.SphereGeometry(0.031, 18, 14), MAT.eye);
      pupil.position.set(0, -0.004, 0.043);
      pupil.scale.set(1, 1.05, 0.30);
      g.add(pupil);
      var hl = new T.Mesh(new T.SphereGeometry(0.019, 14, 12), MAT.white);
      hl.position.set(0.021, 0.028, 0.049);
      g.add(hl);
      var hl2 = new T.Mesh(new T.SphereGeometry(0.009, 10, 8), MAT.white);
      hl2.position.set(-0.021, -0.024, 0.047);
      g.add(hl2);
      headG.add(g);
      eyes.push(g);
      return g;
    }
    eye(-0.093); eye(0.093);

    /* 眉毛：两道短弧（三视图里是很淡的弯眉） */
    [-1, 1].forEach(function (sg) {
      var brow = new T.Mesh(new T.TorusGeometry(0.044, 0.007, 6, 16, Math.PI * 0.70), MAT.ink);
      brow.position.set(sg * 0.093, 0.092, faceZ(sg * 0.093, 0.092) - 0.004);
      brow.rotation.z = sg > 0 ? Math.PI * 0.15 : Math.PI * 0.85;
      brow.rotation.x = -0.30;
      headG.add(brow);
    });

    /* 额纹：三道金色竖纹（中长侧短），顺着额头弧面倒下去 */
    (function crest() {
      function stroke(sx, h, w) {
        var yc = 0.128, zc = faceZ(sx, yc);
        var m = new T.Mesh(new T.BoxGeometry(w, h, 0.009), MAT.gold);
        m.position.set(sx, yc, zc - 0.006);
        m.rotation.x = -0.78;
        m.rotation.y = -sx * 5.0;
        headG.add(m);
      }
      stroke(0, 0.092, 0.014);
      stroke(-0.036, 0.058, 0.011);
      stroke(0.036, 0.058, 0.011);
    })();

    /* 嘴：口腔凹进去一点 + 舌 + 上唇弧 */
    (function mouth() {
      var y = -0.072, z = faceZ(0, y);
      var cavity = mesh(new T.SphereGeometry(0.044, 20, 16), MAT.mouth, 0, y, z - 0.024);
      cavity.scale.set(1.18, 0.70, 0.50);
      headG.add(cavity);
      var tongue = new T.Mesh(new T.SphereGeometry(0.023, 14, 12), MAT.tongue);
      tongue.position.set(0, y - 0.011, z - 0.012);
      tongue.scale.set(1.10, 0.46, 0.40);
      headG.add(tongue);
      var lip = new T.Mesh(new T.TorusGeometry(0.045, 0.008, 7, 22, Math.PI), MAT.ink);
      lip.position.set(0, y + 0.003, z - 0.008);
      lip.rotation.set(0, 0, Math.PI);
      headG.add(lip);
      /* 鼻：两个极小的凹点 */
      [-1, 1].forEach(function (sg) {
        var nz = new T.Mesh(new T.SphereGeometry(0.007, 8, 6), MAT.skin2);
        nz.position.set(sg * 0.015, y + 0.058, faceZ(sg * 0.015, y + 0.058) - 0.003);
        headG.add(nz);
      });
    })();

    /* 腮红 */
    [-1, 1].forEach(function (sg) {
      var b = new T.Mesh(new T.SphereGeometry(0.046, 18, 14), MAT.blush);
      b.position.set(sg * 0.152, -0.056, faceZ(sg * 0.152, -0.056) - 0.018);
      b.scale.set(1, 0.68, 0.28);
      headG.add(b);
    });

    /* ---------------- 围巾 ---------------- */
    var scarfTail = new T.Group();
    (function scarf() {
      var pts = [];
      for (var i = 0; i < 16; i++) {
        var t = i / 16 * Math.PI * 2;
        pts.push(new T.Vector3(Math.cos(t) * 0.150,
          0.535 + Math.sin(t * 2) * 0.018 - Math.cos(t) * 0.008,
          0.015 + Math.sin(t) * 0.136));
      }
      var curve = new T.CatmullRomCurve3(pts, true);
      var band = new T.Mesh(new T.TubeGeometry(curve, 96, 0.054, 10, true), MAT.scarf);
      band.castShadow = true;
      hips.add(band);
      var knot = mesh(new T.SphereGeometry(0.052, 16, 12), MAT.scarf, 0.108, 0.556, -0.122);
      knot.scale.set(1.10, 0.86, 0.92);
      hips.add(knot);
      /* 两条飘带：先上扬再往后甩 */
      var pathA = new T.CatmullRomCurve3([
        new T.Vector3(0.114, 0.570, -0.136),
        new T.Vector3(0.196, 0.628, -0.204),
        new T.Vector3(0.290, 0.640, -0.280),
        new T.Vector3(0.366, 0.612, -0.352),
        new T.Vector3(0.410, 0.570, -0.404)
      ]);
      var tA = new T.Mesh(new T.TubeGeometry(pathA, 40, 0.034, 8, false), MAT.scarfP);
      tA.castShadow = true;
      scarfTail.add(tA);
      var pathB = new T.CatmullRomCurve3([
        new T.Vector3(0.106, 0.552, -0.142),
        new T.Vector3(0.180, 0.556, -0.228),
        new T.Vector3(0.256, 0.534, -0.300),
        new T.Vector3(0.312, 0.492, -0.360)
      ]);
      var tB = new T.Mesh(new T.TubeGeometry(pathB, 36, 0.030, 8, false), MAT.scarf);
      scarfTail.add(tB);
      hips.add(scarfTail);
    })();

    /* ---------------- 四肢 ---------------- */
    /* 一条肢 = 1 个整胶囊（上粗下细）+ 掌 + 三爪。
       上一版拆成上臂 / 前臂两段，接缝处一圈露白，侧看像"两根棍绑在一起"。 */
    function arm(sx) {
      var pivot = new T.Group();
      pivot.position.set(sx * 0.218, 0.500, 0.040);
      var upper = mesh(new T.CapsuleGeometry(0.052, 0.150, 6, 16), MAT.skin, 0, -0.098, 0);
      upper.scale.set(1.0, 1.0, 0.96);
      pivot.add(upper);
      var elbow = new T.Group();
      elbow.position.set(0, -0.176, 0);
      pivot.add(elbow);
      var hand = mesh(new T.SphereGeometry(0.054, 18, 14), MAT.skin, 0, -0.012, 0.006);
      hand.scale.set(1.0, 0.92, 1.08);
      elbow.add(hand);
      [-0.36, 0, 0.36].forEach(function (a) {
        var c = new T.Mesh(new T.ConeGeometry(0.013, 0.030, 7), MAT.belly);
        c.position.set(Math.sin(a) * 0.028, -0.042, 0.030);
        c.rotation.x = Math.PI * 0.5 + 0.30;
        elbow.add(c);
      });
      pivot.rotation.z = -sx * 0.10;
      hips.add(pivot);
      return { pivot: pivot, elbow: elbow };
    }
    var armR = arm(1), armL = arm(-1);

    function leg(sx) {
      var pivot = new T.Group();
      pivot.position.set(sx * 0.132, 0.255, 0.010);
      pivot.add(mesh(new T.CapsuleGeometry(0.078, 0.062, 5, 14), MAT.skin, 0, -0.062, 0));
      var foot = mesh(new T.SphereGeometry(0.080, 18, 14), MAT.skin, 0, -0.209, 0.030);
      foot.scale.set(1.0, 0.56, 1.34);
      pivot.add(foot);
      [-0.042, 0, 0.042].forEach(function (dx) {
        var toe = new T.Mesh(new T.SphereGeometry(0.021, 10, 8), MAT.belly);
        toe.position.set(dx, -0.231, 0.122);
        toe.scale.set(1.0, 0.66, 1.10);
        pivot.add(toe);
      });
      hips.add(pivot);
      return { pivot: pivot };
    }
    var legR = leg(1), legL = leg(-1);

    /* 尾巴 */
    var tail = new T.Mesh(new T.ConeGeometry(0.038, 0.120, 12), MAT.skin);
    tail.position.set(0, 0.170, -0.225);
    tail.rotation.x = 1.18;
    tail.castShadow = true;
    hips.add(tail);

    /* ---------------- 行囊 ---------------- */
    var bagG = new T.Group();
    /* 背包要贴着壳挂在背后偏侧，而不是挂在胯边：
       侧视角下原来的位置（x0.262 / y0.30 / z-0.17）正好挡在身体前面，
       一团米褐色软囊看起来像多长了一条腿。往后、往上、缩小一档。 */
    bagG.position.set(0.243, 0.352, -0.250);
    bagG.rotation.set(0.05, -0.62, -0.10);
    bagG.scale.set(0.78, 0.82, 0.80);
    hips.add(bagG);
    (function bag() {
      var pts = [
        new T.Vector2(0.006, -0.140),
        new T.Vector2(0.066, -0.134),
        new T.Vector2(0.104, -0.100),
        new T.Vector2(0.124, -0.036),
        new T.Vector2(0.129, 0.028),
        new T.Vector2(0.110, 0.086),
        new T.Vector2(0.076, 0.124),
        new T.Vector2(0.064, 0.140)
      ];
      var b = mesh(new T.LatheGeometry(pts, 22), MAT.bag, 0, 0, 0);
      b.scale.set(1, 1, 0.82);
      bagG.add(b);
      /* 口沿用剖面自带的外翻，不再叠一个 torus —— 那个角度一斜就是个救生圈 */
      var tie = new T.Mesh(new T.TorusGeometry(0.062, 0.008, 7, 20), MAT.cord);
      tie.position.y = 0.120;
      tie.rotation.x = Math.PI / 2;
      bagG.add(tie);
      [0, 1].forEach(function (i) {
        var c = new T.Mesh(new T.CylinderGeometry(0.005, 0.004, 0.080, 6), MAT.cord);
        c.position.set(-0.018 + i * 0.032, 0.056 - i * 0.010, 0.064);
        c.rotation.z = 0.20 - i * 0.34;
        bagG.add(c);
        var bead = new T.Mesh(new T.SphereGeometry(0.010, 9, 7), MAT.bagDk);
        bead.position.set(-0.027 + i * 0.043, 0.014 - i * 0.013, 0.066);
        bagG.add(bead);
      });
      var roll = mesh(new T.CylinderGeometry(0.022, 0.022, 0.175, 14), MAT.belly, -0.028, 0.218, 0.006);
      roll.rotation.set(0.08, 0, 0.24);
      bagG.add(roll);
      var cap = new T.Mesh(new T.TorusGeometry(0.023, 0.005, 6, 14), MAT.bagDk);
      cap.position.set(-0.070, 0.298, 0.014);
      cap.rotation.set(Math.PI / 2 + 0.08, 0, 0.24);
      bagG.add(cap);
      var brush = mesh(new T.CylinderGeometry(0.007, 0.010, 0.160, 10), MAT.wood, 0.048, 0.204, 0.018);
      brush.rotation.set(0.06, 0, -0.18);
      bagG.add(brush);
      var tip = new T.Mesh(new T.ConeGeometry(0.009, 0.034, 9), MAT.ink);
      tip.position.set(0.065, 0.290, 0.024);
      tip.rotation.set(0.06, 0, -0.18);
      bagG.add(tip);
    })();

    /* 过肩背带 */
    (function strap() {
      var pts = [
        new T.Vector3(0.232, 0.462, -0.150),
        new T.Vector3(0.196, 0.540, -0.030),
        new T.Vector3(0.120, 0.560, 0.070),
        new T.Vector3(0.020, 0.500, 0.160),
        new T.Vector3(-0.080, 0.380, 0.175)
      ];
      var c = new T.CatmullRomCurve3(pts, false);
      var m = new T.Mesh(new T.TubeGeometry(c, 40, 0.014, 8, false), MAT.cord);
      m.castShadow = true;
      hips.add(m);
    })();

    /* 胸前玉佩 */
    (function pendant() {
      var cord = new T.Mesh(new T.TorusGeometry(0.086, 0.006, 5, 18, Math.PI * 1.2), MAT.cord);
      cord.position.set(0, 0.452, 0.172);
      cord.rotation.set(0.12, 0, Math.PI - 0.55);
      hips.add(cord);
      var s = new T.Shape();
      s.moveTo(-0.028, 0.040); s.lineTo(0.028, 0.040);
      s.lineTo(0.020, -0.040); s.lineTo(-0.020, -0.040); s.closePath();
      var g = new T.ExtrudeGeometry(s, { depth: 0.010, bevelEnabled: true,
        bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 1 });
      var m = mesh(g, MAT.jade, 0, 0.362, 0.182);
      m.rotation.x = -0.12;
      hips.add(m);
    })();

    /* 角色辅光：世界是黄昏暖调，角色纯靠环境光会糊进地面。
       一盏暖主光 + 一盏冷轮廓 —— 这是角色可读性，不是给场景打灯。 */
    var key = new T.PointLight(0xfff0d4, 0.62, 3.2, 2);
    key.position.set(0.50, 1.25, 1.05);
    root.add(key);
    var rimL = new T.PointLight(0xa8cad8, 0.62, 3.0, 2);
    rimL.position.set(-0.45, 1.05, -0.85);
    root.add(rimL);

    /* ---------------- 动画 ---------------- */
    var A = {
      t: 0, phase: 0, blinkT: 2.2, blink: 0,
      walkW: 0, lookYaw: 0, lookPitch: 0, forced: null,
      hop: 0, hopV: 0, armRaise: 0, armRaiseT: 0
    };

    function setMode(m) {
      if (A.forced === m) { return; }
      A.forced = m;
      if (m === 'happy') { A.hopV = 2.4; }
    }
    function clearMode() { A.forced = null; A.armRaiseT = 0; }

    function update(dt, s) {
      s = s || {};
      var speed = s.speed || 0;
      A.t += dt;

      var wantWalk = Math.min(1, speed / 3.2);
      A.walkW += (wantWalk - A.walkW) * Math.min(1, dt * 8);
      var w = A.walkW;
      A.phase += dt * (4.6 + speed * 1.9) * (0.35 + w * 0.65);

      var breath = Math.sin(A.t * 1.55) * 0.5 + 0.5;
      var sw = Math.sin(A.phase);
      var bob = Math.abs(Math.cos(A.phase));

      if (A.hopV !== 0 || A.hop > 0) {
        A.hop += A.hopV * dt;
        A.hopV -= 9.2 * dt;
        if (A.hop <= 0) { A.hop = 0; A.hopV = 0; }
      }

      var idleYaw = Math.sin(A.t * 0.42) * 0.20 + Math.sin(A.t * 0.17 + 1.2) * 0.10;
      var tgtYaw = (1 - w) * idleYaw + w * (-sw * 0.05);
      A.lookYaw += (tgtYaw - A.lookYaw) * Math.min(1, dt * 3.0);

      var m = A.forced;
      var pitchWant = 0;
      if (m === 'discover') { pitchWant = 0.14; }
      else if (m === 'explain') {
        pitchWant = -0.05 + Math.sin(A.t * 2.0) * 0.025;
        A.armRaiseT = 1;
      } else if (m === 'happy') { pitchWant = 0.10; }
      if (m !== 'explain') { A.armRaiseT = 0; }
      A.lookPitch += (pitchWant - A.lookPitch) * Math.min(1, dt * 4);

      legL.pivot.rotation.x = sw * 0.52 * w;
      legR.pivot.rotation.x = -sw * 0.52 * w;
      armL.pivot.rotation.x = -sw * 0.42 * w;
      armR.pivot.rotation.x = sw * 0.42 * w;
      armL.pivot.rotation.z = 0.12 + w * 0.05;
      armR.pivot.rotation.z = -0.12 - w * 0.05;
      armL.elbow.rotation.x = -0.10 - w * 0.16;
      armR.elbow.rotation.x = -0.10 - w * 0.16;

      A.armRaise += (A.armRaiseT - A.armRaise) * Math.min(1, dt * 4.5);
      if (A.armRaise > 0.01) {
        armR.pivot.rotation.x = armR.pivot.rotation.x * (1 - A.armRaise) - 1.20 * A.armRaise;
        armR.pivot.rotation.z = armR.pivot.rotation.z * (1 - A.armRaise) - 0.30 * A.armRaise;
        armR.elbow.rotation.x = armR.elbow.rotation.x * (1 - A.armRaise) - 0.50 * A.armRaise;
      }

      /* hips 静止为 0：沉浮/摇摆都叠在这上面 */
      hips.position.y = A.hop + bob * 0.026 * w - 0.006 * w;
      hips.rotation.z = sw * 0.072 * w;
      hips.rotation.x = -0.04 * w;
      hips.scale.y = 1 + breath * 0.010 * (1 - w);

      headG.rotation.z = -sw * 0.05 * w;
      headG.rotation.x = A.lookPitch + Math.sin(A.phase * 2) * 0.02 * w;
      headG.rotation.y = A.lookYaw;

      A.blinkT -= dt;
      if (A.blinkT <= 0) { A.blink = 0.10; A.blinkT = 2.6 + Math.random() * 2.8; }
      if (A.blink > 0) {
        A.blink -= dt;
        var k = A.blink > 0.05 ? 1 - (A.blink - 0.05) / 0.05 : A.blink / 0.05;
        var kk = 1 - 0.88 * Math.max(0, Math.min(1, k));
        eyes.forEach(function (e) { e.scale.y = kk; });
      } else {
        eyes.forEach(function (e) { e.scale.y = 1; });
      }

      tail.rotation.z = sw * 0.20 * w + Math.sin(A.t * 1.1) * 0.05 * (1 - w);
      scarfTail.rotation.z = Math.sin(A.phase * 0.9) * 0.15 * w + Math.sin(A.t * 0.9) * 0.05 * (1 - w);
      scarfTail.rotation.x = Math.sin(A.phase * 0.7 + 0.6) * 0.06 * w - 0.04 * w;
      bagG.rotation.z = -0.08 + sw * 0.09 * w + Math.sin(A.t * 1.3) * 0.010 * (1 - w);

      return A;
    }

    return {
      root: root,
      hips: hips,
      head: headG,
      eyes: eyes,
      update: update,
      setMode: setMode,
      clearMode: clearMode,
      /* 自查：几何事实。写断言读这里，不靠"看着差不多" */
      metrics: function () {
        var bb = new T.Box3().setFromObject(root);
        return {
          minY: +bb.min.y.toFixed(3),
          maxY: +bb.max.y.toFixed(3),
          height: +(bb.max.y - bb.min.y).toFixed(3),
          width: +(bb.max.x - bb.min.x).toFixed(3),
          depth: +(bb.max.z - bb.min.z).toFixed(3),
          headR: R_HEAD, headY: 0.755,
          shellW: +(SH.R * SH.sx * 2).toFixed(3)
        };
      },
      materials: MAT
    };
  }

  App.guibao = { build: build };
})(window.App);
