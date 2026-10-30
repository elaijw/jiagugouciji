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
    /* 曝光 1.00 + 下面的"暖主光 / 冷天光"配比：
       原来 hemi 0.82 暖色 + sun 1.28 暖色 = 全场 2.1 倍暖光直接顶到 ACES 肩部，
       夯土、青灰石、木柱、草顶全被压成同一档米黄色（截图上看就是"一坨土"）。
       现在总辐照降到 1.5 左右，靠冷暖对比把体块分开。 */
    renderer.toneMappingExposure = 1.00;
    renderer.domElement.style.display = 'block';
    host.appendChild(renderer.domElement);

    var scene = new T.Scene();
    /* 地形是 150×150 的有限平面，边界就在 75 米外。雾太薄时，地形到此为止、
       天穹从这儿开始，画面上会出现一条假的"地平线"断层（看到的像一块褐色地面
       被一刀切掉）。把密度提到 0.013，让 60~75 米的景物先被雾吃掉，
       顺带把外圈山脊变成朦胧的远山剪影。 */
    scene.fog = new T.FogExp2(0x9a7d59, 0.0095);

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
    /* 天光压冷、压暗：黄昏的暗部是冷蓝灰，不是第二盏暖灯。
       这一盏负责"体块背光面的形状"，暖主光负责"受光面的方向感"。 */
    var hemi = new T.HemisphereLight(0xa8bdd8, 0x6b5539, 0.46);
    scene.add(hemi);

    var sun = new T.DirectionalLight(0xffd2a2, 1.06);
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
    var glowMat = (function () {
      var cv = document.createElement('canvas'); cv.width = cv.height = 64;
      var c = cv.getContext('2d');
      var g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0.0, 'rgba(255,214,150,0.95)');
      g.addColorStop(0.28, 'rgba(255,150,60,0.55)');
      g.addColorStop(0.62, 'rgba(220,90,30,0.16)');
      g.addColorStop(1.0, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(0, 0, 64, 64);
      var tex = new T.CanvasTexture(cv);
      if (T.SRGBColorSpace) { tex.colorSpace = T.SRGBColorSpace; }
      return new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false,
                                    blending: T.AdditiveBlending, toneMapped: false });
    })();
    var fireLights = [];
    world.fires.forEach(function (f) {
      var l = new T.PointLight(0xff9a4e, 1.5, 16, 2);
      l.position.set(f.x, f.y + 0.4, f.z);
      scene.add(l);
      fireLights.push({ light: l, base: 1.5, seed: Math.random() * 10 });
      /* 火苗本体：两层锥，靠动画抖动。
         MeshBasicMaterial 默认参与色调映射，0xffb066 被 ACES 一压就变成"奶白圆锥"
         （远景看像插了一支甜筒）。toneMapped:false 才是真正画面上那个橙色。 */
      var flame = new T.Mesh(
        new T.ConeGeometry(0.17, 0.72, 7, 1),
        new T.MeshBasicMaterial({ color: 0xff7a2e, transparent: true, opacity: 0.62,
                                  fog: false, depthWrite: false, toneMapped: false })
      );
      flame.position.set(f.x, f.y + 0.34, f.z);
      scene.add(flame);
      var core = new T.Mesh(
        new T.ConeGeometry(0.085, 0.40, 6, 1),
        new T.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0.80,
                                  fog: false, depthWrite: false, toneMapped: false })
      );
      core.position.set(f.x, f.y + 0.22, f.z);
      scene.add(core);
      flame.userData.core = core;
      /* 光晕：一张 Sprite 永远面向相机，加色叠加。
         只用锥体的话，火苗是一块硬边的橙色多边形（像交通锥）；
         加上这层柔光，边缘才"化"开，远处也还能看见一星暖光。 */
      var glow = new T.Sprite(glowMat);
      glow.position.set(f.x, f.y + 0.40, f.z);
      glow.scale.set(1.5, 1.5, 1);
      scene.add(glow);
      flame.userData.glow = glow;
      fireLights[fireLights.length - 1].flame = flame;
    });

    /* ---------- 角色：龟宝 ----------
       造型与动画都在 js/world/guibao.js（按三视图重建的那一版）。
       这里只负责把它放进世界、给它脚下压一层接触阴影。
       为什么独立成文件：角色是"要反复改比例和关节"的东西，
       混在 1200 行的渲染层里改一次要读一遍全场。 */
    var player = new T.Group();
    player.name = 'guibao';
    var GB = (App.guibao && App.guibao.build) ? App.guibao.build(T, {}) : null;
    if (GB) { player.add(GB.root); }
    else {
      /* 极端情况：guibao.js 没加载 —— 给一个能走的替身，别让路由整页黑掉 */
      var fb = new T.Mesh(new T.SphereGeometry(0.34, 20, 14),
        new T.MeshStandardMaterial({ color: 0xb4d18c, roughness: 0.8 }));
      fb.position.y = 0.42; fb.castShadow = true;
      player.add(fb);
    }

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
      var m = new T.Mesh(new T.PlaneGeometry(1.30, 1.30),
        new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      m.position.y = 0.02;
      player.add(m);
    })();

    /* ---------- 相机 ---------- */
    var camera = new T.PerspectiveCamera(52, W / Math.max(1, H), 0.1, 400);
    /* 默认机位：越肩视角，站在台地上俯看广场。
       pitch 是"仰角的补角"，越大越平视。18 米 / 1.12 那种机位是"航拍模型"，
       一条水平边都看不见、画面前 40% 全是脚下的土，读起来像沙盘。
       8.5~9 米 / 1.26 时地平线进画，近景是坡、中景是广场、远景是屋脊与山头。 */
    var cam = { yaw: 0, pitch: 1.26, dist: 9.0, tDist: 9.0 };
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

      /* 角色动画：走路/待机/讲解/发现都由 guibao.js 的状态机算，
         这里只把"速度"和"是否在观察"喂进去。 */
      if (GB && GB.update) {
        GB.update(dt, { speed: st.speed, run: !!run, focus: !!focus });
      }

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
          var fy = 0.9 + k * 0.18;
          f.flame.scale.set(1 + Math.sin(tAll * 9.1 + f.seed) * 0.08, fy, 1);
          /* 内焰跟外焰一起抖，但相位错开 —— 同步缩放会露馅成"一个锥在伸缩" */
          var co = f.flame.userData.core;
          if (co) {
            co.scale.set(1 - Math.sin(tAll * 9.1 + f.seed) * 0.06,
                         0.86 + Math.sin(tAll * 11.7 + f.seed) * 0.16, 1);
            co.position.y = f.flame.position.y - 0.14;
          }
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
        var dist = 3.0 + (it.collider ? it.collider.hx : 0.5) * 1.9;
        /* 站到字的正面去。
           注意是"朝向本区中心"，不是"朝向世界原点"：字碑围的是区心，
           朝向原点会让相机落到外圈去拍背面（截图里就是一块背影 + 挡在前面的台地）。
           相机放到"字碑与区心之间"，再回看字碑 —— 视线穿过的是区心的空地，
           中间不会横着别的东西。 */
        var cz = null;
        for (var zi = 0; zi < world.zones.length; zi++) {
          if (world.zones[zi].id === it.zone) { cz = world.zones[zi]; break; }
        }
        var tx = cz ? cz.x : 0, tz = cz ? cz.z : 0;
        focus = { x: v.x, y: v.y + it.mountY, z: v.z,
          yaw: Math.atan2(tx - v.x, tz - v.z), dist: dist, pitch: 1.06, t: 0 };
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
        (GB ? GB.head : player).getWorldPosition(hp);
        var fp = new T.Vector3();
        player.getWorldPosition(fp);
        return {
          player: [+fp.x.toFixed(2), +fp.y.toFixed(2), +fp.z.toFixed(2)],
          head: [+hp.x.toFixed(2), +hp.y.toFixed(2), +hp.z.toFixed(2)],
          cam: [+camera.position.x.toFixed(2), +camera.position.y.toFixed(2), +camera.position.z.toFixed(2)],
          dist: +cam.dist.toFixed(2), pitch: +cam.pitch.toFixed(2), yaw: +cam.yaw.toFixed(2),
          ground: +world.terrainH(st.x, st.z).toFixed(2),
          stuck: blocked(st.x, st.z),
          fov: +camera.fov.toFixed(1), aspect: +camera.aspect.toFixed(2),
          gb: (GB && GB.metrics) ? GB.metrics() : null
        };
      },
      dispose: dispose
    });
  }

  App.world3d = { create: create };
})(window.App);
