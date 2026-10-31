/* ============================================================
   甲骨奇谭 · 通用 3D 舞台（第二关「浮空骨片」与第三关「三阶段 Boss」共用）
   ------------------------------------------------------------
   为什么单独抽一层：
     第二关要「骨片空间 → 推进 → 子场景」的相机转场，
     第三关要「Boss 台前固定机位 + 可拖拽环绕的观察物」。
     两关需要的是同一套东西：renderer、雾、灯光、射线拾取、相机 tween。
     world3d.js 那套是「第三人称走地图」的封闭控制器，塞不进这两个形态，
     所以这里只抽共用的底座，角色与关卡逻辑各自写在 mode 里。

   对外：
     App.stage3d.load(cb)             载 three（45 秒 + 2 次重试，与 world3d 同策略）
     App.stage3d.create(host, opt)    建舞台 → stage
     stage:
       T / renderer / scene / camera / root
       t                       累计秒
       onTick(fn)              每帧回调 fn(dt, t)
       onPick(fn)              点击拾取（已过滤拖拽），fn({obj, point, ndc})
       raycast(ndc)            手动射线
       flyTo(o, done)          相机平滑过渡 {pos, look, dur, ease}
       orbit(center, o)        拖拽环绕 + 滚轮缩放（观察单个物件）
       worldSize()             画布像素尺寸
       resize() / dispose()
   ============================================================ */
