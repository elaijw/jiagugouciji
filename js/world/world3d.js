/* ============================================================
   甲骨奇谭 · 3D 世界：渲染 / 角色 / 相机 / 碰撞
   —— 这是「聚落世界」的运行时。场景几何由 world-build.js 提供，
      HUD 与交互面板由 world.js 负责，三层互不越界。

   为什么自己写角色控制而不引物理引擎：
     · 现有工程是零依赖 UMD、file:// 双击可跑；引 cannon/rapier 会引入
       ESM 或 800KB+ 的包，还要改加载链路。
     · 世界是静态几何，只需要「圆 vs AABB」推挤 + 贴地，两个函数就够。
     · 需要什么就写什么，出问题能一眼定位 —— 比黑盒引擎更稳。

   相机：斜俯视第三人称。yaw 由拖拽/右侧滑屏控制，pitch 限定 28°~72°，
        距离 7~24。目标点跟随角色并做阻尼，走起来不颠。
   ============================================================ */
(function (App) {
  'use strict';

  var THREE_SRC = 'vendor/three.min.js';

  /* three.min.js 实际 594 KB。GitHub Pages 在国内实测下载 10~60 秒且经常被中途掐断，
     而旧逻辑 15 秒硬超时 = 线上必定"3D 引擎加载超时"、页里一片黑。
     改成：单轮 45 秒 + 失败重试 2 次；重试时给 URL 加时间戳，绕开浏览器对那次
     失败响应的缓存（不然第二次请求根本不发，直接复用坏结果）。 */
  var LOAD_TIMEOUT = 45000, LOAD_TRIES = 2;

  function loadThree(done, tries) {
    if (window.THREE) { done(null); return; }
    tries = tries || 0;
    var s = document.createElement('script');
    var finished = false;
    var timer = setTimeout(function () {
      if (finished) { return; }
      finished = true;
      if (tries < LOAD_TRIES) { retry(); } else { done(new Error('3D 引擎加载超时')); }
    }, LOAD_TIMEOUT);
    function retry() {
      clearTimeout(timer);
      s.onload = s.onerror = null;
      setTimeout(function () { loadThree(done, tries + 1); }, 600);
    }
    s.src = THREE_SRC + (tries ? '?retry=' + Date.now() : '');
    s.async = true;
    s.onload = function () {
      if (finished) { return; }
      finished = true; clearTimeout(timer);
      done(window.THREE ? null : new Error('THREE 未就绪'));
    };
    s.onerror = function () {
      if (finished) { return; }
      finished = true;
      if (tries < LOAD_TRIES) { retry(); } else { done(new Error('3D 引擎加载失败')); }
    };
    document.head.appendChild(s);
  }

  function create(host, opt, cb) {
    var o = opt || {};
    loadThree(function (err) {
      if (err) { cb(err); return; }
      try { build(host, o, cb); }
      catch (e) { cb(e); }
    });
  }

  function build(host, opt, cb) {
    var T = window.THREE;
    var o = opt || {};
    var W = host.clientWidth || window.innerWidth;
    var H = host.clientHeight || window.innerHeight;

    var renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(W, H, false);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    if (T.SRGBColorSpace) { renderer.outputColorSpace = T.SRGBColorSpace; }
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.90;
    renderer.domElement.style.display = 'block';
    host.appendChild(renderer.domElement);

    var scene = new T.Scene();
    /* 地形是 150×150 的有限平面，边界就在 75 米外。雾太薄时，地形到此为止、
       天穹从这儿开始，画面上会出现一条假的"地平线"断层（看到的像一块褐色地面
       被一刀切掉）。把密度提到 0.013，让 60~75 米的景物先被雾吃掉，
       顺带把外圈山脊变成朦胧的远山剪影。 */
    scene.fog = new T.FogExp2(0x9a7d59, 0.0130);

    /* ---------- 天穹：黄昏 ---------- */
    (function sky() {
      var cv = document.createElement('canvas');
      cv.width = 8; cv.height = 256;
      var c = cv.getContext('2d');
      var g = c.createLinearGradient(0, 0, 0, 256);
      g.addColorStop(0.00, '#1d2636');
      g.addColorStop(0.30, '#46405a');
      g.addColorStop(0.50, '#96694d');
      g.addColorStop(0.62, '#d6a267');
      g.addColorStop(0.70, '#e8bd83');
      g.addColorStop(0.78, '#b98a58');
      g.addColorStop(1.00, '#4a3826');
      c.fillStyle = g; c.fillRect(0, 0, 8, 256);
      var tex = new T.CanvasTexture(cv);
      if (T.SRGBColorSpace) { tex.colorSpace = T.SRGBColorSpace; }
      var dome = new T.Mesh(
        new T.SphereGeometry(230, 32, 20),
        new T.MeshBasicMaterial({ map: tex, side: T.BackSide, fog: false, depthWrite: false })
      );
      scene.add(dome);
    })();

    /* ---------- 光 ---------- */
    var hemi = new T.HemisphereLight(0xffd9b0, 0x4a3826, 0.82);
    scene.add(hemi);

    var sun = new T.DirectionalLight(0xffcb93, 1.28);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 100;
    sun.shadow.camera.left = -26;
    sun.shadow.camera.right = 26;
    sun.shadow.camera.top = 26;
    sun.shadow.camera.bottom = -26;
    sun.shadow.bias = -0.0012;
    sun.shadow.normalBias = 0.03;
    scene.add(sun);
    scene.add(sun.target);
    var SUN_DIR = new T.Vector3(-0.55, 0.72, 0.42).normalize();

    /* ---------- 场景 ---------- */
    var world = App.worldBuild.build({});
    scene.add(world.root);

    /* 火塘点光：四盏小的，暖色，照出"有人住"的边界 */
    var fireLights = [];
    world.fires.forEach(function (f) {
      var l = new T.PointLight(0xff9a4e, 1.5, 16, 2);
      l.position.set(f.x, f.y + 0.4, f.z);
      scene.add(l);
      fireLights.push({ light: l, base: 1.5, seed: Math.random() * 10 });
      /* 火苗本体：两层锥，靠动画抖动 */
      var flame = new T.Mesh(
        new T.ConeGeometry(0.26, 0.9, 6, 1),
        new T.MeshBasicMaterial({ color: 0xffb066, transparent: true, opacity: 0.72, fog: false })
      );
      flame.position.set(f.x, f.y + 0.45, f.z);
      scene.add(flame);
      fireLights[fireLights.length - 1].flame = flame;
    });

    /* ---------- 角色 ----------
       关节层级：髋 → 躯干 → 头/双臂，髋 → 双腿。
       不做骨骼动画（自写 GLB 解析器不处理 skinning），
       改用「枢轴 Group + 三角函数摆腿」的程序化步态 —— 走的动作是真的在走。 */
    /* 玩家就是龟宝 —— 原站的形象（guibao-side.png）：淡黄绿的圆头、大眼、
       深绿回纹龟壳、青色布巾、背后一只装卷轴的行囊。
       不做骨骼动画，用「枢轴 Group + 三角函数摆四肢」实现走路的摇摆步态。
       尺寸按"缩小的龟宝"定：总高 1.14 米，头占 0.56 —— 头大是它的辨识度。 */
    var player = new T.Group();
    player.name = 'guibao';   /* 便于调试时从场景树里精确定位龟宝 */
    var GUI = {
      /* 颜色对照《中原使者——龟宝》三视图：
         肤=黄绿偏暖、壳=墨绿+金甲缘、腹甲=米白、围巾=青碧、瞳孔=深棕。 */
      skin:  new T.MeshStandardMaterial({ color: 0xb4d18c, roughness: 0.72, metalness: 0.02 }),
      belly: new T.MeshStandardMaterial({ color: 0xf0e4bc, roughness: 0.82, metalness: 0.02 }),
      shell: new T.MeshStandardMaterial({ color: 0x47684a, roughness: 0.60, metalness: 0.06 }),
      rim:   new T.MeshStandardMaterial({ color: 0xb9984f, roughness: 0.46, metalness: 0.26 }),
      gold:  new T.MeshStandardMaterial({ color: 0xc9a44e, roughness: 0.38, metalness: 0.42 }),
      goldDk:new T.MeshStandardMaterial({ color: 0x8a6a2e, roughness: 0.52, metalness: 0.30 }),
      scarf: new T.MeshStandardMaterial({ color: 0x7fb0a2, roughness: 0.86, metalness: 0.0 }),
      bag:   new T.MeshStandardMaterial({ color: 0xe3d9ba, roughness: 0.92, metalness: 0.0 }),
      bagDk: new T.MeshStandardMaterial({ color: 0xa08f64, roughness: 0.9, metalness: 0.0 }),
      cord:  new T.MeshStandardMaterial({ color: 0x7a5a34, roughness: 0.82, metalness: 0.02 }),
      jade:  new T.MeshStandardMaterial({ color: 0x9fc4a0, roughness: 0.45, metalness: 0.08 }),
      wood:  new T.MeshStandardMaterial({ color: 0x6b5133, roughness: 0.7, metalness: 0.02 }),
      eye:   new T.MeshStandardMaterial({ color: 0x2b1a0c, roughness: 0.22, metalness: 0.12 }),
      iris:  new T.MeshStandardMaterial({ color: 0x6b3d18, roughness: 0.30, metalness: 0.06 }),
      socket:new T.MeshStandardMaterial({ color: 0x9fbb7c, roughness: 0.78, metalness: 0.02 }),
      ink:   new T.MeshStandardMaterial({ color: 0x2b2018, roughness: 0.4, metalness: 0.05 }),
      mouth: new T.MeshStandardMaterial({ color: 0x8a4438, roughness: 0.55, metalness: 0.0 }),
      blush: new T.MeshStandardMaterial({ color: 0xf2907c, roughness: 0.9, metalness: 0.0 })
    };

    /* 龟壳纹：背面图里那面"墨绿底 + 浅绿回纹格"的甲。
       回纹画成小格铺满，球面 UV 的畸变才不明显；中央金徽另用几何做。 */
    (function shellTex() {
      var S = 256;
      var cv = document.createElement('canvas');
      cv.width = cv.height = S;
      var c = cv.getContext('2d');
      c.fillStyle = '#47684a'; c.fillRect(0, 0, S, S);
      /* 单枚回纹：外方框 + 内折笔，一笔带出"回"字螺旋 */
      function key(x, y, s) {
        c.beginPath();
        c.moveTo(x, y); c.lineTo(x + s, y); c.lineTo(x + s, y + s);
        c.lineTo(x, y + s); c.closePath();
        c.moveTo(x + s * 0.30, y + s * 0.30);
        c.lineTo(x + s * 0.72, y + s * 0.30);
        c.lineTo(x + s * 0.72, y + s * 0.60);
        c.lineTo(x + s * 0.46, y + s * 0.60);
        c.stroke();
      }
      var cell = S / 7;
      c.strokeStyle = 'rgba(158,196,132,.55)'; c.lineWidth = 2.2;
      for (var gy = 0; gy < 7; gy++) {
        for (var gx = 0; gx < 7; gx++) {
          key(gx * cell + cell * 0.14, gy * cell + cell * 0.14, cell * 0.72);
        }
      }
      /* 甲片接缝：比回纹更深的暗线，让壳面有分块感 */
      c.strokeStyle = 'rgba(28,46,30,.55)'; c.lineWidth = 3;
      for (var i = 0; i <= 7; i++) {
        c.beginPath(); c.moveTo(i * cell, 0); c.lineTo(i * cell, S); c.stroke();
        c.beginPath(); c.moveTo(0, i * cell); c.lineTo(S, i * cell); c.stroke();
      }
      var t = new T.CanvasTexture(cv);
      if (T.SRGBColorSpace) { t.colorSpace = T.SRGBColorSpace; }
      t.wrapS = t.wrapT = T.RepeatWrapping;
      GUI.shell.map = t;
      GUI.shell.needsUpdate = true;
    })();

    /* 腹甲分段：设定图正面那片米色甲板是有横格的。画一张竖条纹理，
       球面 UV 上一贴就是横向甲缝，比堆几何便宜得多。 */
    (function plastronTex() {
      var W = 128, H = 128;
      var cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      var c = cv.getContext('2d');
      c.fillStyle = '#efe7c6'; c.fillRect(0, 0, W, H);
      c.strokeStyle = 'rgba(190,172,128,.85)'; c.lineWidth = 2.4;
      for (var i = 1; i <= 5; i++) {
        var y = H * (i / 6);
        c.beginPath();
        c.moveTo(0, y);
        c.quadraticCurveTo(W / 2, y + 6, W, y);
        c.stroke();
      }
      /* 中缝：三视图腹甲正中那道竖缝。
         球面 UV 的 +z 正面在 u=0.25，所以缝画在 x=W*0.25 这条经线上。 */
      c.strokeStyle = 'rgba(190,172,128,.9)'; c.lineWidth = 2.6;
      c.beginPath(); c.moveTo(W * 0.25, 0); c.lineTo(W * 0.25, H); c.stroke();
      var t = new T.CanvasTexture(cv);
      if (T.SRGBColorSpace) { t.colorSpace = T.SRGBColorSpace; }
      GUI.belly.map = t;
      GUI.belly.needsUpdate = true;
    })();

    /* 比例照 assets/guibao-front.png 的设定图：头几乎占一半身高，
       正面是一整片米色腹甲（带分段线），青绿龟壳只在两侧和身后露出来。 */
    var HIP_Y = 0.30;                 /* 髋部高度：短腿 + 大半身 */
    var hips = new T.Group(); hips.position.y = HIP_Y; player.add(hips);

    /* 青绿龟壳：横向拉开、纵向压扁 —— 龟的轮廓是"扁而宽"，不是球。
       壳宽必须明显大过腹甲和头，正面才会露出两侧的绿壳边，
       否则三样东西同宽，正面就只剩一个米色圆球。 */
    /* 壳：从"压扁的球"换成真正的穹顶。
       LatheGeometry 旋出一条四分之一椭圆剖面：缘口先外翻，再收成穹顶，
       绕 Y 旋完再绕 X 转 -90°，穹顶轴就指向身后 —— 龟甲是长在背上的，
       不是套在身上的球。球面球最致命的地方是正面也鼓出一个球，
       把整片腹甲挡住。 */
    var SH = { R: 0.33, HH: 0.34, cx: 0, cy: 0.155, cz: -0.055, sx: 1.18, sy: 1.12, sz: 0.95 };
    (function carapace() {
      var pts = [];
      pts.push(new T.Vector2(SH.R * 1.07, -0.040));    /* 缘口外翻 */
      pts.push(new T.Vector2(SH.R * 1.02, -0.014));
      for (var i = 0; i <= 16; i++) {                  /* 穹顶 */
        var a = i / 16 * Math.PI / 2;
        pts.push(new T.Vector2(SH.R * Math.cos(a), SH.HH * Math.sin(a)));
      }
      var m = new T.Mesh(new T.LatheGeometry(pts, 44), GUI.shell);
      m.rotation.x = -Math.PI / 2;
      m.position.set(SH.cx, SH.cy, SH.cz);
      m.scale.set(SH.sx, SH.sy, SH.sz);
      m.castShadow = true; m.receiveShadow = true;
      hips.add(m);
      /* 缘盾：沿壳口一圈 16 枚金/深金相间的盾片。
         龟甲最有识别度的就是这一圈边，光靠贴图描出不来。 */
      var sg = new T.SphereGeometry(0.046, 12, 9);
      for (var k = 0; k < 16; k++) {
        var th = k / 16 * Math.PI * 2 + 0.10;
        var s = new T.Mesh(sg, k % 2 ? GUI.rim : GUI.goldDk);
        s.position.set(Math.cos(th) * SH.R * SH.sx * 1.02,
          SH.cy + Math.sin(th) * SH.R * SH.sz * 1.02,
          SH.cz + 0.045 * SH.sy - 0.012);
        s.scale.set(0.9, 1.0, 0.62);
        s.rotation.z = th;
        s.castShadow = true;
        hips.add(s);
      }
      /* 甲缘：一道压住缘盾根部的金环 */
      var rim = new T.Mesh(new T.TorusGeometry(SH.R * 1.0, 0.030, 10, 40), GUI.rim);
      rim.position.set(SH.cx, SH.cy, SH.cz + 0.014 * SH.sy);
      rim.scale.set(SH.sx, SH.sz, 1);
      rim.castShadow = true; hips.add(rim);
    })();
    /* 壳面求 z：给定 (x, y) 返回穹顶表面在该处的 z。
       挂饰要贴着甲面摆就得用它，凭手感摆十有八九会埋进甲里。 */
    function shellZ(x, y) {
      var rx = x / SH.sx, ry = (y - SH.cy) / SH.sz;
      var rho = Math.sqrt(rx * rx + ry * ry);
      if (rho >= SH.R) { return SH.cz; }
      var sina = Math.sqrt(1 - (rho / SH.R) * (rho / SH.R));
      return SH.cz - SH.HH * sina * SH.sy;
    }

    /* 背面金徽：三视图背面正中那枚金色圆徽，钉在穹顶最高点上。
       圆徽的正面法线正好是 -z，贴着顶点放不会歪。 */
    (function emblemAt() {
      var z = shellZ(0, SH.cy) - 0.002;
      var e = new T.Mesh(new T.CylinderGeometry(0.105, 0.105, 0.022, 24), GUI.gold);
      e.position.set(0, SH.cy, z); e.rotation.x = Math.PI / 2;
      e.castShadow = true; hips.add(e);
      var ring = new T.Mesh(new T.TorusGeometry(0.068, 0.010, 8, 24), GUI.goldDk);
      ring.position.set(0, SH.cy, z - 0.014); hips.add(ring);
      var core = new T.Mesh(new T.BoxGeometry(0.050, 0.050, 0.012), GUI.goldDk);
      core.position.set(0, SH.cy, z - 0.015); core.rotation.z = Math.PI / 4;
      hips.add(core);
    })();

    /* 过肩背带：从背包口上肩、斜过胸前的一根皮绳。
       整圈 torus 从侧面看像个悬空的呼啦圈，换成沿曲线走的管子，
       只保留"真正挎在身上"那一段。 */
    (function strap() {
      var pts = [
        new T.Vector3(0.44, 0.16, -0.14),    /* 背包口 */
        new T.Vector3(0.40, 0.30, -0.06),
        new T.Vector3(0.26, 0.38, 0.04),     /* 过肩 */
        new T.Vector3(0.06, 0.30, 0.24),
        new T.Vector3(-0.12, 0.16, 0.34)     /* 到左腰 */
      ];
      var c = new T.CatmullRomCurve3(pts, false);
      var m = new T.Mesh(new T.TubeGeometry(c, 40, 0.017, 8, false), GUI.cord);
      m.castShadow = true; hips.add(m);
    })();

    /* 腹甲：正面那片米白甲板。必须比壳的前沿更往前探（壳前缘 z≈0.316），
       不然整片腹甲被壳挡住，正面就只剩一个绿圈 —— 上一轮就是栽在这。 */
    var belly = new T.Mesh(new T.SphereGeometry(0.302, 36, 28), GUI.belly);
    belly.scale.set(1.04, 0.82, 0.86); belly.position.set(0, 0.105, 0.115);
    belly.castShadow = true; belly.receiveShadow = true; hips.add(belly);

    /* 脖子：一小截过渡，把头顶到身体前面 —— 龟的头是往前探的 */
    var neck = new T.Mesh(new T.CylinderGeometry(0.105, 0.15, 0.20, 20), GUI.skin);
    neck.position.set(0, 0.375, 0.050); neck.rotation.x = -0.16;
    hips.add(neck);

    /* 头：大球（半径 0.30，接近设定图的头身比）。段数给足，轮廓才不显棱。 */
    var headG = new T.Group(); headG.position.set(0, 0.455, 0.060); hips.add(headG);
    var head = new T.Mesh(new T.SphereGeometry(0.262, 44, 34), GUI.skin);
    /* 腮帮比头顶略宽（三视图的梨形头），正面才显得憨 */
    head.scale.set(1.05, 1.01, 0.98); head.castShadow = true; head.receiveShadow = true;
    headG.add(head);
    /* 下颌：一小块补在头底下，头到脖子才不是"球插棍" */
    var jaw = new T.Mesh(new T.SphereGeometry(0.215, 24, 18), GUI.skin);
    jaw.scale.set(0.94, 0.66, 1.00); jaw.position.set(0, -0.135, 0.045);
    headG.add(jaw);

    /* 额纹：三视图额头正中那三道金色竖纹（中长两侧短，像"川"字）。
       贴着头皮放，太靠外就成了"头顶天线"。 */
    (function crown() {
      var v = new T.Mesh(new T.BoxGeometry(0.014, 0.070, 0.010), GUI.gold);
      v.position.set(0, 0.158, 0.212); v.rotation.x = -0.86; headG.add(v);
      [-0.034, 0.034].forEach(function (sx) {
        var h = new T.Mesh(new T.BoxGeometry(0.012, 0.048, 0.010), GUI.gold);
        h.position.set(sx, 0.155, 0.205); h.rotation.x = -0.86;
        h.rotation.y = -sx * 1.4; headG.add(h);
      });
    })();

    /* 眼睛：三视图里占了半张脸的大眼。
       先挖一圈浅浅的眼窝（比肤色深一点的环），再把眼球坐进窝里 ——
       直接把球贴在脸上会看成"两个贴上去的珠子"。 */
    function eye(sx) {
      var socket = new T.Mesh(new T.TorusGeometry(0.076, 0.016, 8, 24), GUI.socket);
      socket.position.set(sx, 0.024, 0.212); headG.add(socket);
      var e = new T.Mesh(new T.SphereGeometry(0.070, 26, 20), GUI.eye);
      e.position.set(sx, 0.022, 0.206); e.scale.set(1, 1.12, 0.66);
      headG.add(e);
      /* 虹膜再分一层：外圈稍亮的棕，中心压深，眼睛才有"神" */
      var iris = new T.Mesh(new T.SphereGeometry(0.052, 20, 16), GUI.iris);
      iris.position.set(sx, 0.024, 0.226); iris.scale.set(1, 1.08, 0.40);
      headG.add(iris);
      var hl = new T.Mesh(new T.SphereGeometry(0.022, 12, 10),
        new T.MeshBasicMaterial({ color: 0xffffff }));
      hl.position.set(sx + 0.021, 0.055, 0.240); headG.add(hl);
      var hl2 = new T.Mesh(new T.SphereGeometry(0.011, 10, 8),
        new T.MeshBasicMaterial({ color: 0xfff4de }));
      hl2.position.set(sx - 0.021, 0.002, 0.246); headG.add(hl2);
    }
    eye(-0.106); eye(0.106);
    /* 圆腮红：正面图两团粉扑扑的圆斑。
       注：头面半径 0.254，所有面部件的 z 都要 ≥0.24 才不会埋进头里。 */
    [-0.178, 0.178].forEach(function (sx) {
      var b = new T.Mesh(new T.SphereGeometry(0.052, 18, 14), GUI.blush);
      b.position.set(sx, -0.052, 0.186); b.scale.set(1, 0.72, 0.34);
      headG.add(b);
    });
    /* 开口笑：唇线 + 口腔 + 一点舌头。比一条细线更像"在笑" */
    var lip = new T.Mesh(new T.TorusGeometry(0.046, 0.008, 8, 20, Math.PI), GUI.ink);
    lip.position.set(0, -0.076, 0.240);
    lip.rotation.set(0, 0, Math.PI);
    headG.add(lip);
    var mouthIn = new T.Mesh(new T.SphereGeometry(0.034, 18, 14), GUI.mouth);
    mouthIn.position.set(0, -0.094, 0.238); mouthIn.scale.set(1.15, 0.62, 0.30);
    headG.add(mouthIn);
    var tongue = new T.Mesh(new T.SphereGeometry(0.020, 12, 10), GUI.blush);
    tongue.position.set(0, -0.104, 0.250); tongue.scale.set(1.2, 0.5, 0.5);
    headG.add(tongue);

    /* 围巾布面：三视图里是"青碧底 + 白云卷草纹"。程序化画一条。 */
    (function scarfTex() {
      var W = 256, H = 64;
      var cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      var c = cv.getContext('2d');
      c.fillStyle = '#7fb0a2'; c.fillRect(0, 0, W, H);
      c.strokeStyle = 'rgba(214,236,228,.85)'; c.lineWidth = 2.4;
      /* 涡卷：一段开口弧线 + 内收小弧，近似云雷卷 */
      for (var i = 0; i < 5; i++) {
        var x = 26 + i * 52, y = H / 2;
        c.beginPath(); c.arc(x, y, 15, 0.6, 4.4); c.stroke();
        c.beginPath(); c.arc(x, y, 8, 0.6, 3.8); c.stroke();
      }
      c.strokeStyle = 'rgba(214,236,228,.5)'; c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(0, 7); c.lineTo(W, 7); c.stroke();
      c.beginPath(); c.moveTo(0, H - 7); c.lineTo(W, H - 7); c.stroke();
      var t = new T.CanvasTexture(cv);
      if (T.SRGBColorSpace) { t.colorSpace = T.SRGBColorSpace; }
      t.wrapS = t.wrapT = T.RepeatWrapping;
      GUI.scarf.map = t; GUI.scarf.needsUpdate = true;
    })();

    /* 布巾：绕颈一圈的闭合曲线管（不是圆环 —— 圆环看着像套了个救生圈，
       管子能做出"布料垂下来"的起伏）。 */
    (function neckScarf() {
      var pts = [];
      for (var i = 0; i < 18; i++) {
        var t = i / 18 * Math.PI * 2;
        pts.push(new T.Vector3(Math.cos(t) * 0.215,
          0.300 + Math.sin(t * 2) * 0.030 - Math.cos(t) * 0.012,
          0.070 + Math.sin(t) * 0.205));
      }
      var curve = new T.CatmullRomCurve3(pts, true);
      var scarf = new T.Mesh(new T.TubeGeometry(curve, 90, 0.044, 10, true), GUI.scarf);
      scarf.castShadow = true; hips.add(scarf);
    })();
    /* 结打在颈后；飘带沿壳背垂下来，每一段的 z 都用 shellZ 贴着甲面算，
       不然不是埋进壳里就是飘在半空。 */
    var ribbon = new T.Group();
    ribbon.userData.bx = 0; hips.add(ribbon);
    (function knotRibbon() {
      var knot = new T.Mesh(new T.SphereGeometry(0.062, 16, 12), GUI.scarf);
      knot.position.set(0.055, 0.395, -0.135); knot.scale.set(1.15, 0.9, 0.85);
      hips.add(knot);
      /* 飘带：从颈后铺到壳背，末端甩出壳外 */
      var ys = [0.38, 0.30, 0.22, 0.155, 0.09, 0.02];
      var rp = [];
      ys.forEach(function (y, i) {
        var x = 0.10 + i * 0.015;
        rp.push(new T.Vector3(x, y, shellZ(x, y) - (i < 4 ? 0.030 : 0.055)));
      });
      var rc = new T.CatmullRomCurve3(rp, false);
      var tube = new T.Mesh(new T.TubeGeometry(rc, 48, 0.034, 8, false), GUI.scarf);
      tube.castShadow = true;
      ribbon.add(tube);
      /* 飘带末端压个小布角 */
      var tip = new T.Mesh(new T.ConeGeometry(0.048, 0.10, 4), GUI.scarf);
      var last = rp[rp.length - 1];
      tip.position.set(last.x, last.y - 0.05, last.z);
      tip.rotation.set(Math.PI, 0, Math.PI / 4);
      ribbon.add(tip);
    })();

    /* 胸前玉佩：三视图里那块梯形玉牌 + 棕色挂绳（垂在腹甲中缝上）。
       腹甲正面鼓到 z≈0.37，玉佩/挂绳都得贴到它表面，不能留在旧 z 上。 */
    var pendantCord = new T.Mesh(new T.TorusGeometry(0.105, 0.0075, 5, 18, Math.PI * 1.35), GUI.cord);
    pendantCord.position.set(0, 0.235, 0.325);
    pendantCord.rotation.set(0.10, 0, Math.PI - 0.66);
    hips.add(pendantCord);
    (function pendant() {
      var s = new T.Shape();
      s.moveTo(-0.036, 0.052); s.lineTo(0.036, 0.052);
      s.lineTo(0.024, -0.052); s.lineTo(-0.024, -0.052); s.closePath();
      var g = new T.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: true,
        bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 1 });
      var m = new T.Mesh(g, GUI.jade);
      m.position.set(0, 0.132, 0.362); m.rotation.x = -0.14;
      m.castShadow = true; hips.add(m);
      /* 玉牌上的小圆孔 */
      var hole = new T.Mesh(new T.CylinderGeometry(0.008, 0.008, 0.030, 8), GUI.cord);
      hole.position.set(0, 0.184, 0.350); hole.rotation.x = Math.PI / 2 - 0.14;
      hips.add(hole);
    })();

    /* 行囊：侧挎的软布囊 + 束口绳 + 竹简 + 毛笔（三视图挂在身侧腰后）。
       布袋做成"束口的软囊"：上大下小、口部收紧再打个结。 */
    /* 布囊：用旋转体做出"下坠的软囊"—— 底圆、腰鼓、颈收、口翻。
       球不管怎么缩放都还是个球，看不出"装了东西沉下去"的重量感。 */
    (function sack() {
      var sp = [];
      sp.push(new T.Vector2(0.004, -0.170));
      sp.push(new T.Vector2(0.075, -0.164));
      sp.push(new T.Vector2(0.128, -0.120));
      sp.push(new T.Vector2(0.158, -0.045));
      sp.push(new T.Vector2(0.163, 0.030));
      sp.push(new T.Vector2(0.140, 0.100));
      sp.push(new T.Vector2(0.098, 0.150));
      sp.push(new T.Vector2(0.082, 0.172));
      var bag = new T.Mesh(new T.LatheGeometry(sp, 22), GUI.bag);
      bag.position.set(0.445, 0.020, -0.160);
      bag.scale.set(1, 1, 0.86);
      bag.castShadow = true; bag.receiveShadow = true;
      hips.add(bag);
      /* 束口：口沿翻边 + 一道绳 */
      var mouth = new T.Mesh(new T.TorusGeometry(0.086, 0.020, 10, 20), GUI.bagDk);
      mouth.position.set(0.445, 0.192, -0.160);
      mouth.rotation.x = Math.PI / 2;
      hips.add(mouth);
      var tie = new T.Mesh(new T.TorusGeometry(0.080, 0.011, 8, 20), GUI.cord);
      tie.position.set(0.445, 0.176, -0.160);
      tie.rotation.x = Math.PI / 2;
      hips.add(tie);
    })();
    /* 束口垂下来的两根绳头 */
    [0, 1].forEach(function (i) {
      var cord = new T.Mesh(new T.CylinderGeometry(0.006, 0.004, 0.090, 6), GUI.cord);
      cord.position.set(0.378 + i * 0.020, 0.130 - i * 0.014, -0.108);
      cord.rotation.z = 0.16 - i * 0.30; hips.add(cord);
      var bead = new T.Mesh(new T.SphereGeometry(0.013, 10, 8), GUI.bagDk);
      bead.position.set(0.386 + i * 0.028, 0.086 - i * 0.016, -0.104);
      hips.add(bead);
    });
    /* 囊里插着的竹简和毛笔 */
    var roll = new T.Mesh(new T.CylinderGeometry(0.028, 0.028, 0.28, 14), GUI.belly);
    roll.position.set(0.400, 0.255, -0.180); roll.rotation.set(0.16, 0, 0.30);
    roll.castShadow = true;
    hips.add(roll);
    var rollCap = new T.Mesh(new T.TorusGeometry(0.030, 0.006, 6, 14), GUI.bagDk);
    rollCap.position.set(0.386, 0.335, -0.183); rollCap.rotation.set(0.16, 0, 0.30);
    rollCap.rotation.x = Math.PI / 2 + 0.16; hips.add(rollCap);
    var brush = new T.Mesh(new T.CylinderGeometry(0.009, 0.014, 0.22, 10), GUI.wood);
    brush.position.set(0.492, 0.225, -0.158); brush.rotation.set(0.12, 0, -0.24);
    hips.add(brush);
    /* 笔尖：一小截深色锥，不然毛笔看不出来 */
    var brushTip = new T.Mesh(new T.ConeGeometry(0.011, 0.040, 10), GUI.ink);
    brushTip.position.set(0.518, 0.330, -0.164); brushTip.rotation.z = -0.24;
    hips.add(brushTip);

    /* 四肢：短、粗、末端圆 —— 龟宝是"小短腿"。
       龟的四条腿是往两侧横着伸的，所以位置外撇、再给一点 z 轴外张，
       正、侧两个角度都看得见四条腿（原来全埋在壳里，看着像"没腿的球"）。 */
    /* 四肢：胶囊体 + 圆脚掌 + 三枚爪。
       圆柱两端是平的，关节处会出现硬折角；胶囊自带半球收头，
       小短腿那种"一节藕"的憨态才出得来。 */
    function limb(geoMat, r, len, withClaw) {
      var pivot = new T.Group();
      var geo = T.CapsuleGeometry
        ? new T.CapsuleGeometry(r, len, 6, 16)
        : new T.CylinderGeometry(r, r, len, 14, 1);
      var m = new T.Mesh(geo, geoMat);
      m.position.y = -(len / 2 + r); m.castShadow = true;
      pivot.add(m);
      var end = new T.Mesh(new T.SphereGeometry(r * 1.20, 16, 12), geoMat);
      end.position.y = -(len + r * 1.35); end.scale.set(1, 0.78, 1.22);
      end.castShadow = true;
      pivot.add(end);
      if (withClaw) {
        [-0.42, 0, 0.42].forEach(function (a) {
          var c = new T.Mesh(new T.ConeGeometry(r * 0.20, r * 0.85, 8), GUI.belly);
          c.position.set(Math.sin(a) * r * 0.85, -(len + r * 1.85), r * 0.86);
          c.rotation.x = Math.PI / 2 - 0.25;
          pivot.add(c);
        });
      }
      return pivot;
    }
    /* 壳口横向到 x=±0.39，手臂要挂在壳外才看得见 */
    var armL = limb(GUI.skin, 0.082, 0.19, true); armL.position.set(-0.430, 0.175, 0.145);
    var armR = limb(GUI.skin, 0.082, 0.19, true); armR.position.set(0.430, 0.175, 0.145);
    armL.rotation.z = 0.46; armR.rotation.z = -0.46;
    hips.add(armL); hips.add(armR);

    var legL = limb(GUI.skin, 0.100, 0.09, true); legL.position.set(-0.168, -0.175, 0.045);
    var legR = limb(GUI.skin, 0.100, 0.09, true); legR.position.set(0.168, -0.175, 0.045);
    legL.rotation.z = 0.20; legR.rotation.z = -0.20;
    hips.add(legL); hips.add(legR);

    /* 小尾巴：从壳的下缘底下探出来（壳下缘在 y≈-0.16，尾巴要低于它） */
    var tail = new T.Mesh(new T.ConeGeometry(0.048, 0.15, 12), GUI.skin);
    tail.position.set(0, -0.185, -0.13);
    tail.rotation.x = -1.30;
    hips.add(tail);

    player.position.set(world.spawn.x, world.terrainH(world.spawn.x, world.spawn.z), world.spawn.z);
    scene.add(player);

    /* 角色脚下的接触阴影：真实的 shadowMap 已开，这层只用来压住"贴地感" */
    (function blob() {
      var cv = document.createElement('canvas'); cv.width = cv.height = 96;
      var c = cv.getContext('2d');
      var g = c.createRadialGradient(48, 48, 4, 48, 48, 46);
      g.addColorStop(0, 'rgba(0,0,0,.42)');
      g.addColorStop(0.6, 'rgba(0,0,0,.18)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(0, 0, 96, 96);
      var tex = new T.CanvasTexture(cv);
      var m = new T.Mesh(new T.PlaneGeometry(1.5, 1.5),
        new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      m.position.y = 0.02;
      player.add(m);
    })();

    /* ---------- 相机 ---------- */
    var camera = new T.PerspectiveCamera(52, W / Math.max(1, H), 0.1, 400);
    /* 默认机位：出生点在宗庙南侧的广场上，要把整座宗庙（含屋顶）留在画面里。
       pitch 是"仰角的补角"，越大越平视；0.96/13 米时相机太低，画面上半被檐下糊死，
       调成 1.12/18 米才看得到屋顶轮廓与广场全貌。 */
    var cam = { yaw: 0, pitch: 1.12, dist: 18.0, tDist: 18.0 };
    var camTarget = new T.Vector3(player.position.x, player.position.y + 1.45, player.position.z);

    /* 射线 vs AABB（slab 法）：返回进入参数 t，没打中返回 Infinity。
       相机避让全靠它 —— 没有这一步，玩家一贴墙相机就钻进去，画面糊成一片土色。 */
    function rayBoxT(ox, oy, oz, dx, dy, dz, b) {
      var t0 = 0, t1 = Infinity, lo, hi, ta, tb, tmp;
      var mins = [b.x - b.hx, 0, b.z - b.hz];
      var maxs = [b.x + b.hx, b.h || 6.5, b.z + b.hz];
      var o = [ox, oy, oz], d = [dx, dy, dz];
      for (var i = 0; i < 3; i++) {
        if (Math.abs(d[i]) < 1e-6) {
          if (o[i] < mins[i] || o[i] > maxs[i]) { return Infinity; }
        } else {
          ta = (mins[i] - o[i]) / d[i];
          tb = (maxs[i] - o[i]) / d[i];
          if (ta > tb) { tmp = ta; ta = tb; tb = tmp; }
          if (ta > t0) { t0 = ta; }
          if (tb < t1) { t1 = tb; }
          if (t0 > t1) { return Infinity; }
        }
      }
      return t0;
    }
    /* 地形也要挡相机。建筑是 AABB，坡是不能用 AABB 近似的 ——
       角色走到山坡背面时，相机会埋进土里（画面整片土色）。
       沿视线步进采样 12 个点，撞到地面就把相机拉到该点之前。 */
    function camTerrainClear(ox, oy, oz, dx, dy, dz, want) {
      var n = 12;
      for (var i = 1; i <= n; i++) {
        var t = want * i / n;
        var x = ox + dx * t, y = oy + dy * t, z = oz + dz * t;
        if (world.terrainH(x, z) + 0.55 > y) {
          return Math.max(1.8, t - want / n * 1.2);
        }
      }
      return want;
    }
    function camClearDist(ox, oy, oz, dx, dy, dz, want) {
      var best = want;
      var cs = world.colliders;
      for (var i = 0; i < cs.length; i++) {
        if (!cs[i].h) { continue; }           /* 矮物（栅栏、探方）不挡相机 */
        var t = rayBoxT(ox, oy, oz, dx, dy, dz, cs[i]);
        if (t < best) { best = t; }
      }
      /* 目标点就在盒子里（角色贴墙站着）时 t=0，别把相机吸到脸上 */
      best = Math.max(2.2, best - 0.45);
      var tc = camTerrainClear(ox, oy, oz, dx, dy, dz, best);
      return Math.min(best, tc);
    }

    function applyCamera() {
      var sp = Math.sin(cam.pitch), cp = Math.cos(cam.pitch);
      var dx = Math.sin(cam.yaw) * sp, dy = cp, dz = Math.cos(cam.yaw) * sp;
      var use = camClearDist(camTarget.x, camTarget.y, camTarget.z, dx, dy, dz, cam.dist);
      cam.used = use;
      camera.position.set(
        camTarget.x + dx * use,
        camTarget.y + dy * use,
        camTarget.z + dz * use
      );
      /* 别钻到地面下面 */
      var gy = world.terrainH(camera.position.x, camera.position.z) + 1.1;
      if (camera.position.y < gy) { camera.position.y = gy; }
      camera.lookAt(camTarget);
    }
    applyCamera();

    /* ---------- 输入 ---------- */
    var move = { x: 0, y: 0 };     /* 由键盘或虚拟摇杆写入，-1..1 */
    var run = false;
    var keys = {};
    var dragging = false, lastX = 0, lastY = 0, moved = 0;
    var pointers = {};
    var pinch = 0, pinchD = 0;

    function onKey(e, down) {
      var k = e.key;
      if (k === 'w' || k === 'W' || k === 'ArrowUp') { keys.up = down; }
      else if (k === 's' || k === 'S' || k === 'ArrowDown') { keys.down = down; }
      else if (k === 'a' || k === 'A' || k === 'ArrowLeft') { keys.left = down; }
      else if (k === 'd' || k === 'D' || k === 'ArrowRight') { keys.right = down; }
      else if (k === 'Shift') { run = down; }
      else { return; }
      if (e.preventDefault) { e.preventDefault(); }
    }
    var kd = function (e) { onKey(e, true); };
    var ku = function (e) { onKey(e, false); };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);

    var el = renderer.domElement;
    function onDown(e) {
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      if (Object.keys(pointers).length === 2) {
        var k = Object.keys(pointers);
        pinch = Math.hypot(pointers[k[0]].x - pointers[k[1]].x, pointers[k[0]].y - pointers[k[1]].y);
        pinchD = cam.tDist;
        dragging = false;
        return;
      }
      dragging = true; moved = 0;
      lastX = e.clientX; lastY = e.clientY;
      if (el.setPointerCapture) { try { el.setPointerCapture(e.pointerId); } catch (er) {} }
    }
    function onMove(e) {
      if (pointers[e.pointerId]) { pointers[e.pointerId] = { x: e.clientX, y: e.clientY }; }
      var ks = Object.keys(pointers);
      if (ks.length === 2) {
        var a = pointers[ks[0]], b = pointers[ks[1]];
        var d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch > 0) {
          cam.tDist = Math.max(6.5, Math.min(24, pinchD * (pinch / Math.max(1, d))));
        }
        return;
      }
      if (!dragging) {
        /* 悬停：鼠标/手指划过,对应的实体字会亮起来 —— "看得见就知道能点" */
        if (o.onHover) {
          var h = pickAt(e.clientX, e.clientY);
          var it2 = h && h.item ? h.item : (h ? itemOfChar(h.char, h.zone) : null);
          if (it2 !== hoverItem) {
            var prev = hoverItem;
            hoverItem = it2;
            paintItem(prev); paintItem(hoverItem);
            o.onHover(h && h.type ? { type: h.type, char: h.char, zone: h.zone } : null);
          }
          el.style.cursor = it2 ? 'pointer' : '';
        }
        return;
      }
      var dx = e.clientX - lastX, dy = e.clientY - lastY;
      moved += Math.abs(dx) + Math.abs(dy);
      lastX = e.clientX; lastY = e.clientY;
      cam.yaw -= dx * 0.0055;
      cam.pitch = Math.max(0.46, Math.min(1.30, cam.pitch - dy * 0.0035));
    }
    var ray = new T.Raycaster();
    var ndc = new T.Vector2();
    /* 可点的不再只是字：地点石刻、冂门也算。
       凡是 should-pick 的东西都由 world-build 打上 userData.kind。 */
    var PICK_KINDS = { char: 1, zone: 1, portal: 1 };
    var pickables = [];
    var items = world.glyphItems || [];
    function rebuildPickables() {
      pickables = [];
      world.root.traverse(function (obj) {
        if (obj.isMesh && obj.userData && PICK_KINDS[obj.userData.kind]) { pickables.push(obj); }
      });
    }
    rebuildPickables();
    /* 已认 / 悬停：状态必须落到"物件"上，而不是只写在 HUD 里 */
    var learned = {};
    var hoverItem = null;
    function paintItem(it) {
      if (!it || !it.setState) { return; }
      it.setState({ learned: !!learned[it.char], hover: (hoverItem === it) });
    }
    function paintAll() { items.forEach(paintItem); }
    function itemOfChar(ch, zone) {
      var hit = null;
      for (var i = 0; i < items.length; i++) {
        if (items[i].char !== ch || (zone && items[i].zone !== zone)) { continue; }
        hit = items[i];
        /* 同名的"区口石刻"先跳过：真正要学的是广场里那件展品 */
        if (!items[i].marker) { return items[i]; }
      }
      return hit;
    }

    var pkV = new T.Vector3();
    function pickAt(clientX, clientY) {
      var r = el.getBoundingClientRect();
      var px = clientX - r.left, py = clientY - r.top;
      ndc.x = (px / r.width) * 2 - 1;
      ndc.y = -(py / r.height) * 2 + 1;
      ray.setFromCamera(ndc, camera);
      var hits = ray.intersectObjects(pickables, false);
      if (hits.length) {
        var u = hits[0].object.userData;
        return { type: u.kind, char: u.char, zone: u.zone, piece: u.piece,
          item: u.item || null };
      }
      /* 射线没打中（碑面只有 0.5×0.8 米，手指比它粗得多）时，
         退到屏幕空间：找离点击点最近、且在 26 米内的那块碑。
         先做投影再算像素距离，比"放大碰撞盒"准，也不会串到远处的字。 */
      var best = null, bestD = 46;      /* 46 CSS px 的容差，约等于一根手指 */
      for (var i = 0; i < pickables.length; i++) {
        var p = pickables[i];
        p.getWorldPosition(pkV);
        if (Math.hypot(pkV.x - st.x, pkV.z - st.z) > 26) { continue; }
        pkV.project(camera);
        if (pkV.z > 1 || pkV.z < -1) { continue; }
        var sx = (pkV.x * 0.5 + 0.5) * r.width;
        var sy = (-pkV.y * 0.5 + 0.5) * r.height;
        var d = Math.hypot(sx - px, sy - py);
        if (d < bestD) { bestD = d; best = p; }
      }
      if (!best) { return null; }
      var ud = best.userData;
      return { type: ud.kind || 'char', char: ud.char, zone: ud.zone,
        piece: ud.piece, item: ud.item || null };
    }

    function onUp(e) {
      var wasMoved = moved;
      delete pointers[e.pointerId];
      if (Object.keys(pointers).length < 2) { pinch = 0; }
      dragging = false;
      if (wasMoved >= 6) { return; }
      /* 轻点：优先认"点到了哪块字碑"，没点中才算空点（交给 HUD） */
      var hit = pickAt(e.clientX, e.clientY);
      if (hit && o.onPick) { o.onPick(hit); return; }
      if (o.onTap) { o.onTap(); }
    }
    function onWheel(e) {
      e.preventDefault();
      cam.tDist = Math.max(6.5, Math.min(24, cam.tDist + e.deltaY * 0.012));
    }
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', function (e) { delete pointers[e.pointerId]; dragging = false; });
    el.addEventListener('wheel', onWheel, { passive: false });

    /* ---------- 碰撞 ---------- */
    var RADIUS = 0.42;
    var gateOpen = {};                 /* zoneId -> true 表示这一关的门已经开了 */
    (world.gates || []).forEach(function (g) { gateOpen[g.zone] = !!g.open; });
    function blocked(x, z) {
      var cs = world.colliders;
      for (var i = 0; i < cs.length; i++) {
        var c = cs[i];
        /* 门开了就把它的封牌从阻挡里拿掉 —— 不然开了 visuals 却过不去 */
        if (c.gate && gateOpen[c.gate]) { continue; }
        if (Math.abs(x - c.x) < c.hx + RADIUS && Math.abs(z - c.z) < c.hz + RADIUS) { return true; }
      }
      return false;
    }
    function clampWorld(p) {
      var r = Math.hypot(p.x, p.z);
      var LIM = 61;
      if (r > LIM) { p.x *= LIM / r; p.z *= LIM / r; }
    }

    /* ---------- 状态 ---------- */
    var st = {
      x: player.position.x, z: player.position.z,
      vx: 0, vz: 0, speed: 0,
      facing: 0, phase: 0,
      near: null, zone: '广场'
    };

    function nearestSpot() {
      var best = null, bd = 1e9;
      world.spots.forEach(function (s) {
        var d = Math.hypot(s.x - st.x, s.z - st.z);
        if (d < s.r && d < bd) { bd = d; best = s; }
      });
      return best;
    }
    function zoneAt() {
      var best = '广场', bd = 1e9;
      world.zones.forEach(function (z) {
        var d = Math.hypot(z.x - st.x, z.z - st.z);
        if (d < 26 && d < bd) { bd = d; best = z.name; }
      });
      if (Math.hypot(st.x, st.z) < 17) { return '宗庙广场'; }
      return best;
    }

    /* ---------- 观察焦点（选中实物后镜头推近） ---------- */
    var focus = null;
    var portalRing = scene.getObjectByName('boss-portal-ring');
    var portalDisc = scene.getObjectByName('boss-portal-disc');
    function releaseFocus() {
      focus = null;
      cam.tDist = Math.max(8, Math.min(24, cam.tDist));
    }

    /* ---------- 主循环 ---------- */
    var clock = new T.Clock();
    var alive = true, raf = 0, frames = 0, tAll = 0;

    function tick() {
      if (!alive) { return; }
      raf = requestAnimationFrame(tick);
      var dt = Math.min(0.05, clock.getDelta());
      tAll += dt;

      /* 输入合成：键盘优先，其次摇杆 */
      var ix = 0, iy = 0;
      if (keys.left) { ix -= 1; }
      if (keys.right) { ix += 1; }
      if (keys.up) { iy -= 1; }
      if (keys.down) { iy += 1; }
      if (!ix && !iy) { ix = move.x; iy = move.y; }

      var mag = Math.hypot(ix, iy);
      if (mag > 1) { ix /= mag; iy /= mag; mag = 1; }
      /* 一动就松开观察镜头：任何自动机位都不能绑架操作 */
      if (mag > 0.06 && focus) { releaseFocus(); }

      /* 相机朝向决定"前"：向前推 = 远离相机 */
      var cy = cam.yaw;
      var fx = -Math.sin(cy), fz = -Math.cos(cy);
      var rx = -Math.cos(cy), rz = Math.sin(cy);
      var wantX = (fx * -iy + rx * ix);
      var wantZ = (fz * -iy + rz * ix);

      var maxSpeed = run ? 6.2 : 3.3;
      var target = mag > 0.05 ? maxSpeed : 0;
      st.vx += (wantX * target - st.vx) * Math.min(1, dt * 12);
      st.vz += (wantZ * target - st.vz) * Math.min(1, dt * 12);
      st.speed = Math.hypot(st.vx, st.vz);

      var nx = st.x + st.vx * dt;
      var nz = st.z + st.vz * dt;
      /* 分轴判定：撞墙时还能顺着墙滑，不会被卡死 */
      if (!blocked(nx, st.z)) { st.x = nx; } else { st.vx *= 0.2; }
      if (!blocked(st.x, nz)) { st.z = nz; } else { st.vz *= 0.2; }
      clampWorld(st);

      var gy = world.terrainH(st.x, st.z);
      player.position.set(st.x, gy, st.z);

      /* 朝向：只在真的在走的时候转，站着不会原地打转 */
      if (st.speed > 0.35) {
        var want = Math.atan2(st.vx, st.vz);
        var diff = ((want - st.facing + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        st.facing += diff * Math.min(1, dt * 9);
      }
      player.rotation.y = st.facing;

      /* 步态：龟宝是小短腿，走起来是"左右摇"而不是"上下颠"。
         摇（roll）比摆腿更决定它的憨态，所以 roll 的系数给得比常规角色大。 */
      var amp = Math.min(1, st.speed / 4.4);
      st.phase += dt * (5.2 + st.speed * 1.5);
      var sw = Math.sin(st.phase) * amp;
      legL.rotation.x = sw * 0.52;
      legR.rotation.x = -sw * 0.52;
      armL.rotation.x = -sw * 0.34;
      armR.rotation.x = sw * 0.34;
      /* 一步一沉 + 左右摇 */
      hips.position.y = HIP_Y + Math.abs(Math.cos(st.phase)) * 0.030 * amp - 0.010 * amp;
      hips.rotation.z = sw * 0.085;
      hips.rotation.x = -0.04 * amp;
      /* 头晚半拍跟着摇，看着才有重量 */
      headG.rotation.z = -sw * 0.05;
      headG.rotation.x = Math.sin(st.phase * 2) * 0.03 * amp;
      tail.rotation.z = sw * 0.25;
      /* 布巾飘带跟着甩，是"在动"的第二个证据 */
      /* 飘带是贴着壳背的一根管子，不能整条转（一转就飞出甲面），
         只让它左右摆一点点、末端轻轻抬，像被走路带起来的风。 */
      ribbon.rotation.z = Math.sin(st.phase * 0.9) * 0.11 * amp;
      ribbon.rotation.x = Math.sin(st.phase * 0.7 + 0.6) * 0.045 * amp;

      /* 相机跟随：默认跟着龟宝；选中某件实物时切成"观察焦点" */
      if (focus) {
        focus.t += dt;
        var kd2 = Math.min(1, dt * 3.4);
        camTarget.x += (focus.x - camTarget.x) * kd2;
        camTarget.y += (focus.y - camTarget.y) * kd2;
        camTarget.z += (focus.z - camTarget.z) * kd2;
        cam.dist += (focus.dist - cam.dist) * kd2;
        cam.pitch += (focus.pitch - cam.pitch) * kd2;
        var dyaw = ((focus.yaw - cam.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        cam.yaw += dyaw * Math.min(1, dt * 3.0);
      } else {
        camTarget.x += (st.x - camTarget.x) * Math.min(1, dt * 8);
        camTarget.z += (st.z - camTarget.z) * Math.min(1, dt * 8);
        camTarget.y += ((gy + 0.74) - camTarget.y) * Math.min(1, dt * 6);
        cam.dist += (cam.tDist - cam.dist) * Math.min(1, dt * 7);
      }
      applyCamera();

      /* 构件归位：拼字时构件是"在空间里飞过去"的，不是切一张图 */
      for (var ip = 0; ip < items.length; ip++) {
        if (items[ip].pieces && items[ip].pieces.length) { items[ip].updatePieces(dt, false); }
      }
      /* 冂门：转盘慢慢转、浮 Up and down，一眼就知道这是个门 */
      if (portalRing) {
        portalRing.rotation.z += dt * 0.55;
        portalRing.rotation.x = Math.sin(tAll * 0.7) * 0.16;
        if (portalDisc) {
          portalDisc.rotation.z -= dt * 0.30;
          portalDisc.material.opacity = 0.18 + Math.sin(tAll * 1.6) * 0.08;
        }
      }
      /* 关卡门阙：开了就把封牌升进门楣里，没开就沉在门洞上 */
      for (var gi2 = 0; gi2 < (world.gates || []).length; gi2++) {
        var g2 = world.gates[gi2];
        if (!g2.seal) { continue; }
        var want2 = gateOpen[g2.zone] ? g2.baseY + 2.55 : g2.baseY;
        g2.seal.position.y += (want2 - g2.seal.position.y) * Math.min(1, dt * 2.2);
      }

      /* 太阳跟着角色走：阴影贴图只覆盖身边 60×60，1024 的图才够清楚 */
      sun.position.set(st.x + SUN_DIR.x * 60, SUN_DIR.y * 60, st.z + SUN_DIR.z * 60);
      sun.target.position.set(st.x, 0, st.z);
      sun.target.updateMatrixWorld();

      /* 火光呼吸 */
      for (var i = 0; i < fireLights.length; i++) {
        var f = fireLights[i];
        var k = 1 + Math.sin(tAll * 7.3 + f.seed) * 0.12 + Math.sin(tAll * 17.1 + f.seed) * 0.05;
        f.light.intensity = f.base * k;
        if (f.flame) {
          f.flame.scale.set(1, 0.9 + k * 0.18, 1);
          f.flame.scale.x = 1 + Math.sin(tAll * 9.1 + f.seed) * 0.08;
        }
      }

      /* 交互点：每帧算最近的一个，变化时通知 HUD */
      var n = nearestSpot();
      var nid = n ? n.id : null;
      if (nid !== (st.near ? st.near.id : null)) {
        st.near = n;
        if (o.onNear) { o.onNear(n); }
      }
      var zz = zoneAt();
      if (zz !== st.zone) {
        st.zone = zz;
        if (o.onZone) { o.onZone(zz); }
      }

      frames++;
      renderer.render(scene, camera);
    }

    var ro = null;
    function resize() {
      var w = host.clientWidth || window.innerWidth;
      var h = host.clientHeight || window.innerHeight;
      if (!w || !h) { return; }
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      /* 竖屏不要靠"放宽 fov"来凑视野：fov 一大，透视就拉成鱼眼，角色还更小。
         正确做法是收一点 fov、把机位抬高拉远。 */
      camera.fov = camera.aspect >= 1.2 ? 52 : 56;
      camera.updateProjectionMatrix();
      if (camera.aspect < 0.9 && !cam.narrowInit) {
        cam.narrowInit = true;
        cam.pitch = 0.94; cam.tDist = 16.0; cam.dist = 16.0;
        applyCamera();
      }
    }
    if (window.ResizeObserver) { ro = new ResizeObserver(resize); ro.observe(host); }
    else { window.addEventListener('resize', resize); }
    resize();
    tick();

    /* ---------- 对外 API ---------- */
    function dispose() {
      alive = false;
      if (raf) { cancelAnimationFrame(raf); }
      if (ro) { ro.disconnect(); }
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      window.removeEventListener('resize', resize);
      scene.traverse(function (obj) {
        if (obj.geometry) { obj.geometry.dispose(); }
        if (obj.material) {
          var ms = Array.isArray(obj.material) ? obj.material : [obj.material];
          ms.forEach(function (m) {
            if (m.map) { m.map.dispose(); }
            m.dispose();
          });
        }
      });
      renderer.dispose();
      if (renderer.domElement.parentNode) { renderer.domElement.parentNode.removeChild(renderer.domElement); }
    }

    cb(null, {
      ready: true,
      state: function () {
        return {
          x: +st.x.toFixed(2), z: +st.z.toFixed(2),
          speed: +st.speed.toFixed(2), zone: st.zone,
          near: st.near ? { id: st.near.id, kind: st.near.kind, name: st.near.name } : null,
          frames: frames
        };
      },
      setMove: function (x, y) { move.x = x; move.y = y; },
      setRun: function (v) { run = !!v; },
      yaw: function (d) { cam.yaw -= d; },
      zoom: function (d) { cam.tDist = Math.max(6.5, Math.min(60, cam.tDist + d)); },
      look: function (pitch, dist, yaw) {
        if (pitch != null) { cam.pitch = Math.max(0.12, Math.min(1.30, pitch)); }
        if (dist != null) { cam.tDist = Math.max(5, Math.min(90, dist)); cam.dist = cam.tDist; }
        if (yaw != null) { cam.yaw = yaw; }
        applyCamera();
      },
      teleport: function (x, z) {
        st.x = x; st.z = z; st.vx = st.vz = 0;
        player.position.set(x, world.terrainH(x, z), z);
        camTarget.set(x, world.terrainH(x, z) + 0.74, z);
      },
      /* 已认的字：对应的实物亮起来（灯芯定居在物件上，不是写在 HUD 里） */
      setKnown: function (known) {
        learned = known || {};
        paintAll();
        var n = 0;
        for (var i = 0; i < items.length; i++) { if (learned[items[i].char]) { n++; } }
        return n;
      },
      /* 关卡门：一开，封牌升起、阻挡消失 */
      setGate: function (zoneId, open) {
        gateOpen[zoneId] = !!open;
        return !!gateOpen[zoneId];
      },
      gateState: function () {
        var out = {};
        (world.gates || []).forEach(function (g) { out[g.zone] = !!gateOpen[g.zone]; });
        return out;
      },
      /* 观察某件实物：镜头平滑推近到它的正面。
         距离按物件大小算，字本身要占到画面的一半才看得清笔画。 */
      focusItem: function (ch, zone) {
        var it = itemOfChar(ch, zone);
        if (!it) { return false; }
        var v = new T.Vector3();
        it.group.getWorldPosition(v);
        var dist = 2.4 + (it.collider ? it.collider.hx : 0.5) * 1.7;
        /* 站到字的正面去：物件的 yaw 就是"指向场地中心"的那一边 */
        focus = { x: v.x, y: v.y + it.mountY, z: v.z,
          yaw: Math.atan2(v.x, v.z) + Math.PI, dist: dist, pitch: 1.02, t: 0 };
        return true;
      },
      releaseFocus: releaseFocus,
      /* 构字：把一个构件送回原位。返回 true 表示整字已经拼成 */
      assemblePiece: function (ch, zone, i) {
        var it = itemOfChar(ch, zone);
        if (!it || !it.setPieceHome) { return false; }
        it.setPieceHome(i, true);
        return it.solved();
      },
      shakePiece: function (ch, zone, i) {
        var it = itemOfChar(ch, zone);
        if (it && it.shakePiece) { it.shakePiece(i); }
      },
      scatterPieces: function (ch, zone) {
        var it = itemOfChar(ch, zone);
        if (!it) { return; }
        for (var i = 0; i < it.pieces.length; i++) { it.setPieceHome(i, false); }
      },
      itemInfo: function (ch, zone) {
        var it = itemOfChar(ch, zone);
        if (!it) { return null; }
        var v = new T.Vector3(); it.group.getWorldPosition(v);
        return { char: it.char, zone: it.zone, style: it.style,
          pieces: it.pieces.length, solved: it.solved(),
          pos: [+v.x.toFixed(2), +v.z.toFixed(2)] };
      },
      sceneInfo: function () {
        var n = 0, tri = 0;
        scene.traverse(function (o) {
          if (!o.isMesh) { return; }
          n++;
          if (o.geometry && o.geometry.attributes && o.geometry.attributes.position) {
            tri += o.geometry.attributes.position.count / 3;
          }
        });
        return { meshes: n, tris: Math.round(tri), colliders: world.colliders.length,
          spots: world.spots.length, items: items.length,
          pickables: pickables.length, gates: (world.gates || []).length,
          zones: world.zones.map(function (z) { return z.id; }) };
      },
      /* 内部对象出口：只在控制台/自动化测试里用，别在业务里调。
         有它才能在页面里直接摸 scene 树、量包围盒、改材质做二分排查。 */
      _raw: function () {
        return { scene: scene, camera: camera, renderer: renderer, three: T, world: world, el: el };
      },
      /* 自查用：某块字碑此刻投影到屏幕上的像素位置。
         用来验证"点屏幕 → 命中字碑"这条链路，也方便做引导箭头。 */
      screenOf: function (ch) {
        var it = itemOfChar(ch);
        if (!it) { return null; }
        var r = el.getBoundingClientRect();
        var v = new T.Vector3();
        it.group.getWorldPosition(v);
        v.y += it.mountY;
        v.project(camera);
        return { char: ch, zone: it.zone, style: it.style,
                 x: Math.round((v.x * 0.5 + 0.5) * r.width),
                 y: Math.round((-v.y * 0.5 + 0.5) * r.height),
                 behind: v.z > 1 };
      },
      /* 自查用：角色到底站在哪、相机在哪、地形多高 */
      debug: function () {
        var hp = new T.Vector3();
        head.getWorldPosition(hp);
        var fp = new T.Vector3();
        player.getWorldPosition(fp);
        return {
          player: [+fp.x.toFixed(2), +fp.y.toFixed(2), +fp.z.toFixed(2)],
          head: [+hp.x.toFixed(2), +hp.y.toFixed(2), +hp.z.toFixed(2)],
          cam: [+camera.position.x.toFixed(2), +camera.position.y.toFixed(2), +camera.position.z.toFixed(2)],
          dist: +cam.dist.toFixed(2), pitch: +cam.pitch.toFixed(2), yaw: +cam.yaw.toFixed(2),
          ground: +world.terrainH(st.x, st.z).toFixed(2),
          stuck: blocked(st.x, st.z),
          fov: +camera.fov.toFixed(1), aspect: +camera.aspect.toFixed(2)
        };
      },
      dispose: dispose
    });
  }

  App.world3d = { create: create };
})(window.App);