(function (App) {
  'use strict';

  var THREE_SRC = 'vendor/three.min.js';
  var LOAD_TIMEOUT = 45000, LOAD_TRIES = 2;
  var loading = false, queue = [];

  function loadThree(done, tries) {
    if (window.THREE) { done(null); return; }
    if (loading) { queue.push(done); return; }
    loading = true;
    tries = tries || 0;
    var s = document.createElement('script');
    var finished = false;
    var timer = setTimeout(function () {
      if (finished) { return; }
      finished = true;
      if (tries < LOAD_TRIES) { retry(); } else { fail(new Error('3D 引擎加载超时')); }
    }, LOAD_TIMEOUT);
    function flush(err) {
      loading = false;
      done(err);
      var q = queue; queue = [];
      for (var i = 0; i < q.length; i++) { q[i](err); }
    }
    function fail(e) { flush(e); }
    function retry() {
      clearTimeout(timer);
      s.onload = s.onerror = null;
      setTimeout(function () { loading = false; loadThree(done, tries + 1); }, 600);
    }
    s.src = THREE_SRC + (tries ? '?retry=' + Date.now() : '');
    s.async = true;
    s.onload = function () {
      if (finished) { return; }
      finished = true; clearTimeout(timer);
      if (window.THREE) { flush(null); } else { fail(new Error('THREE 未就绪')); }
    };
    s.onerror = function () {
      if (finished) { return; }
      finished = true;
      if (tries < LOAD_TRIES) { retry(); } else { fail(new Error('3D 引擎加载失败')); }
    };
    document.head.appendChild(s);
  }

  /* ---------- 缓动 ---------- */
  function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  var EASE = { linear: function (t) { return t; }, inout: easeInOut, out: easeOut };

  /* ---------- 程序化贴图工具（两关共用） ---------- */
  function canvas(w, h) {
    var cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    return cv;
  }
  function tex(cv, rep) {
    var T = window.THREE;
    var t = new T.CanvasTexture(cv);
    if (T.SRGBColorSpace) { t.colorSpace = T.SRGBColorSpace; }
    t.wrapS = t.wrapT = T.RepeatWrapping;
    if (rep) { t.repeat.set(rep, rep); }
    t.anisotropy = 4;
    return t;
  }
  function rnd(seed) {
    var s = seed || 1;
    return function () {
      s = (s * 1103515245 + 12345) % 2147483648;
      return s / 2147483648;
    };
  }

  /* 骨面：米白骨色 + 斑驳 + 细裂纹 + 年轮状沉积纹。
     直接给纯色的话，骨片在暗背景里只是一块亮色多边形，没有"骨"的质感。 */
  function boneTex(seed, opt) {
    var o = opt || {};
    var S = 256, cv = canvas(S, S), c = cv.getContext('2d'), R = rnd(seed || 7);
    var g = c.createLinearGradient(0, 0, S, S);
    g.addColorStop(0, o.hi || '#efe2c6');
    g.addColorStop(0.55, o.mid || '#e2d0ad');
    g.addColorStop(1, o.lo || '#c9b489');
    c.fillStyle = g; c.fillRect(0, 0, S, S);
    /* 斑驳 */
    for (var i = 0; i < 260; i++) {
      var x = R() * S, y = R() * S, r = 2 + R() * 14;
      c.fillStyle = 'rgba(' + (150 + R() * 40 | 0) + ',' + (128 + R() * 40 | 0) + ',' +
        (96 + R() * 34 | 0) + ',' + (0.03 + R() * 0.06).toFixed(3) + ')';
      c.beginPath(); c.arc(x, y, r, 0, 6.2832); c.fill();
    }
    /* 细裂纹：折线，末端变淡 */
    for (var k = 0; k < 9; k++) {
      var px = R() * S, py = R() * S;
      c.strokeStyle = 'rgba(120,100,74,' + (0.10 + R() * 0.12).toFixed(2) + ')';
      c.lineWidth = 0.8 + R() * 1.1;
      c.beginPath(); c.moveTo(px, py);
      var segs = 3 + (R() * 5 | 0);
      for (var j = 0; j < segs; j++) {
        px += (R() - 0.5) * 46; py += (R() - 0.5) * 46;
        c.lineTo(px, py);
      }
      c.stroke();
    }
    /* 沉积纹：几道很淡的弧 */
    for (var a = 0; a < 5; a++) {
      c.strokeStyle = 'rgba(178,156,116,.16)';
      c.lineWidth = 1.4;
      c.beginPath();
      c.arc(R() * S, R() * S, 24 + R() * 60, R() * 6.28, R() * 6.28 + 1.4);
      c.stroke();
    }
    return tex(cv);
  }

  /* ---------- 骨片几何 ----------
     一块不规则骨版：椭圆底形 + 边缘起伏 + 中间厚边缘薄（倒角）。
     用 Shape + ExtrudeGeometry 而不是 BoxGeometry：
     Box 的直角边在浮动光源下会露馅成"一块砖"。 */
  function bonePlateGeo(T, w, h, depth, seed) {
    var R = rnd(seed || 3);
    var sh = new T.Shape();
    var N = 22, pts = [];
    for (var i = 0; i < N; i++) {
      var a = i / N * Math.PI * 2;
      var wob = 1 + (R() - 0.5) * 0.14;
      pts.push([Math.cos(a) * w * 0.5 * wob, Math.sin(a) * h * 0.5 * wob]);
    }
    sh.moveTo(pts[0][0], pts[0][1]);
    for (var j = 1; j < N; j++) { sh.lineTo(pts[j][0], pts[j][1]); }
    sh.closePath();
    var g = new T.ExtrudeGeometry(sh, {
      depth: depth, bevelEnabled: true,
      bevelThickness: depth * 0.42, bevelSize: Math.min(w, h) * 0.035,
      bevelSegments: 2, curveSegments: 4, steps: 1
    });
    g.center();
    return g;
  }

  /* ---------- 龟宝助手：2D 立牌 ----------
     原来是 App.guibao.build 现搭的一只立体龟：几何能搭出来，但暗场里没有
     材质细节，远看就是一团白的，眼睛、围巾、背包、胸前的骨片吊坠全糊成一片，
     跟首页/第一关那张立绘（assets/guibao-front.png）完全不像同一只龟。

     改成直接贴那张立绘，做成"立牌"：
       · 立绘自带明暗、五官、配色，暗场里反而比立体模型清楚；
       · 全站龟宝从此是同一个形象，不会出现"首页一只、关卡里另一只"；
       · 面向相机只绕 Y 轴（standing billboard）——不是 Sprite 那种全轴朝向。
         相机从上往下俯拍时，Sprite 会跟着往后仰，看起来像一张飘在空中的贴纸；
         只绕 Y 轴，它就一直"站"在地上。

     返回结构与原来一致：{ root, update, setMode, clearMode, metrics }。
     调用方（bone-float / boss3d）只用到 root 的 position/rotation/userData 和 update()。 */

  var GB_ART = 'assets/guibao-front.png';
  var GB_H = 0.92;                 // 世界高度，对齐原来立体龟的 0.909

  /* 立绘 555×626，但真正的内容只到第 600 行：最底 26px 是原图自带的一圈
     白色细碎笔触（像踩在一团白雾上）。在白底页面上看不见，放到深色石台上
     就是一圈白烟。裁掉这 26px，立牌底边就是脚趾，不用再猜该往下埋多少。 */
  var GB_CROP = 600 / 626;
  var GB_ASPECT = 600 / 555;       // 高 / 宽（裁剪后）

  var _gbTex = null;
  var _gbShadowTex = null;

  /* 立绘贴图：全局只加载一次，多个龟宝共用 */
  function guibaoArtTex(onReady, onFail) {
    if (_gbTex) {
      if (_gbTex.image) { onReady(_gbTex); } else { _gbTex.userData.waiting.push(onReady); }
      if (onFail) { _gbTex.userData.fails.push(onFail); }
      return _gbTex;
    }
    var T = window.THREE;
    var t = new T.TextureLoader().load(GB_ART, function (r) {
      if (T.SRGBColorSpace) { r.colorSpace = T.SRGBColorSpace; }
      r.needsUpdate = true;
      r.userData.waiting.forEach(function (fn) { try { fn(r); } catch (e) {} });
      r.userData.waiting.length = 0;
    }, undefined, function () {
      if (_gbTex && _gbTex.userData) {
        _gbTex.userData.fails.forEach(function (fn) { try { fn(); } catch (e) {} });
      }
    });
    t.userData = { waiting: [onReady], fails: onFail ? [onFail] : [] };
    t.wrapS = t.wrapT = T.ClampToEdgeWrapping;
    t.anisotropy = 4;
    _gbTex = t;
    return t;
  }

  /* 把立绘裁成"只含本体"的一张牌面贴图 */
  function guibaoCardTex(T, raw) {
    var img = raw.image;
    if (!img || !img.width) { return raw; }
    var W = img.width;
    var Hc = Math.round(img.height * GB_CROP);
    var cv = canvas(W, Hc), c = cv.getContext('2d');
    /* 源矩形只取顶部 Hc 行，目标铺满 —— 上下等比，不拉伸 */
    c.drawImage(img, 0, 0, W, Hc, 0, 0, W, Hc);
    var t = new T.CanvasTexture(cv);
    if (T.SRGBColorSpace) { t.colorSpace = T.SRGBColorSpace; }
    t.wrapS = t.wrapT = T.ClampToEdgeWrapping;
    t.anisotropy = 4;
    t.needsUpdate = true;
    return t;
  }

  /* 接触阴影：脚下一枚椭圆软影。没有它，2D 立牌在半空里会浮起来 */
  function guibaoShadowTex() {
    if (_gbShadowTex) { return _gbShadowTex; }
    var S = 96, cv = canvas(S, S), c = cv.getContext('2d');
    var g = c.createRadialGradient(S / 2, S / 2, 1, S / 2, S / 2, S / 2);
    g.addColorStop(0.00, 'rgba(0,0,0,0.62)');
    g.addColorStop(0.46, 'rgba(0,0,0,0.30)');
    g.addColorStop(0.78, 'rgba(0,0,0,0.08)');
    g.addColorStop(1.00, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, S, S);
    _gbShadowTex = tex(cv, 1);
    _gbShadowTex.wrapS = _gbShadowTex.wrapT = window.THREE.ClampToEdgeWrapping;
    return _gbShadowTex;
  }

  function makeGuibao(T, opt) {
    var o = opt || {};
    var root = new T.Group();
    root.name = 'guibao2d';

    var H = o.height || GB_H * (o.scale || 1);
    var W = H / GB_ASPECT;

    /* 立牌本体。锚点放在底边中心：position 就是脚踩的那一点，
       调用方按立体龟的习惯摆位置即可。
       贴图已裁到脚趾，底边即脚底，不再额外偏移。 */
    var geo = new T.PlaneGeometry(W, H);
    geo.translate(0, H / 2, 0);

    var mat = new T.MeshBasicMaterial({
      /* 立绘自带明暗，用 Basic 不受场景灯光染色，颜色才准。
         乘色只压一档：压多了（0xcfc9dd 那档）绿龟会变成灰龟，
         不压的话在暗场里像贴了一张发光的纸。两关差异靠 opt.tint 微调。 */
      color: o.tint == null ? 0xf2eef8 : o.tint,
      map: null,
      transparent: true,
      alphaTest: 0.03,
      depthWrite: true,
      side: T.DoubleSide,
      toneMapped: false
    });
    var card = new T.Mesh(geo, mat);
    card.visible = false;            // 贴图到之前不显示，避免一帧白方块
    card.renderOrder = 3;
    root.add(card);

    /* 每帧渲染前把立牌转向相机，只绕 Y 轴。
       相机位置先转到父级局部空间，父级自己的 Y 旋转就自动被抵消了。 */
    var _inv = new T.Matrix4();
    var _camL = new T.Vector3();
    card.onBeforeRender = function (renderer, scene, camera) {
      if (!card.parent) { return; }
      _inv.copy(card.parent.matrixWorld).invert();
      _camL.copy(camera.position).applyMatrix4(_inv);
      card.rotation.y = Math.atan2(_camL.x - card.position.x, _camL.z - card.position.z);
    };

    /* 脚下软影：跟着立牌一起转没关系，是圆的 */
    var shGeo = new T.CircleGeometry(W * 0.46, 28);
    var shMat = new T.MeshBasicMaterial({
      map: guibaoShadowTex(), transparent: true, opacity: 0.85,
      depthWrite: false, side: T.DoubleSide, toneMapped: false
    });
    var shadow = new T.Mesh(shGeo, shMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.006;
    shadow.scale.set(1, 0.42, 1);
    shadow.renderOrder = 2;
    root.add(shadow);

    /* 贴图到了就显形；失败则退回原来的立体龟，绝不让龟宝凭空消失 */
    var _fellBack = false;
    guibaoArtTex(function (t) {
      if (_fellBack) { return; }
      mat.map = guibaoCardTex(T, t);
      mat.needsUpdate = true;
      card.visible = true;
    }, function () {
      if (_fellBack) { return; }
      _fellBack = true;
      card.visible = false;
      shadow.visible = false;
      if (App.guibao && App.guibao.build) {
        try {
          var g = App.guibao.build(T, {});
          if (g && g.root) {
            g.root.scale.setScalar(o.scale || 1);
            root.add(g.root);
            root.userData.fallback3d = g;
          }
        } catch (e) {}
      }
    });

    /* ---- 动作 ----
       2D 立牌做不了骨骼动画，用整体变换表达情绪，够用且不假。
       update 只动 card，绝不动 root.position.y —— boss3d 的胜利动画
       自己掌控 root.position.y 做跳跃，碰了就打架。 */
    var A = { t: 0, mood: null, moodT: 0, bobP: Math.random() * 6.28 };

    function update(dt, st) {
      dt = Math.min(dt || 0, 0.06);
      A.t += dt;
      var speed = st && st.speed != null ? st.speed : 0;

      /* 呼吸：轻微起伏 + 极小幅度的横向晃动。幅度小到只是"活着" */
      var bob = Math.sin(A.t * 1.55 + A.bobP) * 0.010;
      card.position.y = bob;
      var away = 1 + Math.sin(A.t * 1.55 + A.bobP) * 0.006 + speed * 0.010;
      card.scale.set(1 - (away - 1) * 0.5, away, 1);

      /* 走起来的上下颠 + 前倾 */
      if (speed > 0.02) {
        card.position.y += Math.abs(Math.sin(A.t * 7.2)) * 0.030 * speed;
        card.rotation.z = Math.sin(A.t * 7.2) * 0.022 * speed;
      } else {
        card.rotation.z += (0 - card.rotation.z) * Math.min(1, dt * 8);
      }

      if (A.mood) {
        A.moodT += dt;
        if (A.mood === 'cheer') {
          var k = A.moodT / 0.62;
          if (k >= 1) { clearMode(); }
          else {
            var hop = Math.sin(k * Math.PI) * 0.20;
            card.position.y += hop;
            card.rotation.z = Math.sin(k * Math.PI * 2) * 0.10;
          }
        } else if (A.mood === 'think') {
          card.rotation.z = -0.045 + Math.sin(A.moodT * 1.2) * 0.012;
        } else if (A.mood === 'talk') {
          card.scale.y *= 1 + Math.sin(A.moodT * 9.0) * 0.008;
        }
      }
      return A;
    }

    function setMode(m) { A.mood = m || null; A.moodT = 0; if (m === 'cheer') { A.moodT = 0; } }
    function clearMode() { A.mood = null; A.moodT = 0; card.rotation.z = 0; }

    return {
      root: root,
      card: card,
      shadow: shadow,
      is2D: true,
      update: update,
      setMode: setMode,
      clearMode: clearMode,
      /* 保留同名接口：老代码若读 metrics，给的是立牌的世界尺寸 */
      metrics: function () {
        return { minY: 0, maxY: H, height: H, width: W, depth: 0, is2D: true };
      }
    };
  }

  function create(host, opt, cb) {
    var o = opt || {};
    loadThree(function (err) {
      if (err) { cb(err); return; }
      try { cb(null, build(host, o)); } catch (e) { cb(e); }
    });
  }

  function build(host, o) {
    var T = window.THREE;
    var W = host.clientWidth || window.innerWidth;
    var H = host.clientHeight || window.innerHeight;

    var renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(W, H, false);
    renderer.shadowMap.enabled = o.shadow !== false;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    if (T.SRGBColorSpace) { renderer.outputColorSpace = T.SRGBColorSpace; }
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = o.exposure == null ? 1.0 : o.exposure;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.touchAction = 'none';
    host.appendChild(renderer.domElement);

    var scene = new T.Scene();
    if (o.fog) { scene.fog = new T.FogExp2(o.fog.color, o.fog.density); }
    if (o.bg != null) { scene.background = new T.Color(o.bg); }

    var camera = new T.PerspectiveCamera(o.fov || 46, W / H, 0.1, 600);
    var cam0 = o.camera || { pos: [0, 3, 12], look: [0, 1, 0] };
    camera.position.set(cam0.pos[0], cam0.pos[1], cam0.pos[2]);
    var lookAt = new T.Vector3(cam0.look[0], cam0.look[1], cam0.look[2]);
    camera.lookAt(lookAt);

    /* ---------- 灯光：与王邑世界同一套配比（暖主光 + 冷天光） ---------- */
    var hemi = new T.HemisphereLight(o.hemiSky || 0xa8bdd8, o.hemiGround || 0x6b5539,
      o.hemi == null ? 0.5 : o.hemi);
    scene.add(hemi);

    var sun = new T.DirectionalLight(o.sunColor || 0xffcb93, o.sun == null ? 1.15 : o.sun);
    var sp = o.sunPos || [6, 12, 7];
    sun.position.set(sp[0], sp[1], sp[2]);
    sun.castShadow = o.shadow !== false;
    if (sun.castShadow) {
      sun.shadow.mapSize.set(1024, 1024);
      var sc = sun.shadow.camera;
      sc.left = -14; sc.right = 14; sc.top = 14; sc.bottom = -14;
      sc.near = 1; sc.far = 60;
      sun.shadow.bias = -0.0012;
    }
    scene.add(sun);

    /* 补光：从镜头侧后打一道很弱的冷光，把背光面的轮廓拉出来，
       否则骨片在暗场里会糊成一团剪影。 */
    var fill = new T.DirectionalLight(0x9fb6d8, o.fill == null ? 0.30 : o.fill);
    fill.position.set(-8, 5, -9);
    scene.add(fill);

    var root = new T.Group();
    scene.add(root);

    /* ---------- 状态 ---------- */
    var tk = { t: 0, last: 0, raf: 0, alive: true };
    var ticks = [], pickFn = null;
    var fly = null;
    var orbitCtl = null;
    var drag = { on: false, x: 0, y: 0, moved: 0, t: 0 };
    var ptrs = {};
    var el = renderer.domElement;

    function sizeNow() {
      var w = host.clientWidth || window.innerWidth;
      var h = host.clientHeight || window.innerHeight;
      if (w === 0 || h === 0) { return; }
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    function onResize() { sizeNow(); }
    window.addEventListener('resize', onResize);

    /* ---------- 射线拾取 ---------- */
    var rc = new T.Raycaster();
    function ndcOf(clientX, clientY) {
      var r = el.getBoundingClientRect();
      return new T.Vector2(
        ((clientX - r.left) / r.width) * 2 - 1,
        -((clientY - r.top) / r.height) * 2 + 1
      );
    }
    /* 物体自己或任何一层祖先 visible=false 就算看不见。
       ⚠ three 的 Raycaster **不看 visible**：把挡在中间的东西设成
       visible=false，它照样参与相交，而且常常还带着 pickable，
       点击就被它整口吃掉（守阵兽那只隐形点击球就是这样让
       "打散小怪之后点不到字"的）。射线结果必须自己筛一遍。 */
    function visibleChain(o) {
      var p = o;
      while (p) {
        if (p.visible === false) { return false; }
        p = p.parent;
      }
      return true;
    }

    function raycast(ndc, objs) {
      rc.setFromCamera(ndc, camera);
      var list = objs || scene.children;
      var all = rc.intersectObjects(list, true);
      var hits = [];
      for (var i = 0; i < all.length; i++) {
        if (visibleChain(all[i].object)) { hits.push(all[i]); }
      }
      return hits;
    }

    function onDown(e) {
      ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
      drag.on = true; drag.x = e.clientX; drag.y = e.clientY;
      drag.moved = 0; drag.t = performance.now();
      if (el.setPointerCapture) { try { el.setPointerCapture(e.pointerId); } catch (err) {} }
      if (orbitCtl) {
        orbitCtl.drag = true;
        orbitCtl.px = e.clientX; orbitCtl.py = e.clientY;
      }
    }
    function onMove(e) {
      if (!drag.on) { return; }
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX; drag.y = e.clientY;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      if (orbitCtl && orbitCtl.drag) {
        orbitCtl.yaw -= dx * 0.008;
        orbitCtl.pitch = Math.max(-0.5, Math.min(1.15, orbitCtl.pitch + dy * 0.006));
        applyOrbit();
      }
    }
    function onUp(e) {
      var wasDrag = drag.moved > 9;
      drag.on = false;
      if (orbitCtl) { orbitCtl.drag = false; }
      /* 只有"按下-抬起几乎没移动"才算点击 —— 否则拖拽转视角会误触交互 */
      if (!wasDrag && pickFn && performance.now() - drag.t < 900) {
        var ndc = ndcOf(e.clientX, e.clientY);
        var hits = raycast(ndc);
        /* 命中链上所有 pickable 都收齐（由近到远）再交出去。
           只给第一个的话，前面任何一件"点击区"（隐形球、透明底板）
           都能把后面真正该点的东西整个遮住，而玩法层根本不知道
           后面还压着东西 —— 表现就是"点了没反应"。 */
        var alts = [];
        for (var i = 0; i < hits.length; i++) {
          var ob = hits[i].object;
          while (ob) {
            if (ob.userData && ob.userData.pickable) {
              if (alts.indexOf(ob) < 0) { alts.push(ob); }
              break;
            }
            ob = ob.parent;
          }
        }
        if (alts.length) {
          pickFn({ obj: alts[0], alts: alts, hit: hits[0], point: hits[0].point, ndc: ndc });
        } else {
          pickFn({ obj: null, alts: alts, hit: null, point: null, ndc: ndc });
        }
      }
    }
    function onWheel(e) {
      if (!orbitCtl) { return; }
      e.preventDefault();
      orbitCtl.radius = Math.max(orbitCtl.minR,
        Math.min(orbitCtl.maxR, orbitCtl.radius + e.deltaY * 0.004));
      applyOrbit();
    }
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', function () { drag.on = false; if (orbitCtl) { orbitCtl.drag = false; } });
    el.addEventListener('wheel', onWheel, { passive: false });

    /* ---------- 相机：tween 与环绕 ---------- */
    function flyTo(t, done) {
      t = t || {};
      fly = {
        t: 0, dur: t.dur == null ? 1.1 : t.dur,
        ease: EASE[t.ease || 'inout'],
        p0: camera.position.clone(),
        l0: lookAt.clone(),
        p1: t.pos ? new T.Vector3(t.pos[0], t.pos[1], t.pos[2]) : null,
        l1: t.look ? new T.Vector3(t.look[0], t.look[1], t.look[2]) : null,
        fov1: t.fov == null ? null : t.fov,
        fov0: camera.fov,
        done: done || null
      };
      orbitCtl = null;
      return fly;
    }
    function applyOrbit() {
      if (!orbitCtl) { return; }
      var d = orbitCtl.radius;
      var cy = Math.cos(orbitCtl.pitch);
      camera.position.set(
        orbitCtl.center.x + Math.sin(orbitCtl.yaw) * cy * d,
        orbitCtl.center.y + Math.sin(orbitCtl.pitch) * d,
        orbitCtl.center.z + Math.cos(orbitCtl.yaw) * cy * d
      );
      lookAt.copy(orbitCtl.center);
      camera.lookAt(lookAt);
    }
    function orbit(center, t) {
      t = t || {};
      var c = center.isVector3 ? center : new T.Vector3(center[0], center[1], center[2]);
      orbitCtl = {
        center: c,
        radius: t.radius == null ? 4 : t.radius,
        minR: t.minR == null ? 1.8 : t.minR,
        maxR: t.maxR == null ? 12 : t.maxR,
        yaw: t.yaw == null ? 0.5 : t.yaw,
        pitch: t.pitch == null ? 0.28 : t.pitch,
        drag: false
      };
      fly = null;
      applyOrbit();
      return orbitCtl;
    }
    function orbitTo(t) {
      if (!orbitCtl) { return; }
      if (t.radius != null) { orbitCtl.radius = t.radius; }
      if (t.yaw != null) { orbitCtl.yaw = t.yaw; }
      if (t.pitch != null) { orbitCtl.pitch = t.pitch; }
      applyOrbit();
    }

    /* ---------- 主循环 ---------- */
    function frame(now) {
      if (!tk.alive) { return; }
      tk.raf = requestAnimationFrame(frame);
      if (!tk.last) { tk.last = now; }
      var dt = Math.min(0.06, (now - tk.last) / 1000);
      tk.last = now;
      tk.t += dt;

      if (fly) {
        fly.t += dt;
        var k = Math.min(1, fly.t / fly.dur);
        var e = fly.ease(k);
        if (fly.p1) { camera.position.lerpVectors(fly.p0, fly.p1, e); }
        if (fly.l1) { lookAt.lerpVectors(fly.l0, fly.l1, e); camera.lookAt(lookAt); }
        if (fly.fov1 != null) {
          camera.fov = fly.fov0 + (fly.fov1 - fly.fov0) * e;
          camera.updateProjectionMatrix();
        }
        if (k >= 1) {
          var d = fly.done; fly = null;
          if (d) { d(); }
        }
      }

      for (var i = 0; i < ticks.length; i++) {
        try { ticks[i](dt, tk.t); } catch (err) {}
      }
      renderer.render(scene, camera);
    }
    tk.raf = requestAnimationFrame(frame);
    sizeNow();

    var stage = {
      T: T, renderer: renderer, scene: scene, camera: camera, root: root,
      /* 三盏基础灯挂出来：夜里的骨片空间、黄昏的河谷、只有一束射灯的窖穴，
         亮度差着一个数量级 —— 不给场景调，就只能靠加灯去压，越压越脏。 */
      lights: { hemi: hemi, sun: sun, fill: fill },
      host: host, el: el,
      get t() { return tk.t; },
      onTick: function (fn) { ticks.push(fn); return fn; },
      onPick: function (fn) { pickFn = fn; },
      raycast: raycast,
      ndc: ndcOf,
      flyTo: flyTo,
      orbit: orbit,
      orbitTo: orbitTo,
      orbitState: function () { return orbitCtl; },
      worldSize: function () {
        return { w: host.clientWidth || W, h: host.clientHeight || H };
      },
      resize: sizeNow,
      dispose: function () {
        tk.alive = false;
        cancelAnimationFrame(tk.raf);
        window.removeEventListener('resize', onResize);
        el.removeEventListener('pointerdown', onDown);
        el.removeEventListener('pointermove', onMove);
        el.removeEventListener('pointerup', onUp);
        el.removeEventListener('wheel', onWheel);
        scene.traverse(function (ob) {
          if (ob.geometry) { try { ob.geometry.dispose(); } catch (e) {} }
          if (ob.material) {
            var ms = Array.isArray(ob.material) ? ob.material : [ob.material];
            ms.forEach(function (m) {
              if (m.map) { try { m.map.dispose(); } catch (e) {} }
              try { m.dispose(); } catch (e) {}
            });
          }
        });
        if (renderer.dispose) { renderer.dispose(); }
        if (el.parentNode) { el.parentNode.removeChild(el); }
      }
    };
    return stage;
  }

  App.stage3d = {
    load: loadThree,
    create: create,
    boneTex: boneTex,
    bonePlateGeo: bonePlateGeo,
    makeGuibao: makeGuibao,
    canvas: canvas,
    tex: tex,
    rnd: rnd,
    ease: EASE
  };
})(window.App);
