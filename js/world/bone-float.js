/* ============================================================================
   第二关 · 骨片浮空探索（玩法重做版）

   和旧版 bonespace.js 的根本区别：
     旧版 = 骨片群 → 清场 → 另建一个场景（草地/窖穴/观星台）→ 回来重建骨片群。
            这是"关卡切换"，不是"这片骨长出了什么"。
     新版 = 骨片群始终在。点一片骨，其余骨退暗后移；这一片飞到画面中央放大，
            甲骨文字亮起来，然后它所指的东西**从骨片表面长出来**，骨片退到后面
            当背景。收回去时，景物缩回骨片，骨片飞回原位。

   所以整个关卡只有一个 3D 场景、一套骨片、一个状态机：
     idle → focus → unveil → show → close → idle

   数据全部来自 App.glyphs.parts（73 字，pieces[].d 折线）+ App.worldGlyph。
   不引用王邑、地图、区域、点位任何旧玩法。
   旧版 bonespace.js 保留在项目里作为历史文件，本文件不加载、不调用它。
   ========================================================================= */
(function () {
  'use strict';

  /* 龟宝暂不完全插进关卡：立牌与它的台词都由这个开关控制。
     要恢复就改 true —— 场景里会重新出现立牌。 */
  var SHOW_GB = false;

  /* ---------------- 数据：这一批骨片 ----------------
     cat 只用来给卡片分类，不对应任何旧区域。
     gloss 是字形本身的说明；link 是把字形和实物连起来的那一句。
     所有释义按甲骨学通行的象形解释写，不编造。 */
  var PLATES = [
    {
      ch: '山', cat: '自然', now: '山',
      gloss: '三座山峰并立，中间一峰高、两侧低，底下一条横线是地面。',
      link: '把「山」横过来看，就是一道连绵的山脊线。',
      make: 'shan'
    },
    {
      ch: '水', cat: '自然', now: '水',
      gloss: '中间一条弯曲的主流，两侧各有几点水花或支流。',
      link: '今天的「水」还留着中间一竖、两边四点——三千年前的水花没干。',
      make: 'shui'
    },
    {
      ch: '木', cat: '自然', now: '木',
      gloss: '上一横是枝，下一撇一捺是根，中间一竖是干。',
      link: '它画的是一棵树的正面：上面伸枝，下面扎根。',
      make: 'mu'
    },
    {
      ch: '日', cat: '天体', now: '日',
      gloss: '一个圆，中间点一点或画一短横——太阳不是空的。',
      link: '后来圆写成方，中间那一点拉成一横，就成了今天的「日」。',
      make: 'ri', fade: 0.30
    },
    {
      ch: '目', cat: '人体', now: '目',
      gloss: '一只横放的眼睛：外框是眼眶，中间一道或两道是眼珠。',
      link: '甲骨文里的「目」常写作横置的眼睛，竖起来才是今天的字形。',
      make: 'mue', fade: 0.62
    },
    {
      ch: '鼎', cat: '器物', now: '鼎',
      gloss: '上面是鼎身（容器），两侧两只耳，下面三条足。',
      link: '它画的是一件能煮肉、能祭天的重器，不是随便一口锅。',
      make: 'ding'
    }
  ];

  var S = {
    st: null, root: null, container: null, ui: {},
    mode: 'idle',          // idle | focus | unveil | show | close
    plates: [],
    focus: null,
    plot: null,
    prop: null,
    hovered: null,
    tweens: [],
    t: 0,
    busy: false,
    guibao: null,
    cardRight: 0            // 知识卡右边缘（气泡避让用），0 = 卡片没展开
  };

  /* ---------------- 极简 tween ----------------
     键名约定：px/py/pz 位置 · sx/sy/sz 缩放 · rx/ry/rz 旋转 · op 透明度 */
  function easeOut(k) { return 1 - Math.pow(1 - k, 3); }
  function easeInOut(k) { return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; }
  function easeBack(k) { var c = 1.70158; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); }

  function readProp(o, k) {
    switch (k) {
      case 'px': return o.position.x;
      case 'py': return o.position.y;
      case 'pz': return o.position.z;
      case 'sx': case 'sy': case 'sz': return o.scale.x;
      case 'rx': return o.rotation.x;
      case 'ry': return o.rotation.y;
      case 'rz': return o.rotation.z;
      case 'op': return o.userData.op == null ? 1 : o.userData.op;
      case 'in': return 0;
    }
    return 0;
  }
  function writeProp(o, k, v) {
    switch (k) {
      case 'px': o.position.x = v; break;
      case 'py': o.position.y = v; break;
      case 'pz': o.position.z = v; break;
      case 'sx': case 'sy': case 'sz': o.scale.setScalar(v); break;
      case 'rx': o.rotation.x = v; break;
      case 'ry': o.rotation.y = v; break;
      case 'rz': o.rotation.z = v; break;
      case 'op': setOpacity(o, v); o.userData.op = v; break;
    }
  }
  function tw(obj, props, dur, ease, done) {
    var from = {};
    for (var k in props) { if (k !== 'in') { from[k] = readProp(obj, k); } }
    S.tweens.push({ o: obj, f: from, t: props, e: 0, d: dur, ez: ease || easeOut, done: done });
  }
  /* 每个非 idle 状态最多允许存在多久（秒）。超了就是卡住了。 */
  var GUARD = { focus: 6.0, unveil: 6.0, show: Infinity, close: 6.0 };

  function stepTweens(dt) {
    for (var i = S.tweens.length - 1; i >= 0; i--) {
      var a = S.tweens[i];
      a.e += dt;
      var k = Math.min(1, a.e / a.d), v = a.ez(k);
      for (var key in a.t) {
        if (key === 'in') { a.o.intensity = a.o.userData.i0 + (a.t.in - a.o.userData.i0) * v; continue; }
        writeProp(a.o, key, a.f[key] + (a.t[key] - a.f[key]) * v);
      }
      if (k >= 1) { S.tweens.splice(i, 1); if (a.done) { a.done(); } }
    }
  }

  /* 整组透明度：骨板的 body 与两面刻字一起淡 */
  function setOpacity(o, v) {
    o.traverse(function (m) {
      if (!m.material) { return; }
      var ms = Array.isArray(m.material) ? m.material : [m.material];
      for (var i = 0; i < ms.length; i++) {
        var mm = ms[i];
        mm.transparent = true;
        mm.opacity = v;
        mm.depthWrite = v > 0.75;
      }
    });
  }

  /* ==========================================================================
     景物生成器
     每个返回 { root, update(dt,t), dispose() }。root 初始被压到 0.03 倍，
     由控制器放大到 1 —— 这就是"长出来"。
     ========================================================================== */

  /* ---- 山：三峰从下往上长，中间一峰最高 ---- */
  function propShan(T) {
    var g = new T.Group();
    /* 内层承担一个固定缩放：root 的 scale 要被 tween 从 0.03 拉到 1，
       不能占用来做"让山落在骨片轮廓内"这件事。 */
    var inner = new T.Group();
    inner.scale.setScalar(0.84);
    g.add(inner);
    /* 颜色偏冷的青灰：暖光一照就发黄，所以基色要冷，出来才是石头。 */
    var matA = new T.MeshStandardMaterial({ color: 0x4a5450, roughness: 0.96, metalness: 0, flatShading: true });
    var matB = new T.MeshStandardMaterial({ color: 0x353d3c, roughness: 0.98, metalness: 0, flatShading: true });
    /* 峰要高瘦：圆锥半径 1.1 + 高度 2.8 出来是金字塔。
       收窄到 0.55 的半径高比，才像山脊。 */
    var peaks = [
      { x: -1.05, z: 0.30, h: 1.62, r: 0.62, m: matA },
      { x: 0.10, z: -0.20, h: 2.30, r: 0.74, m: matB },
      { x: 1.05, z: 0.18, h: 1.34, r: 0.54, m: matA },
      { x: 1.72, z: -0.40, h: 0.92, r: 0.42, m: matB },
      { x: -1.72, z: -0.34, h: 0.86, r: 0.40, m: matB }
    ];
    peaks.forEach(function (p, i) {
      var mesh = new T.Mesh(new T.ConeGeometry(p.r, p.h, 5, 1), p.m);
      mesh.position.set(p.x, p.h * 0.5 - 0.80, p.z);
      mesh.rotation.y = i * 1.1;
      mesh.castShadow = true;
      inner.add(mesh);
    });
    /* 山脚薄雾：山要"插进雾里"，不能悬在骨面上 */
    /* 雾带用椭圆 + 径向渐变。原来的长方形线性渐变贴在平板上，
       在画面里就是一条灰白长条，很假。 */
    var band = new T.Mesh(
      new T.CircleGeometry(2.4, 32),
      new T.MeshBasicMaterial({
        map: softDiscTex(), transparent: true, opacity: 0.60,
        depthWrite: false, side: T.DoubleSide
      })
    );
    band.scale.set(1.5, 0.34, 1);
    band.position.set(0.05, -0.72, 0.26);
    g.add(band);

    return {
      root: g,
      update: function (dt, t) { band.material.opacity = 0.44 + Math.sin(t * 0.7) * 0.10; },
      dispose: function () {}
    };
  }

  /* ---- 水：一条竖着流下的河 ---- */
  /* 原来是一块横躺的水面。相机在上方俯视，4.6×3.0 的平面被透视压成一条
     淡青色横带，横切过骨片，像一条丝带而不像水。
     「水」这个字本身是竖着的河流 —— 那就让它竖着从骨片上流下来：
     一条竖直的水带 + 两侧飞溅 + 底部水花。这样既贴合字形，也不怕透视压缩。

     第二轮：形状对了，但渲出来还是一张"青纸"贴在骨头上。
     因为整片面只有一种平色 —— 自发光 0.80 + 几乎全透明，等于自带背光，
     灯光照不出任何明暗。改法是给它一张程序化贴图：横向中间实两侧透明
     （才有了水带的边）、纵向十几道稍亮的流线（才有了流动感）、
     上下两端擦淡（才不会像个矩形色块），再配 0.34 的低自发光。
     另外 metalness 归零 —— 场景没有 envMap，金属度只会换来一条假高光。 */
  var _water = null;
  function waterTex() {
    if (_water) { return _water; }
    var W = 128, H = 384;
    var cv = App.stage3d.canvas(W, H), c = cv.getContext('2d');
    /* 横向：中间是实心的水体，只在最外侧 8% 收成透明。
       上一版从 16% 就开始透，整条水看起来像雾不像水。 */
    var gd = c.createLinearGradient(0, 0, W, 0);
    gd.addColorStop(0.00, 'rgba(120,196,220,0)');
    gd.addColorStop(0.08, 'rgba(64,140,172,0.95)');
    gd.addColorStop(0.30, 'rgba(88,172,202,1)');
    gd.addColorStop(0.52, 'rgba(112,196,222,1)');
    gd.addColorStop(0.74, 'rgba(88,172,202,1)');
    gd.addColorStop(0.92, 'rgba(64,140,172,0.95)');
    gd.addColorStop(1.00, 'rgba(120,196,220,0)');
    c.fillStyle = gd; c.fillRect(0, 0, W, H);
    /* 纵向流线：十几道细亮条 */
    for (var i = 0; i < 15; i++) {
      var x = (i + 0.5) / 15 * W + ((i % 3) - 1) * 5;
      var lg = c.createLinearGradient(x - 4, 0, x + 4, 0);
      lg.addColorStop(0, 'rgba(255,255,255,0)');
      lg.addColorStop(0.5, 'rgba(255,255,255,' + (0.06 + (i % 4) * 0.035).toFixed(3) + ')');
      lg.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = lg;
      c.fillRect(x - 4, 0, 8, H);
    }
    /* 上下两端只擦掉最外面一小截，不做成长渐变 */
    c.globalCompositeOperation = 'destination-out';
    var vg = c.createLinearGradient(0, 0, 0, H);
    vg.addColorStop(0.00, 'rgba(0,0,0,1)');
    vg.addColorStop(0.07, 'rgba(0,0,0,0)');
    vg.addColorStop(0.92, 'rgba(0,0,0,0)');
    vg.addColorStop(1.00, 'rgba(0,0,0,1)');
    c.fillStyle = vg; c.fillRect(0, 0, W, H);
    c.globalCompositeOperation = 'source-over';
    _water = App.stage3d.tex(cv, 1);
    return _water;
  }

  function propShui(T) {
    var g = new T.Group();
    var inner = new T.Group();
    inner.scale.setScalar(0.92);
    g.add(inner);

    /* 水带：竖直的窄长面，顶点按行做横向摆动，看起来在流 */
    var geo = new T.PlaneGeometry(1.02, 2.62, 14, 34);
    var base = geo.attributes.position.array.slice(0);
    var mat = new T.MeshStandardMaterial({
      map: waterTex(),
      /* 颜色交给贴图，材质色保持白 —— 两边同时上色会互相压暗。
         自发光只给一点点，够在暗场里立住就行：给多了整条水会化成一片雾。 */
      color: 0xffffff,
      roughness: 0.36, metalness: 0.0,
      transparent: true, opacity: 1.0,
      emissive: new T.Color(0x0e4b60), emissiveIntensity: 0.22,
      side: T.DoubleSide, depthWrite: false
    });
    var flow = new T.Mesh(geo, mat);
    flow.position.set(0, -0.02, 0);
    inner.add(flow);

    /* 只留一条主流。
       原来左右还各挂一条 0.22 宽的侧流平面 —— 它们和水带不共面、透明度不同，
       渲出来是两根淡蓝的"棍"戳在河两边。水要靠主流自己的摆动和纹理说话，
       硬加平面只会多两块纸板。两侧的水改用几颗水滴带出来。 */

    /* 水珠：贴着水带往下甩，拉成水滴形，别撒成一片雪 */
    var drops = [];
    for (var d = 0; d < 7; d++) {
      var dm = new T.Mesh(
        new T.SphereGeometry(0.030 + (d % 3) * 0.009, 8, 6),
        new T.MeshStandardMaterial({
          color: 0xc4e8f4, roughness: 0.24, metalness: 0.0,
          emissive: new T.Color(0x2a5866), emissiveIntensity: 0.30
        })
      );
      dm.scale.set(1, 2.2, 1);
      dm.userData = { ph: d / 7, sx: (d % 2 ? 1 : -1), sp: 0.7 + (d % 4) * 0.12, off: (d % 5) * 0.16 };
      inner.add(dm);
      drops.push(dm);
    }

    /* 底部水花：两圈扁环，向外扩 */
    var rings = [];
    for (var i = 0; i < 2; i++) {
      var rm = new T.Mesh(
        new T.RingGeometry(0.26, 0.31, 40),
        new T.MeshBasicMaterial({
          color: 0xc8ecf6, transparent: true, opacity: 0,
          side: T.DoubleSide, depthWrite: false
        })
      );
      rm.rotation.x = -Math.PI / 2;
      rm.position.y = -1.40;
      rm.userData.ph = i / 2;
      inner.add(rm);
      rings.push(rm);
    }

    return {
      root: g,
      update: function (dt, t) {
        /* 主流：每行按 sin 横摆，越往下摆得越大 —— 像水在往下坠 */
        var pa = geo.attributes.position;
        for (var i = 0; i < pa.count; i++) {
          var x0 = base[i * 3], y0 = base[i * 3 + 1];
          var k = (1.35 - y0) / 2.70;                // 0 顶 → 1 底
          /* 上窄下宽：水流越往下越散开。宽度若恒定，整片就是一个矩形色块 */
          var wide = 0.46 + k * 0.54;
          pa.setX(i, x0 * wide + Math.sin(y0 * 3.4 + t * 2.6) * (0.05 + k * 0.16));
          pa.setZ(i, Math.cos(y0 * 2.2 + t * 1.9) * 0.06 + k * 0.22);
        }
        pa.needsUpdate = true;

        drops.forEach(function (dm) {
          var k2 = (t * dm.userData.sp * 0.5 + dm.userData.ph) % 1;
          dm.position.set(
            dm.userData.sx * (0.20 + Math.sin(k2 * Math.PI) * 0.34),
            1.06 - k2 * 2.30,
            0.10 + Math.sin(k2 * 3.1) * 0.18
          );
          var ds = 0.7 + (1 - k2) * 0.7;
          dm.scale.set(ds, ds * 2.2, ds);
        });

        rings.forEach(function (r) {
          var k3 = (t * 0.55 + r.userData.ph) % 1;
          r.scale.setScalar(0.7 + k3 * 2.2);
          r.material.opacity = (1 - k3) * 0.50;
        });
      },
      dispose: function () {}
    };
  }

  /* ---- 木：干、枝、冠 ---- */
  function propMu(T) {
    var g = new T.Group();
    var inner = new T.Group();
    inner.scale.setScalar(0.90);
    g.add(inner);
    var bark = new T.MeshStandardMaterial({ color: 0x4a3a26, roughness: 0.94, metalness: 0 });
    var leafA = new T.MeshStandardMaterial({ color: 0x3f5f2e, roughness: 0.9, flatShading: true });
    var leafB = new T.MeshStandardMaterial({ color: 0x517636, roughness: 0.9, flatShading: true });

    /* 原来树干 0.10~0.20 半径，被四个 0.6~0.7 半径的树冠球整个盖住，
       画面里只剩"一捧绿西兰花 + 一截木桩"。树干加粗拉长、树冠收小上移。 */
    var trunk = new T.Mesh(new T.CylinderGeometry(0.135, 0.245, 2.45, 7), bark);
    trunk.position.y = -0.42;
    trunk.castShadow = true;
    inner.add(trunk);

    var branches = [];
    [{ y: 0.30, ry: 0.5, rz: -0.98, len: 0.98 },
     { y: 0.58, ry: 2.4, rz: -0.90, len: 0.86 },
     { y: 0.02, ry: 4.2, rz: -1.06, len: 0.72 }].forEach(function (b) {
      var piv = new T.Group();
      piv.position.y = b.y;
      piv.rotation.y = b.ry;
      piv.rotation.z = b.rz;
      var br = new T.Mesh(new T.CylinderGeometry(0.055, 0.095, b.len, 6), bark);
      br.position.y = b.len * 0.5;
      piv.add(br);
      inner.add(piv);
      branches.push(piv);
    });

    /* 三条根：向外斜下的短柱。
       「木」这个字下半部的两撇就是根 —— 没有根，这棵树就只是一根木桩，
       字和实物的对应也断了一半。 */
    [{ a: 0.35, l: 0.86 }, { a: 2.55, l: 0.80 }, { a: 4.35, l: 0.74 }].forEach(function (r) {
      var piv = new T.Group();
      piv.position.y = -1.28;
      piv.rotation.y = r.a;
      piv.rotation.z = 0.92;
      var root = new T.Mesh(new T.CylinderGeometry(0.035, 0.075, r.l, 5), bark);
      root.position.y = -r.l * 0.5;
      piv.add(root);
      inner.add(piv);
    });

    var crowns = [];
    /* 三个而不是四个，半径收到 0.40~0.52，整体上移到枝梢处：
       树干和枝"从冠下露出来"，才是一棵树，不是一丛灌木。 */
    [{ x: -0.54, y: 0.92, z: 0.10, r: 0.50, m: leafA },
     { x: 0.56, y: 1.02, z: -0.10, r: 0.52, m: leafB },
     { x: 0.02, y: 1.34, z: 0.02, r: 0.46, m: leafA }].forEach(function (c) {
      var s = new T.Mesh(new T.IcosahedronGeometry(c.r, 0), c.m);
      s.position.set(c.x, c.y, c.z);
      s.rotation.set(c.x, c.y, c.z);
      s.castShadow = true;
      inner.add(s);
      crowns.push(s);
    });

    return {
      root: g,
      update: function (dt, t) {
        g.rotation.z = Math.sin(t * 0.62) * 0.014;
        crowns.forEach(function (c, i) { c.scale.setScalar(1 + Math.sin(t * 1.1 + i * 1.7) * 0.022); });
        branches.forEach(function (b, i) { b.rotation.y += Math.sin(t * 0.5 + i) * 0.0006; });
      },
      dispose: function () {}
    };
  }

  /* ---- 日：发光体 + 两层晕 + 八道光 ---- */
  function propRi(T) {
    var g = new T.Group();
    var inner = new T.Group();
    inner.scale.setScalar(1.06);
    g.add(inner);
    /* 纯米黄的球在米黄骨片前面等于隐形 —— 太阳必须是画面里最亮的东西。 */
    var core = new T.Mesh(new T.SphereGeometry(0.92, 32, 24), new T.MeshBasicMaterial({ color: 0xfff6d8 }));
    inner.add(core);
    /* 「日」在甲骨文里就是一个圆加中间一点 —— 太阳要有一圈**清楚的边**，
       光晕只是边外面一点点。2.25 半径的光晕在 6 米机位下直径 4.8 米，
       比视高还大，整个画面糊成一片暖黄，反而看不见"圆"了。 */
    var halo1 = new T.Mesh(new T.SphereGeometry(1.10, 28, 20),
      new T.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.42, depthWrite: false }));
    inner.add(halo1);
    var halo2 = new T.Mesh(new T.SphereGeometry(1.72, 24, 18),
      new T.MeshBasicMaterial({ color: 0xff8a2c, transparent: true, opacity: 0.15, depthWrite: false }));
    inner.add(halo2);

    var rays = [];
    var rayMat = new T.MeshBasicMaterial({
      color: 0xffe9b0, transparent: true, opacity: 0.52, depthWrite: false, side: T.DoubleSide
    });
    for (var i = 0; i < 8; i++) {
      var len = i % 2 === 0 ? 2.35 : 1.70;
      var sh = new T.Shape();
      sh.moveTo(-0.075, 0); sh.lineTo(0.075, 0); sh.lineTo(0, len); sh.closePath();
      var rm = new T.Mesh(new T.ShapeGeometry(sh), rayMat);
      rm.position.z = -0.45;
      rm.rotation.z = i / 8 * Math.PI * 2;
      inner.add(rm);
      rays.push(rm);
    }
    var light = new T.PointLight(0xffb45c, 16, 18, 2);
    g.add(light);

    return {
      root: g,
      update: function (dt, t) {
        core.scale.setScalar(1 + Math.sin(t * 1.7) * 0.035);
        halo1.scale.setScalar(1 + Math.sin(t * 1.1 + 0.6) * 0.06);
        halo2.scale.setScalar(1 + Math.sin(t * 0.8 + 1.4) * 0.05);
        inner.rotation.z = t * 0.08;
        rays.forEach(function (r, i) { r.scale.y = 0.86 + Math.sin(t * 2.2 + i * 0.8) * 0.14; });
        light.intensity = 18 + Math.sin(t * 1.7) * 3.5;
      },
      dispose: function () {}
    };
  }

  /* ---- 目：一只横置的眼睛 ---- */
  function propMue(T) {
    var g = new T.Group();
    var inner = new T.Group();
    inner.scale.setScalar(0.82);
    g.add(inner);
    var rim = new T.Mesh(
      new T.TorusGeometry(1.02, 0.145, 14, 56),
      new T.MeshStandardMaterial({ color: 0xe4d6b8, roughness: 0.72, metalness: 0.04 })
    );
    rim.scale.set(1.32, 0.78, 1);
    inner.add(rim);

    var white = new T.Mesh(
      new T.SphereGeometry(0.98, 28, 20),
      new T.MeshStandardMaterial({
        color: 0xf2ece0, roughness: 0.42, metalness: 0,
        emissive: new T.Color(0x2a2418), emissiveIntensity: 0.16
      })
    );
    white.scale.set(1.26, 0.60, 0.46);
    white.position.z = -0.06;
    inner.add(white);

    var iris = new T.Mesh(
      new T.SphereGeometry(0.34, 24, 18),
      new T.MeshStandardMaterial({ color: 0x2a2018, roughness: 0.3, metalness: 0.12 })
    );
    iris.scale.set(1, 1, 0.6);
    iris.position.z = 0.24;
    inner.add(iris);
    var pupil = new T.Mesh(new T.SphereGeometry(0.155, 18, 14), new T.MeshBasicMaterial({ color: 0x07060a }));
    pupil.scale.set(1, 1, 0.7);
    pupil.position.z = 0.42;
    inner.add(pupil);

    var lidMat = new T.MeshStandardMaterial({ color: 0xd2c1a0, roughness: 0.8 });
    [1, -1].forEach(function (sgn) {
      var lid = new T.Mesh(new T.TorusGeometry(1.0, 0.075, 10, 40, Math.PI * 0.92), lidMat);
      lid.scale.set(1.34, 0.80, 1);
      lid.rotation.z = sgn > 0 ? 0.04 : Math.PI - 0.04;
      lid.position.z = 0.04;
      lid.position.y = sgn > 0 ? 0.10 : -0.10;
      inner.add(lid);
    });

    return {
      root: g,
      update: function (dt, t) {
        var cyc = (t % 6) / 6;
        var blink = cyc > 0.94 ? Math.abs(Math.sin((cyc - 0.94) / 0.06 * Math.PI)) : 0;
        white.scale.y = 0.60 * (1 - blink * 0.86);
        iris.scale.y = 1 - blink * 0.86;
        pupil.scale.y = 1 - blink * 0.86;
        iris.position.x = Math.sin(t * 0.5) * 0.10;
        pupil.position.x = iris.position.x;
      },
      dispose: function () {}
    };
  }

  /* ---- 鼎：方鼎（方腹、四足、双耳） ----
     原来用 LatheGeometry 旋一个圆鼎，剖面在口沿外撇，因为机位低于口沿，
     渲出来是一个"扣着盖的锅"：口沿变成一个盘，三足像三根筷子。
     方鼎的轮廓是直边——四条边、四只足、两只立耳，辨识度比圆鼎高得多，
     而且全用 Box / 四棱柱就能做对，不需要靠剖面调形。 */
  function propDing(T) {
    var g = new T.Group();
    /* 白竖条的真正来源（查了整整一轮）：
       腹部任何一个面上，只要 metalness > 0，主光就会在那个面上压出一条
       贯穿上下的镜面亮线。场景没有 envMap，金属反射只剩点光/平行光，
       表现成一条无法用几何消除的亮条 —— 染蓝腹、染绿纹带、flatShading、
       关掉鼎自己的点光，它都不动；只关掉**场景所有灯**换成纯环境光，
       它立刻消失；把 metalness 归零、roughness 拉满，亮度从 211 掉到 177，
       和腹面 172 齐平。到此定案。
       所以这一组材质一律 metalness = 0：青铜色靠漫反射 + 一点自发光说，
       跟山、树、太阳那些扁平插画风物件也统一。 */
    var bronze = new T.MeshStandardMaterial({
      color: 0x424a27, roughness: 0.98, metalness: 0.0,
      emissive: new T.Color(0x171b09), emissiveIntensity: 0.30
    });
    var rimMat = new T.MeshStandardMaterial({
      color: 0x4f5730, roughness: 0.95, metalness: 0.0,
      emissive: new T.Color(0x1b200b), emissiveIntensity: 0.28
    });

    /* ------------------------------------------------------------------
       全身只用 BoxGeometry，一个圆柱都不用。
       之前腹/口沿/纹带用的是 CylinderGeometry(r, r, h, 4, 1)：那是"四段圆弧
       拼出来的方柱"，法线沿圆周插值，每个平面被渲染成一段微曲面。
       真方鼎本来就是箱子，改用 Box 每个面一套独立法线，形状也正得多。 */
    var BW = 1.22, BD = 1.10;   // 腹宽 / 腹深
    var BH = 0.94;              // 腹高（上下两段之和）
    var FY = -0.72;             // 腹底基准
    var H1 = 0.42, H2 = 0.52;   // 下段（收进）/ 上段

    /* 腹：下段略窄、上段略宽，一眼是"方"的 */
    var lower = new T.Mesh(new T.BoxGeometry(BW * 0.90, H1, BD * 0.90), bronze);
    lower.position.y = FY + H1 * 0.5;
    lower.castShadow = true;
    g.add(lower);

    var upper = new T.Mesh(new T.BoxGeometry(BW, H2, BD), bronze);
    upper.position.y = FY + H1 + H2 * 0.5;
    upper.castShadow = true;
    g.add(upper);

    /* 腰线：两段接缝上一道深色纹带（饕餮纹示意）。
       整块 Box 明明白白包在腹外，两侧各凸 0.02，不存在共面打架。 */
    var bandMat = new T.MeshStandardMaterial({ color: 0x252a14, roughness: 0.96, metalness: 0.0 });
    var band = new T.Mesh(new T.BoxGeometry(BW * 1.02, 0.16, BD * 1.02), bandMat);
    band.position.y = FY + H1 - 0.02;
    band.castShadow = true;
    g.add(band);

    /* 口沿：四条窄板围成一圈方框（真实鼎的口沿就是一圈，不是一块板）。
       原来是一整块实心 Box：顶面和下面那块"口内"压暗面正好共面，
       渲出来一圈锯齿阶梯；而且整块板把口内面完全包住，等于白做。
       拆成 4 条之后口是通的，往里看见的才是暗的。 */
    var rimY = FY + BH;
    var rimW = BW * 1.08, rimD = BD * 1.08, rimT = 0.085, rimH = 0.11;
    var rimY0 = rimY + 0.006;              // 抬 6mm，避免与腹顶面共面
    [1, -1].forEach(function (s) {
      var fb = new T.Mesh(new T.BoxGeometry(rimW, rimH, rimT), rimMat);
      fb.position.set(0, rimY0 + rimH * 0.5, s * (rimD - rimT) * 0.5);
      fb.castShadow = true;
      g.add(fb);
      var lr = new T.Mesh(new T.BoxGeometry(rimT, rimH, rimD - rimT * 2), rimMat);
      lr.position.set(s * (rimW - rimT) * 0.5, rimY0 + rimH * 0.5, 0);
      lr.castShadow = true;
      g.add(lr);
    });
    /* 口内：口沿框里一块压暗的底，从上方看进去是一口，不是一块实心顶 */
    var innerMat = new T.MeshStandardMaterial({ color: 0x181b0d, roughness: 0.98, metalness: 0.0 });
    var inner = new T.Mesh(new T.BoxGeometry(rimW - rimT * 2, 0.04, rimD - rimT * 2), innerMat);
    inner.position.y = rimY + 0.035;
    g.add(inner);

    /* 四足：方柱，从四角往下撑开 */
    var offX = BW * 0.36, offZ = BD * 0.34;
    [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (q) {
      /* 0.86 长 / 贴身放，渲出来是四条桌子腿垂到画面外。收到 0.54，
         并往外站到 BW*0.36：四足撑开，鼎才"立住"。 */
      var leg = new T.Mesh(new T.BoxGeometry(0.175, 0.54, 0.175), bronze);
      leg.position.set(q[0] * offX, FY - 0.25, q[1] * offZ);
      leg.castShadow = true;
      g.add(leg);
    });

    /* 双耳：立在口沿上的 U 形（两柱一梁） */
    [1, -1].forEach(function (sgn) {
      var ex = sgn * BW * 0.44;
      var ey = rimY0 + rimH;
      var h = 0.42, w = 0.34;
      [-1, 1].forEach(function (k) {
        var post = new T.Mesh(new T.BoxGeometry(0.10, h, 0.10), rimMat);
        post.position.set(ex + k * w * 0.5, ey + h * 0.5, 0);
        post.castShadow = true;
        g.add(post);
      });
      var beam = new T.Mesh(new T.BoxGeometry(w + 0.10, 0.10, 0.10), rimMat);
      beam.position.set(ex, ey + h, 0);
      beam.castShadow = true;
      g.add(beam);
    });

    /* 原来这里贴了一面朝向 +z 的高光平面。鼎自身要绕 y 慢转，
       那面平面跟着转，转到侧面就变成一块竖着的白板挂在鼎边上。
       直接删掉：材质本身的金属高光已经够了。 */

    return {
      root: g,
      update: function (dt, t) {
        g.rotation.y = Math.sin(t * 0.30) * 0.26 - 0.26;
        g.position.y = 1.68 + Math.sin(t * 0.8) * 0.030;
      },
      dispose: function () {}
    };
  }

  var PROPS = { shan: propShan, shui: propShui, mu: propMu, ri: propRi, mue: propMue, ding: propDing };

  var _disc = null;
  function softDiscTex() {
    if (_disc) { return _disc; }
    var N = 128;
    var cv = App.stage3d.canvas(N, N), c = cv.getContext('2d');
    var g = c.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
    g.addColorStop(0, 'rgba(198,192,206,0.80)');
    g.addColorStop(0.45, 'rgba(190,184,200,0.40)');
    g.addColorStop(1, 'rgba(184,178,196,0)');
    c.fillStyle = g;
    c.beginPath(); c.arc(N / 2, N / 2, N / 2, 0, Math.PI * 2); c.fill();
    _disc = App.stage3d.tex(cv, 1);
    return _disc;
  }

  var _haze = null;
  function hazeTex() {
    if (_haze) { return _haze; }
    var cv = App.stage3d.canvas(128, 32), c = cv.getContext('2d');
    var gd = c.createLinearGradient(0, 0, 0, 32);
    gd.addColorStop(0, 'rgba(190,182,168,0)');
    gd.addColorStop(0.55, 'rgba(190,182,168,0.55)');
    gd.addColorStop(1, 'rgba(176,166,150,0.88)');
    c.fillStyle = gd; c.fillRect(0, 0, 128, 32);
    _haze = App.stage3d.tex(cv, 1);
    return _haze;
  }

  /* ==========================================================================
     骨片
     ========================================================================== */

  /* 不规则碎片轮廓。
     stage3d.bonePlateGeo 是 22 边、半径只波动 ±7% 的圆片 —— 那是"骨版"（Boss 那块整骨），
     不是"碎片"。真正的甲骨残片是断口参差的薄片：边少、起伏大、偶尔凹进去一块。
     这里单独做一个：11~14 边，半径 0.80~1.06，再随机挖 1~2 个缺口。 */
  function shardGeo(T, w, h, depth, seed) {
    var R = App.stage3d.rnd(seed || 3);
    var sh = new T.Shape();
    var N = 11 + Math.floor(R() * 4);
    var pts = [];
    for (var i = 0; i < N; i++) {
      var a = i / N * Math.PI * 2 + (R() - 0.5) * 0.20;
      var r = 0.80 + R() * 0.26;
      /* 一两个缺口：断口就在这里，比整圈均匀起伏更像碎片 */
      if (R() < 0.16) { r *= 0.70; }
      pts.push([Math.cos(a) * w * 0.5 * r, Math.sin(a) * h * 0.5 * r]);
    }
    sh.moveTo(pts[0][0], pts[0][1]);
    for (var j = 1; j < N; j++) { sh.lineTo(pts[j][0], pts[j][1]); }
    sh.closePath();
    var g = new T.ExtrudeGeometry(sh, {
      depth: depth, bevelEnabled: true,
      bevelThickness: depth * 0.46, bevelSize: Math.min(w, h) * 0.026,
      bevelSegments: 2, curveSegments: 1, steps: 1
    });
    g.center();
    return g;
  }

  function boneMat(T, seed, glow) {
    return new T.MeshStandardMaterial({
      map: App.stage3d.boneTex(seed),
      /* 0xd8c9ab + 强光 = 纯白纸片。压到 0xbfae8e，正面才有"旧骨"的暖灰，
         主光落上去不会烧成一片白。 */
      color: 0xb2a080, roughness: 0.90, metalness: 0.02,
      emissive: new T.Color(0x3e2a14),
      emissiveIntensity: glow == null ? 0.10 : glow,
      transparent: true, opacity: 1
    });
  }
  function boneSideMat(T, seed) {
    return new T.MeshStandardMaterial({
      map: App.stage3d.boneTex(seed + 101),
      /* 侧壁要比正面暗一大截：同色的话骨片就是一张纸，
         有没有厚度完全看不出来。 */
      color: 0x6a5638, roughness: 0.95, metalness: 0,
      emissive: new T.Color(0x1d1207), emissiveIntensity: 0.04,
      transparent: true, opacity: 1
    });
  }

  function makePlate(T, data, size, seed) {
    var grp = new T.Group();
    var depth = size * 0.20;
    var geo = shardGeo(T, size, size * 1.16, depth, seed);
    var body = new T.Mesh(geo, [boneMat(T, seed, 0.13), boneSideMat(T, seed)]);
    body.castShadow = true;
    body.receiveShadow = true;
    grp.add(body);

    var glyphs = [];
    var fz = depth * 0.5 + depth * 0.42 + 0.006;
    if (App.worldGlyph && App.worldGlyph.hasGlyph(data.ch)) {
      var gm = App.worldGlyph.glyphMesh(data.ch, size * 0.52, {
        color: 0x241a0e, emissive: 0xffb264, glow: 0.04
      });
      if (gm) {
        gm.position.z = fz;
        grp.add(gm);
        glyphs.push(gm);
        var gm2 = gm.clone();
        gm2.position.z = -fz;
        gm2.rotation.y = Math.PI;
        grp.add(gm2);
        glyphs.push(gm2);
      }
    }
    grp.userData.pickable = true;
    grp.userData.plateData = data;
    grp.userData.glyphs = glyphs;
    grp.userData.op = 1;
    return grp;
  }

  function setGlyphGlow(grp, v) {
    var gs = grp.userData.glyphs || [];
    for (var i = 0; i < gs.length; i++) {
      gs[i].traverse(function (m) {
        if (m.material && !Array.isArray(m.material) && m.material.emissiveIntensity != null) {
          m.material.emissiveIntensity = v;
        }
      });
    }
  }

  /* ==========================================================================
     背景空间
     ========================================================================== */
  function skyDome(st, stops) {
    var T = st.T;
    var cv = App.stage3d.canvas(8, 256), c = cv.getContext('2d');
    var g = c.createLinearGradient(0, 0, 0, 256);
    for (var i = 0; i < stops.length; i++) { g.addColorStop(stops[i][0], stops[i][1]); }
    c.fillStyle = g; c.fillRect(0, 0, 8, 256);
    var tx = App.stage3d.tex(cv, 1);
    var dome = new T.Mesh(
      new T.SphereGeometry(150, 32, 24),
      new T.MeshBasicMaterial({ map: tx, side: T.BackSide, depthWrite: false, fog: false })
    );
    st.scene.add(dome);
    st.dome = dome;
    return dome;
  }

  function farHills(st, rIn, rOut, n, hMin, hMax, color, seed) {
    var T = st.T, R = App.stage3d.rnd(seed || 11);
    var g = new T.Group();
    for (var i = 0; i < n; i++) {
      var a = i / n * Math.PI * 2 + R() * 0.26;
      var rr = rIn + R() * (rOut - rIn);
      var h = hMin + R() * (hMax - hMin);
      var rad = h * (0.55 + R() * 0.5);
      var m = new T.Mesh(
        new T.ConeGeometry(rad, h, 6, 1),
        new T.MeshStandardMaterial({ color: color, roughness: 1, metalness: 0, flatShading: true })
      );
      m.position.set(Math.cos(a) * rr, -7.2 + h * 0.40, Math.sin(a) * rr);
      m.rotation.set((R() - 0.5) * 0.12, R() * 6.28, (R() - 0.5) * 0.12);
      g.add(m);
    }
    st.scene.add(g);
    return g;
  }

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
    var pts = new T.Points(geo, new T.PointsMaterial({
      color: color, size: 0.11, sizeAttenuation: true,
      transparent: true, opacity: 0.55, depthWrite: false
    }));
    st.scene.add(pts);
    return pts;
  }

  /* 雾海贴图：几十个软边圆叠一层，再压暗边缘。
     用 Canvas 现画，比引入一张 2MB 的云 PNG 划算。 */
  var _cloud = null;
  function cloudTex() {
    if (_cloud) { return _cloud; }
    var N = 256;
    var cv = App.stage3d.canvas(N, N), c = cv.getContext('2d');
    var R = App.stage3d.rnd(77);
    c.clearRect(0, 0, N, N);
    for (var i = 0; i < 120; i++) {
      var x = R() * N, y = R() * N;
      var r = 14 + R() * 46;
      var g = c.createRadialGradient(x, y, 0, x, y, r);
      var a = 0.05 + R() * 0.10;
      g.addColorStop(0, 'rgba(196,186,204,' + a + ')');
      g.addColorStop(1, 'rgba(196,186,204,0)');
      c.fillStyle = g;
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    }
    /* 中心亮、边缘淡：叠在山脚才像"雾从下面涌上来" */
    var vg = c.createRadialGradient(N / 2, N / 2, N * 0.12, N / 2, N / 2, N * 0.54);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.85)');
    c.globalCompositeOperation = 'destination-out';
    c.fillStyle = vg; c.fillRect(0, 0, N, N);
    c.globalCompositeOperation = 'source-over';
    _cloud = App.stage3d.tex(cv, 1);
    return _cloud;
  }

  /* 雾海：脚下很远处的一层云，让骨片"浮"而不是"贴" */
  function cloudSea(st) {
    var T = st.T;
    var g = new T.Group();
    [[0, -3.05, 0, 78], [0, -2.45, 0, 52], [-14, -2.75, 12, 46], [16, -2.85, -10, 44]].forEach(function (c, i) {
      var m = new T.Mesh(
        new T.PlaneGeometry(c[3], c[3] * 0.72),
        new T.MeshBasicMaterial({
          map: cloudTex(), transparent: true, depthWrite: false,
          opacity: i === 0 ? 0.62 : 0.42, color: 0x8f87a0
        })
      );
      m.rotation.x = -Math.PI / 2;
      m.position.set(c[0], c[1], c[2]);
      m.userData.ph = i * 1.7;
      g.add(m);
    });
    st.scene.add(g);
    return g;
  }

  /* ---------------------------------------------------------------
     远景星尘背景板：用 qwen/SDXL 出的那张"星河"当远景，
     叠在雾与远山之后，给夜空一条缓慢流动的金色光带。
     读不到图就整段跳过 —— 不因为缺一张贴图让场景变黑。
     --------------------------------------------------------------- */
  /* 星空顶：程序化的星点，不用贴图 ——
     两层星（细碎的白 + 少量偏金的），撒在半径 120 的球面上。
     深底 + 细星就是"星空顶"，不会带进任何底色。 */
  function starVeil(st) {
    var T = st.T;
    var rnd = (function (seed) {
      return function () {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x7fffffff;
      };
    })(20261030);

    var sky = new T.Group();
    st.scene.add(sky);

    function makeStars(count, size, color, opacity) {
      var pos = new Float32Array(count * 3);
      for (var i = 0; i < count; i++) {
        /* 球面均匀分布，且只取上半球偏多（脚下不需要星） */
        var u = rnd() * 2 - 1;
        var phi = rnd() * Math.PI * 2;
        var r = 120;
        var y = u;   /* 全向铺开：脚下也是星 */
        var k = Math.sqrt(1 - y * y);
        pos[i * 3] = Math.cos(phi) * k * r;
        pos[i * 3 + 1] = y * r;
        pos[i * 3 + 2] = Math.sin(phi) * k * r;
      }
      var geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.BufferAttribute(pos, 3));
      var mat = new T.PointsMaterial({
        color: color, size: size, sizeAttenuation: false,
        transparent: true, opacity: opacity, depthWrite: false, fog: false
      });
      var pts = new T.Points(geo, mat);
      sky.add(pts);
      return pts;
    }

    makeStars(1400, 1.4, 0xe8eeff, 0.85);
    makeStars(220, 2.2, 0xffe6bd, 0.9);

    /* 只转星顶，不转场景：极慢，像天在动而不是地在转 */
    st.onTick(function (dt) {
      sky.rotation.y += dt * 0.0025;
    });
  }



  /* 观星台脚下的一层暖光：让"台"从地面浮起来，而不是贴在地上 */
  function altarGlow(st, y) {
    var T = st.T;
    var cv = App.stage3d.canvas(256, 256), c = cv.getContext('2d');
    var g = c.createRadialGradient(128, 128, 8, 128, 128, 124);
    g.addColorStop(0, 'rgba(255,214,150,.55)');
    g.addColorStop(0.45, 'rgba(220,170,110,.20)');
    g.addColorStop(1, 'rgba(220,170,110,0)');
    c.fillStyle = g; c.beginPath(); c.arc(128, 128, 126, 0, 6.2832); c.fill();
    var mat = new T.MeshBasicMaterial({
      map: App.stage3d.tex(cv), transparent: true, depthWrite: false,
      blending: T.AdditiveBlending, fog: false, toneMapped: false
    });
    var m = new T.Mesh(new T.PlaneGeometry(9.5, 9.5), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(0, y, 0);
    st.scene.add(m);
    return m;
  }

  /* ---------------------------------------------------------------
     观星台：这一关的空间中心。
     三层石台 + 一圈矮栏 + 台面刻环；骨片绕着它浮。
     全部程序化几何，不用模型文件，控制包体与加载时间。
     --------------------------------------------------------------- */
  function observatory(st) {
    var T = st.T;
    var g = new T.Group();
    g.name = 'observatory';

    var stone = new T.MeshStandardMaterial({
      color: 0x6d5940, roughness: 0.94, metalness: 0.02
    });
    var stoneTop = new T.MeshStandardMaterial({
      color: 0x8a7350, roughness: 0.86, metalness: 0.04,
      emissive: new T.Color(0x2a1c0c), emissiveIntensity: 0.14
    });
    var brass = new T.MeshStandardMaterial({
      color: 0x8f7444, roughness: 0.55, metalness: 0.55,
      emissive: new T.Color(0x2a1e0c), emissiveIntensity: 0.2
    });

    function disc(rTop, rBot, h, y, mat) {
      var m = new T.Mesh(new T.CylinderGeometry(rTop, rBot, h, 44), mat);
      m.position.y = y;
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
      return m;
    }

    /* 三层台阶，越往上越小 */
    disc(2.42, 2.62, 0.34, -2.02, stone);
    disc(1.86, 2.06, 0.30, -1.70, stone);
    disc(1.28, 1.42, 0.28, -1.41, stoneTop);

    /* 台面 + 台面外圈铜环（"观星"的那道环） */
    disc(1.02, 1.10, 0.14, -1.20, stoneTop);
    var ring = new T.Mesh(new T.TorusGeometry(1.12, 0.035, 8, 64), brass);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -1.12;
    g.add(ring);

    /* 八根矮栏柱：围出"台"的边界，也给画面加竖向节奏 */
    for (var i = 0; i < 8; i++) {
      var a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      var post = new T.Mesh(new T.CylinderGeometry(0.055, 0.07, 0.46, 10), stone);
      post.position.set(Math.cos(a) * 1.72, -1.34, Math.sin(a) * 1.72);
      post.castShadow = true;
      g.add(post);
      var cap = new T.Mesh(new T.SphereGeometry(0.075, 10, 8), brass);
      cap.position.set(Math.cos(a) * 1.72, -1.09, Math.sin(a) * 1.72);
      g.add(cap);
    }

    /* 台面正中一枚浅浅的刻环：镜头推近时能看出这不是一块普通圆盘 */
    var mark = new T.Mesh(new T.TorusGeometry(0.62, 0.012, 6, 48), brass);
    mark.rotation.x = Math.PI / 2;
    mark.position.y = -1.126;
    g.add(mark);

    st.scene.add(g);
    return g;
  }

  function stoneDeck(st) {
    var T = st.T;
    var g = new T.Group();
    var deck = new T.Mesh(
      shardGeo(T, 2.35, 1.80, 0.34, 31),
      new T.MeshStandardMaterial({
        /* 原来是 7.4×5.0 的浅驼色台面，在主光下亮成一块饼干，还挡住龟宝半身。
           缩小、压到接近黑石，它才退成"地"而不是抢戏的物件。 */
        color: 0x191410, roughness: 0.97, metalness: 0,
        emissive: new T.Color(0x080605), emissiveIntensity: 0.06
      })
    );
    deck.rotation.x = -Math.PI / 2;
    deck.position.set(-2.05, -2.42, 2.15);
    deck.receiveShadow = true;
    g.add(deck);
    var under = new T.Mesh(
      shardGeo(T, 1.85, 1.40, 0.62, 37),
      new T.MeshStandardMaterial({ color: 0x14110d, roughness: 1, metalness: 0 })
    );
    under.rotation.x = -Math.PI / 2;
    under.position.set(-2.05, -2.82, 2.15);
    g.add(under);
    st.root.add(g);
    return g;
  }

  /* ==========================================================================
     场景装配
     ========================================================================== */
  function build(st) {
    var T = st.T;
    st.renderer.toneMappingExposure = 1.02;
    if (st.lights) {
      st.lights.hemi.intensity = 0.19;
      st.lights.hemi.color = new T.Color(0x9fb0cc);
      st.lights.hemi.groundColor = new T.Color(0x4a3a26);
      st.lights.sun.intensity = 0.38;
      st.lights.fill.intensity = 0.16;
      st.lights.sun.castShadow = true;
      var shd = st.lights.sun.shadow;
      shd.camera.left = -16; shd.camera.right = 16;
      shd.camera.top = 16; shd.camera.bottom = -16;
      shd.camera.near = 1; shd.camera.far = 70;
      shd.camera.updateProjectionMatrix();
      shd.bias = -0.0006; shd.normalBias = 0.04;
      if (shd.map) { shd.map.dispose(); shd.map = null; }
    }
    /* 雾色不能几乎是黑的：山色与雾色都接近黑，混出来还是一团黑，
       三层远山就退成一张剪纸。雾提到紫灰，山才有远近浓淡。 */
    st.scene.fog = new T.FogExp2(0x0b1220, 0.0175);
    /* 星空顶：中性深蓝偏黑，不要再偏紫 —— 紫一多就像"宇宙风"，
       这一关要的是"夜里站在台上"，不是太空海报。 */
    skyDome(st, [
      [0.00, '#05070e'], [0.30, '#080c18'], [0.46, '#0b1120'],
      [0.500, '#0d1424'], [0.540, '#0a1020'], [1.00, '#06080f']
    ]);

    /* 三层远山：近深远淡，雾把它们分开 —— 才有"层叠"，不是一排剪影 */
    /* 山色必须比雾色（0x2a2233）更深：雾里的山是"暗影"，
       比雾还亮就成了前排的浅紫塔，把骨片压下去。 */
    /* 这一关改成纯星空环境：不再画山。
       山会把画面拉回"地面风景"，而这里要的是"浮在星海里的一块台"。 */

    stoneDeck(st);
    cloudSea(st);
    /* 云海只留很薄一层，当"浮台下的雾"，不要挡住星 */
    starVeil(st);
    var altar = observatory(st);
    altarGlow(st, -1.98);

    /* 六片骨绕观星台排成一圈：高度错开，前低后高，
       每片都朝向圆心 —— 这样镜头在原地看着的是"围起来的场"，不是一排浮板。 */
    var RING_R = 6.90;
    /* 站到中间看，骨片就不能都在一个水平面上：
       远、近、高、低错开，抬头是一层、平视是一层，才像"星"而不是"围栏"。 */
    var RING = [
      { a:  -96, y: 0.25, s: 1.05 },   // 左 · 低
      { a:  -34, y: 2.35, s: 0.92 },   // 左前 · 高（要抬头）
      { a:   26, y: 0.95, s: 0.98 },   // 右前 · 平视
      { a:   88, y: 3.05, s: 0.86 },   // 右 · 更高
      { a:  148, y: 0.45, s: 1.00 },   // 右后 · 低
      { a:  208, y: 1.75, s: 0.90 }    // 左后 · 中高
    ];
    var LAYOUT = RING.map(function (r) {
      var rad = r.a * Math.PI / 180;
      var x = Math.cos(rad) * RING_R;
      var z = Math.sin(rad) * RING_R * 0.92;
      return {
        x: x, y: r.y, z: z,
        /* 骨片正面朝镜头：环是环，但字得看得见。
           完全朝圆心会让左右两片变成"侧立的骨板"，只剩一条厚边。 */
        ry: Math.atan2(-x, -z),   /* 初始朝向圆心（镜头就在圆心） */
        s: r.s
      };
    });

    var plates = [];
    for (var i = 0; i < PLATES.length; i++) {
      var L = LAYOUT[i];
      var grp = makePlate(T, PLATES[i], 1.52, 60 + i * 7);
      grp.position.set(L.x, L.y, L.z);
      grp.rotation.y = L.ry;
      grp.rotation.z = (i % 2 ? 1 : -1) * 0.035;
      grp.scale.setScalar(L.s);
      grp.userData.base = {
        x: L.x, y: L.y, z: L.z, ry: L.ry, s: L.s,
        rz: grp.rotation.z, ph: i * 1.19,
        r: Math.sqrt(L.x * L.x + L.z * L.z),        /* 到圆心的半径 */
        a0: Math.atan2(L.z, L.x)                    /* 环上的起始角 */
      };
      grp.userData.ang = grp.userData.base.a0;
      st.root.add(grp);
      plates.push(grp);
    }
    S.plates = plates;
    /* 初始：六片骨上都看不到字，必须点了才显 */
    plates.forEach(function (p) { setGlyphAlpha(p, 0.03); });

    /* 暖主光从左上前，冷边光从右下后：两盏才夹得出骨片的厚度 */
    var key = new T.PointLight(0xffb877, 9.5, 26, 2);
    key.position.set(-3.4, 5.2, 4.2);
    st.scene.add(key);
    var rim = new T.PointLight(0x7f9ad0, 8, 26, 2);
    rim.position.set(4.6, 0.6, -5.2);
    st.scene.add(rim);

    /* 头灯：人站在台心环视，背对主光的骨片会是纯黑的一块。
       给镜头挂一盏柔和的暖光，看到哪、哪就亮。 */
    var head = new T.PointLight(0xffe0b4, 2.6, 16, 2);
    head.position.set(0, 1.34, 0);
    st.scene.add(head);
    S.headLight = head;

    dust(st, 380, 8, 32, 0xd8c49a);
    /* 第二层浮尘：更密、更亮、范围更大 —— "繁星流转"靠这一层 */
    dust(st, 620, 12, 46, 0xe8c68a);

    var plot = new T.Group();
    st.root.add(plot);
    S.plot = plot;

    /* 0.92 是给立体龟定的：那模型只有 0.909 高，再大就显得笨。
       2D 立绘细节多、轮廓窄，同样高度在满屏骨片里只有五十来像素，
       小得看不出是只龟。放到 1.18，画面里约七十像素，才认得出。 */
    var gb = SHOW_GB ? App.stage3d.makeGuibao(T, { scale: 1.18 }) : null;
    if (gb) {
      /* 踏石顶面实测在 y = -2.094。原来写 -2.24，比石面低 0.146 ——
         立体龟只是小腿埋进石头里，看不出来；换成 2D 立牌就是整截脚被切掉。
         摆到石面上。 */
      /* 站到观星台台面上：台顶面在 y = -1.13，龟宝脚底对齐 */
      /* 人站在台心，龟宝要偏到侧前方，低头或侧头才看得见 */
      gb.root.position.set(1.05, -1.13, 1.15);
      gb.root.rotation.y = -0.55;
      st.root.add(gb.root);
      S.guibao = gb;
    }

    /* 第一人称：人就站在观星台台面上，视线高度 1.25 */
    st.camera.position.set(0, 1.34, 0);
    S.look = { yaw: 0.42, pitch: -0.04 };
    S.lookLock = false;
    applyLook(st);
  }

  /* ==========================================================================
     交互
     ========================================================================== */
  /* ============================================================
     第一人称视角
     ------------------------------------------------------------
     镜头固定在观星台中心，只用 yaw/pitch 环视 —— 玩家是"站在台上的人"，
     不是"在外面看这一圈的人"。骨片绕着人转，抬头就有高的那两片。
     ============================================================ */
  function lookDir(T, look) {
    var cp = Math.cos(look.pitch);
    return new T.Vector3(Math.sin(look.yaw) * cp, Math.sin(look.pitch), Math.cos(look.yaw) * cp);
  }

  function applyLook(st) {
    if (!st || !S.look) { return; }
    var T = st.T;
    var d = lookDir(T, S.look);
    st.camera.position.set(0, 1.34, 0);
    st.camera.lookAt(d.multiplyScalar(6).add(st.camera.position));
    S.forward = lookDir(T, S.look);
  }

  /* 拖拽环视。点一下（位移 < 6px）仍然走拾取，拖动的这一下不算点击。 */
  function bindLook(st) {
    var drag = null;
    st.el.addEventListener('pointerdown', function (e) {
      drag = { x: e.clientX, y: e.clientY, moved: 0 };
      if (st.el.setPointerCapture && e.pointerId != null) {
        try { st.el.setPointerCapture(e.pointerId); } catch (err) {}
      }
    });
    st.el.addEventListener('pointermove', function (e) {
      if (!drag) { return; }
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX; drag.y = e.clientY;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      if (S.lookLock || S.mode !== 'idle') { return; }
      S.look.yaw += dx * 0.0056;
      S.look.pitch = Math.max(-1.15, Math.min(1.15, S.look.pitch - dy * 0.0056));
    });
    var end = function () { drag = null; };
    /* 滚轮缩放：看细节时能拉近，看全貌时能退开 */
    st.el.addEventListener('wheel', function (e) {
      e.preventDefault();
      if (S.lookLock) { return; }
      var cam = st.camera;
      cam.fov = Math.max(30, Math.min(72, (cam.fov || 48) + (e.deltaY > 0 ? 3 : -3)));
      cam.updateProjectionMatrix();
    }, { passive: false });

    st.el.addEventListener('pointerup', end);
    st.el.addEventListener('pointercancel', end);
    st.el.addEventListener('pointerleave', end);
  }

  /* ============================================================
     骨面虚影
     ------------------------------------------------------------
     生成的实物图不是另立一块牌子，而是"投影在骨面上"：
       图 → 画布加径向 alpha 羽化 → 贴到骨片正面的 UV 平面
     这样字与物在同一块骨上，才像拓片上的层叠。
     ============================================================ */
  var GHOST_SRC = {
    shan: 'assets/gen/obj_shan.png',
    shui: 'assets/gen/obj_shui.png',
    mu:   'assets/gen/obj_mu.png',
    ri:   'assets/gen/obj_ri.png',
    mue:  'assets/gen/obj_mue.png',
    ding: 'assets/gen/obj_ding.png'
  };
  var _ghostCache = {};

  function ghostTexture(st, key) {
    if (_ghostCache[key]) { return _ghostCache[key]; }
    var tex = st.T ? null : null;
    return null;   /* 真正的加载走 ghostOn 的异步路径 */
  }

  function softMaskTexture(st, img) {
    var T = st.T;
    var N = 512;
    var cv = App.stage3d.canvas(N, N);
    var c = cv.getContext('2d');
    c.clearRect(0, 0, N, N);
    /* 先铺图（cover 裁成正方形），再用径向渐变把四周擦掉 */
    var side = Math.min(img.width, img.height);
    var sx = (img.width - side) / 2, sy = (img.height - side) / 2;
    c.drawImage(img, sx, sy, side, side, 0, 0, N, N);
    c.globalCompositeOperation = 'destination-in';
    var g = c.createRadialGradient(N / 2, N / 2, N * 0.16, N / 2, N / 2, N * 0.50);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.62, 'rgba(255,255,255,.92)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.beginPath(); c.arc(N / 2, N / 2, N * 0.52, 0, 6.2832); c.fill();
    c.globalCompositeOperation = 'source-over';
    var tex = App.stage3d.tex(cv);
    return tex;
  }

  /* 有虚影时，字要"让路"：
     原来字是深褐实心（0x241a0e），压在鼎/眼上就是一块黑。
     这里把字改成浅骨色 + 38% 不透明 + 不写深度，变成"淡描"，
     物的轮廓就能透过来 —— 读完字再看物，两层都在。 */
  function setGlyphGhostMode(grp, on) {
    /* 叠在实物上的字：加色混合、低不透明度 —— 只"加一层金光"，
       不会把鼎/眼睛糊住；离场时逐项还原。 */
    var T = S.st && S.st.T;
    var gs = grp.userData.glyphs || [];
    for (var k = 0; k < gs.length; k++) {
      gs[k].traverse(function (m) {
        if (!m.material || Array.isArray(m.material)) { return; }
        var mat = m.material;
        if (on) {
          if (!m.userData._origMat) {
            m.userData._origMat = {
              color: mat.color ? mat.color.clone() : null,
              emissive: mat.emissive ? mat.emissive.clone() : null,
              emissiveIntensity: mat.emissiveIntensity,
              opacity: mat.opacity,
              transparent: mat.transparent,
              depthWrite: mat.depthWrite,
              blending: mat.blending
            };
            m.material = mat.clone();
            mat = m.material;
          }
          if (mat.color) { mat.color.setHex(0xffc27a); }
          if (mat.emissive) { mat.emissive.setHex(0xff8a34); }
          if (mat.emissiveIntensity != null) { mat.emissiveIntensity = 0.55; }
          mat.transparent = true;
          mat.opacity = 0.36;
          mat.depthWrite = false;
          if (T) { mat.blending = T.AdditiveBlending; }
          m.renderOrder = 6;   /* 画在实物之后，才能在"上面"加光 */
        } else if (m.userData._origMat) {
          var o = m.userData._origMat;
          if (o.color && mat.color) { mat.color.copy(o.color); }
          if (o.emissive && mat.emissive) { mat.emissive.copy(o.emissive); }
          if (o.emissiveIntensity != null) { mat.emissiveIntensity = o.emissiveIntensity; }
          mat.transparent = o.transparent;
          mat.opacity = o.opacity;
          mat.depthWrite = o.depthWrite;
          if (o.blending != null) { mat.blending = o.blending; }
          m.renderOrder = 0;
          m.userData._origMat = null;
        }
      });
    }
  }



  function ghostOn(grp, d) {
    var st = S.st;
    var T = st.T;
    var key = d.make;
    var src = GHOST_SRC[key];
    if (!src) { return; }
    if (grp.userData.ghost) { return; }

    function build(tex) {
      if (S.focus !== grp) { return; }
      var mat = new T.MeshBasicMaterial({
        map: tex, transparent: true, opacity: 0,
        depthWrite: false, fog: false, toneMapped: false
      });
      /* 骨片本体约 1.52 宽、1.76 高，虚影略小一圈，四边留出骨面。
         关键：虚影必须落在骨面"之上"、字"之下" ——
         骨面在 z≈0.15~0.25（有倒角微凸），字在 fz≈0.286。
         一开始放到 0.20 被骨面挡住，所以只看得到字、看不到虚影。 */
      /* 骨片是带倒角的挤出体，实测正面最高点 z≈0.292（不是 0.15）。
         所以直接用几何包围盒算：贴在"骨面最高点之上 1.8cm"，
         虚影就压在字前面一点点，字透过 58% 的透明度还看得见。 */
      var body = grp.children[0];
      var faceZ = 0.30;
      if (body && body.geometry) {
        body.geometry.computeBoundingBox();
        var bb = body.geometry.boundingBox;
        if (bb && bb.max) { faceZ = bb.max.z + 0.018; }
      }
      var pw = 1.30, ph = 1.46;
      var plane = new T.Mesh(new T.PlaneGeometry(pw, ph), mat);
      plane.position.set(0, 0.02, faceZ + 0.06);
      plane.renderOrder = 4;
      grp.add(plane);
      grp.userData.ghost = plane;
      setGlyphGhostMode(grp, true);

      /* 淡入到 0.62：看得清是"虚影"，又不遮掉字 */
      var t0 = performance.now();
      (function fade() {
        if (!plane.parent) { return; }
        var k = Math.min(1, (performance.now() - t0) / 700);
        mat.opacity = 0.72 * (1 - Math.pow(1 - k, 3));
        if (k < 1) { requestAnimationFrame(fade); }
      })();
    }

    if (_ghostCache[key]) { build(_ghostCache[key]); return; }
    var loader = new T.TextureLoader();
    loader.load(src, function (img) {
      img.colorSpace = T.SRGBColorSpace;
      var tex = softMaskTexture(st, img.image || img);
      _ghostCache[key] = tex;
      build(tex);
    }, undefined, function () { /* 加载失败：不显示虚影，保留字形 */ });
  }

  function ghostOff(grp) {
    var g = grp && grp.userData && grp.userData.ghost;
    if (!g) { return; }
    setGlyphGhostMode(grp, false);
    var mat = g.material;
    var t0 = performance.now();
    (function fade() {
      var k = Math.min(1, (performance.now() - t0) / 420);
      mat.opacity = 0.72 * (1 - k);
      if (k < 1) { requestAnimationFrame(fade); }
      else if (g.parent) { g.parent.remove(g); }
      if (k >= 1 && grp.userData) { grp.userData.ghost = null; }
    })();
  }

  function hoverAt(ndc) {
    var st = S.st;
    if (!st || S.mode !== 'idle' || S.busy) { return; }
    var hits = st.raycast(ndc) || [];
    var target = null;
    for (var i = 0; i < hits.length; i++) {
      var o = hits[i].object || hits[i];
      while (o && !(o.userData && o.userData.plateData)) { o = o.parent; }
      if (o) { target = o; break; }
    }
    if (target === S.hovered) { return; }
    if (S.hovered) {
      var prev = S.hovered;
      var ps = prev.userData.base.s;
      tw(prev, { sx: ps, sy: ps, sz: ps }, 0.22, easeOut);
      setGlyphGlow(prev, 0.10);
      setGlyphAlpha(prev, 0.03);
    }
    S.hovered = target;
    if (target) {
      var s = target.userData.base.s;
      tw(target, { sx: s * 1.07, sy: s * 1.07, sz: s * 1.07 }, 0.22, easeBack);
      setGlyphGlow(target, 0.45);
      setGlyphAlpha(target, 0.34);
      st.el.style.cursor = 'pointer';
    } else {
      st.el.style.cursor = '';
    }
  }

  function onPick(ev) {
    if (S.busy || S.mode !== 'idle') { return; }
    var o = ev.obj;
    while (o && !(o.userData && o.userData.plateData)) { o = o.parent; }
    if (!o) { return; }
    focusPlate(o);
  }

  /* 第一幕：骨片飞到中央，其余退后 */
  function focusPlate(grp) {
    S.busy = true;
    S.mode = 'focus';
    S.stateSince = 0;
    S.focus = grp;
    S.hovered = null;
    S.st.el.style.cursor = '';

    var d = grp.userData.plateData;
    card(false);
    crumb(d.now + ' · ' + d.cat);
    say('<b>提示</b>：你点了「' + d.now + '」。看它长出什么来。', 5200);

    S.plates.forEach(function (p) {
      if (p === grp) { return; }
      var b = p.userData.base;
      tw(p, { op: 0.10, pz: b.z - 1.8, sx: b.s * 0.86, sy: b.s * 0.86, sz: b.s * 0.86 }, 0.55, easeOut);
    });

    /* 收回时要从"它现在转到的位置"回环，不是从初始角跳回去 */
    var bb = grp.userData.base;
    bb.x = grp.position.x; bb.z = grp.position.z;
    bb.a0 = grp.userData.ang;

    /* 锁视角：飞过来的骨片要停在"你正看着的那个方向"，
       否则视角一动，字就飘出画面。 */
    S.lookLock = true;
    var T2 = S.st.T;
    var f = S.forward || lookDir(T2, S.look);
    var cam = S.st.camera.position;

    /* 按实际 FOV 算"放多大、放多远"：
       骨片原始宽约 1.5，放大到 2.0 后约 3.0 米宽；
       要让它在画面里占约 55% 高度，距离 = 半宽 / tan(fov/2) / 0.55。
       上一版写死 3.05 米 + 2.62 倍，直接把骨片怼到脸上，只看得见一角。 */
    var fov = (S.st.camera.fov || 48) * Math.PI / 180;
    var plateW = 1.52 * 2.25;
    var dist = (plateW * 0.5) / Math.tan(fov / 2) / 0.58;
    dist = Math.max(4.2, Math.min(7.2, dist));

    /* 右向量：让骨片偏左一点，给实物留出右侧位置 */
    var up = new T2.Vector3(0, 1, 0);
    var right = new T2.Vector3().crossVectors(f, up).normalize();

    var tx = cam.x + f.x * dist;
    var ty = cam.y + f.y * dist + 0.02;
    var tz = cam.z + f.z * dist;

    grp.rotation.y = Math.atan2(cam.x - tx, cam.z - tz);
    tw(grp, { px: tx, py: ty, pz: tz, sx: 2.25, sy: 2.25, sz: 2.25, rz: 0 }, 0.72, easeInOut, function () {
      unveil(grp, d);
    });
  }

  /* 第二幕：字形亮起 → 景物从骨面长出来 */
  function unveil(grp, d) {
    S.mode = 'unveil';
    S.stateSince = 0;
    glyphGlowTo(grp, 1.35, 0.5);
    setGlyphAlpha(grp, 1);
    ghostOn(grp, d);
    if (App.progress && d && d.ch) { App.progress.add('float', d.ch); }
    setTimeout(function () {
      if (S.mode !== 'unveil' || S.focus !== grp) { return; }
      spawnProp(grp, d);
    }, 420);
  }

  /* 字形的透明度：未点开前几乎看不见，点开后亮起来。
     只有"点了才知道这是哪个字"——这是这一关的核心设计。 */
  function setGlyphAlpha(grp, a) {
    var gs = (grp.userData && grp.userData.glyphs) || [];
    for (var i = 0; i < gs.length; i++) {
      gs[i].traverse(function (m) {
        if (m.material && !Array.isArray(m.material)) {
          m.material.transparent = true;
          m.material.opacity = a;
          m.material.depthWrite = a > 0.5;
        }
      });
    }
  }

  function glyphGlowTo(grp, target, dur) {
    var gs = grp.userData.glyphs || [];
    var start = 0.20, t0 = performance.now();
    function step() {
      if (S.focus !== grp) { return; }
      var k = Math.min(1, (performance.now() - t0) / (dur * 1000));
      var v = start + (target - start) * easeOut(k);
      for (var i = 0; i < gs.length; i++) {
        gs[i].traverse(function (m) {
          if (m.material && !Array.isArray(m.material) && m.material.emissiveIntensity != null) {
            m.material.emissiveIntensity = v;
          }
        });
      }
      if (k < 1) { requestAnimationFrame(step); }
    }
    step();
  }

  function spawnProp(grp, d) {
    S.stateSince = 0;
    var T = S.st.T;
    /* 实物改由骨面虚影承担（ghostOn）；3D 实物模型先不生成。
       想恢复把 SHOW_3D_PROP 改 true。 */
    var SHOW_3D_PROP = false;
    var maker = SHOW_3D_PROP ? PROPS[d.make] : null;
    if (!maker) {
      /* 没有 3D 实物（虚影模式下就是这样）：仍然要进 show 态 ——
         卡片、提示、收回按钮全靠这一步。之前直接 return，
         状态卡在 unveil，6 秒后被守卫踢回 idle，收回按钮根本没出来。 */
      S.mode = 'show';
      S.stateSince = 0;
      S.busy = false;
      card(true, d);
      say('<b>提示</b>：这就是「' + d.now + '」画的东西。看完点「收回」。', 9000);
      return;
    }
    if (S.prop && S.prop.root) { S.plot.remove(S.prop.root); }

    var ctl = maker(T);
    var root = ctl.root;

    /* 实物必须出现在"你正在看的那个方向"，而不是老代码里写死的世界坐标。
       构图：骨片偏左、实物偏右，两者都在视线正前方。 */
    var cam = S.st.camera.position;
    var f = S.forward || new T.Vector3(0, 0, 1);
    var up = new T.Vector3(0, 1, 0);
    var right = new T.Vector3().crossVectors(f, up).normalize();
    var pd = 4.6;
    root.position.set(
      cam.x + f.x * pd + right.x * 1.35,
      cam.y + f.y * pd - 0.08,
      cam.z + f.z * pd + right.z * 1.35
    );
    root.rotation.y = Math.atan2(cam.x - root.position.x, cam.z - root.position.z);
    root.scale.setScalar(0.03);

    /* 跟身一盏暖光：暗场里新长出来的东西不能是黑的 */
    /* 中性白，不要暖光：暖光一打，青山变米黄三角。
       强度从 4.2 收到 1.6 —— 4.2 的时候点光离口沿太近，
       口沿顶面被blow 成米黄，跟暗绿腹壁完全不是一种金属。
       挪高一点、收弱一点，只做提亮，不做造型光。 */
    var fill = new T.PointLight(0xdce6f0, 1.6, 15, 2);
    fill.position.set(1.6, 4.6, 5.6);
    root.add(fill);

    S.plot.add(root);
    S.prop = ctl;

    tw(root, { sz: 1, sx: 1, sy: 1,
               pz: root.position.z, py: root.position.y }, 0.95, easeBack, function () {
      S.mode = 'show';
      S.stateSince = 0;
      card(true, d);
      say('<b>提示</b>：这就是「' + d.now + '」画的东西。看完点「收回」。', 9000);
      S.busy = false;
    });

    /* 骨片退到景物后面当背景 */
    /* 骨片退到景物后面当底板。
       op 不能太低：0.46 时它是一整块半透明灰玻璃，景物隔着一层雾看，
       而且骨面的字被灰糊住。0.78 才像"一块骨在景物后头"。
       尺寸也要收：2.62 倍时骨片高 4.6 米，占画面 60%，景物被挤得没地方。

       每个景物可以自己声明 fade：发光的（日）必须让骨片退得更狠，
       否则那块半透明的骨片正好糊在太阳上，太阳成了"骨片里的一个亮点"。 */
    var fo = d.fade == null ? 0.78 : d.fade;
    /* 骨片退到实物后方：沿视线再退 1.2 米，并缩小一点当背景 */
    var back = new T.Vector3().copy(S.forward || new T.Vector3(0, 0, 1)).multiplyScalar(1.25);
    tw(grp, { px: grp.position.x + back.x, py: grp.position.y + 0.03,
              pz: grp.position.z + back.z,
              op: fo, sx: 1.55, sy: 1.55, sz: 1.55 }, 0.8, easeOut);
  }

  /* 收回：景物缩回骨片，骨片飞回原位 */
  function dismiss() {
    if (S.mode !== 'show' || S.busy) { return; }
    S.busy = true;
    S.mode = 'close';
    S.stateSince = 0;
    card(false);

    var grp = S.focus;
    var root = S.prop && S.prop.root;

    if (root) {
      tw(root, { sz: 0.03, pz: 3.15 }, 0.52, easeInOut, function () {
        if (S.prop && S.prop.root) { S.plot.remove(S.prop.root); }
        S.prop = null;
      });
    }
    if (grp) {
      var b = grp.userData.base;
      tw(grp, {
        px: b.x, py: b.y, pz: b.z, ry: b.ry, rz: b.rz,
        sx: b.s, sy: b.s, sz: b.s, op: 1
      }, 0.78, easeInOut, function () {
        setGlyphGlow(grp, 0.10);
        setGlyphAlpha(grp, 0.03);
        ghostOff(grp);
        backToIdle();
      });
    } else {
      backToIdle();
    }
    S.plates.forEach(function (p) {
      if (p === grp) { return; }
      var b = p.userData.base;
      tw(p, { op: 1, pz: b.z, sx: b.s, sy: b.s, sz: b.s }, 0.66, easeOut);
    });
    S.lookLock = false;
    crumb('');
    say('<b>提示</b>：收回来了。再看看别的骨片。', 4200);
  }

  /* 强制复位。
     存在的理由：转场是用 tween 按帧推进的，如果页面被切到后台、或者机器卡到
     dt 被钳制，一段 0.9 秒的 tween 可能拖很久。玩家这时再点骨片是点不动的
     （busy 挡住了），看起来就是"卡死了"。这个函数把状态硬拉回 idle。 */
  function reset() {
    S.tweens.length = 0;
    if (S.prop && S.prop.root && S.prop.root.parent) { S.prop.root.parent.remove(S.prop.root); }
    S.prop = null;
    S.plates.forEach(function (p) {
      var b = p.userData.base;
      p.position.set(b.x, b.y, b.z);
      p.rotation.set(0, b.ry, b.rz);
      p.scale.setScalar(b.s);
      setOpacity(p, 1);
      setGlyphGlow(p, 0.10);
      setGlyphAlpha(p, 0.03);
      if (p.userData.ghost && p.userData.ghost.parent) {
        p.userData.ghost.parent.remove(p.userData.ghost);
        p.userData.ghost = null;
      }
      setGlyphGhostMode(p, false);   /* 收回/复位：字要回到深色实心 */
    });
    S.lookLock = false;
    card(false);
    crumb('');
    S.focus = null;
    S.hovered = null;
    S.mode = 'idle';
    S.busy = false;
    S.stateSince = 0;
  }

  function backToIdle() {
    S.mode = 'idle';
    S.busy = false;
    S.focus = null;
    S.stateSince = 0;
  }

  /* ==========================================================================
     DOM
     ========================================================================== */
  var CSS = [
    '.bsp-root{position:fixed;left:0;top:0;right:0;bottom:0;z-index:400;overflow:hidden;',
    'background:#0b0910;opacity:0;transition:opacity .42s ease}',
    '.bsp-root.on{opacity:1}',
    '.bsp-root canvas{position:absolute;left:0;top:0;display:block}',

    '.bsp-top{position:absolute;left:24px;top:20px;z-index:6;pointer-events:none;',
    'display:flex;align-items:baseline;gap:12px}',
    '.bsp-top::before{content:"";position:absolute;left:-20px;top:-14px;right:-30px;bottom:-14px;',
    'z-index:-1;border-radius:8px;',
    'background:linear-gradient(90deg,rgba(6,5,10,.72),rgba(6,5,10,.30) 60%,rgba(6,5,10,0))}',
    '.bsp-title{font-size:13px;letter-spacing:.32em;color:#e3d2ad;text-shadow:0 1px 3px rgba(0,0,0,.9)}',
    '.bsp-crumb{font-size:12px;letter-spacing:.12em;color:#b3a184;text-shadow:0 1px 3px rgba(0,0,0,.9)}',
    '.bsp-crumb:empty{display:none}',

    '.bsp-back{position:absolute;right:26px;top:20px;z-index:7;',
    'display:flex;align-items:center;gap:7px;padding:8px 15px;border-radius:22px;',
    'font-size:12.5px;letter-spacing:.10em;color:#d9c8a6;cursor:pointer;',
    'background:rgba(12,10,16,.62);border:1px solid rgba(214,190,150,.24);',
    'backdrop-filter:blur(6px);transition:.2s}',
    '.bsp-back:hover{color:#ffe0a8;border-color:rgba(232,200,144,.52);background:rgba(24,18,26,.82)}',

    '.bsp-card{position:absolute;left:26px;bottom:26px;width:330px;z-index:7;',
    'padding:16px 18px 15px;border-radius:12px;',
    'background:linear-gradient(160deg,rgba(20,16,24,.93),rgba(12,10,15,.90));',
    'border:1px solid rgba(214,190,150,.18);',
    'box-shadow:0 18px 46px rgba(0,0,0,.60),0 0 0 1px rgba(255,255,255,.02) inset;',
    'backdrop-filter:blur(9px);',
    'opacity:0;transform:translateY(14px);pointer-events:none;transition:opacity .38s ease,transform .38s ease}',
    '.bsp-card.on{opacity:1;transform:translateY(0);pointer-events:auto}',
    '.bsp-card .hd{display:flex;align-items:flex-end;gap:12px;margin-bottom:9px}',
    '.bsp-card .gp{font-family:"Songti SC","SimSun","Noto Serif CJK SC",serif;',
    'font-size:38px;line-height:.95;color:#f0dcb4;text-shadow:0 0 22px rgba(255,180,90,.34)}',
    '.bsp-card .nx{font-size:12px;color:#9a8a6c;letter-spacing:.1em;padding-bottom:5px}',
    '.bsp-card .nx b{color:#d9c39a;font-weight:400}',
    '.bsp-card .tag{margin-left:auto;font-size:10.5px;letter-spacing:.14em;color:#8d7a58;',
    'padding:2px 8px;border-radius:9px;background:rgba(255,255,255,.05)}',
    '.bsp-card .gl{font-size:12.8px;line-height:1.78;color:#c2b096;margin-bottom:8px}',
    '.bsp-card .lk{font-size:12px;line-height:1.72;color:#9b8a70;',
    'padding-top:8px;border-top:1px solid rgba(255,255,255,.07)}',
    '.bsp-card .lk::before{content:"字形与实物　";color:#7d6c52;letter-spacing:.1em}',
    '.bsp-card button{margin-top:12px;width:100%;padding:9px 0;border-radius:8px;cursor:pointer;',
    'font-size:12.5px;letter-spacing:.16em;color:#f0dcb4;',
    'background:rgba(255,206,140,.10);border:1px solid rgba(255,206,140,.30);transition:.2s}',
    '.bsp-card button:hover{background:rgba(255,206,140,.19);border-color:rgba(255,206,140,.55)}',

    '.bsp-hint{position:absolute;left:50%;bottom:28px;transform:translateX(-50%);z-index:7;',
    'max-width:min(620px,52vw);padding:10px 20px;border-radius:20px;',
    'font-size:12.5px;line-height:1.62;color:#cdbb9a;text-align:center;',
    'background:rgba(10,8,14,.74);border:1px solid rgba(214,190,150,.16);',
    'backdrop-filter:blur(7px);opacity:0;transition:opacity .38s ease;pointer-events:none}',
    '.bsp-hint.on{opacity:1}',
    '.bsp-hint b{color:#f0cf9a;font-weight:400}',

    '.bsp-foot{position:absolute;right:26px;bottom:28px;z-index:6;',
    'font-size:11px;letter-spacing:.20em;color:#6e6250}',
    '.bsp-foot b{color:#a8946e;font-weight:400}',

    'body.bsp-lock{overflow:hidden}',
    '@media (max-width:1000px){.bsp-card{width:270px;left:18px;bottom:18px}}'
  ].join('');

  function injectCSS() {
    if (document.getElementById('bsp-css')) { return; }
    var s = document.createElement('style');
    s.id = 'bsp-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function say(html, ms) {
    if (!S.ui.hint) { return; }
    S.ui.hint.innerHTML = html;
    S.ui.hint.classList.add('on');
    /* 量一次实际宽度，供 trackHint 做左右夹取。只在这里读布局，不进每帧。 */
    S.hintHalf = (S.ui.hint.offsetWidth || 0) / 2
      || Math.min(620, (window.innerWidth || 1200) * 0.52) / 2;
    clearTimeout(S.ui.hintT);
    if (ms) { S.ui.hintT = setTimeout(function () { S.ui.hint.classList.remove('on'); }, ms); }
  }
  function crumb(txt) { if (S.ui.crumb) { S.ui.crumb.textContent = txt || ''; } }

  /* 龟宝的台词气泡跟着它走。
     原来是屏幕底部居中固定的一条 —— 那时候立体龟只有四十来像素、缩在左下角，
     气泡压不着它。换成 2D 立绘后龟宝长到七十像素高，窄屏上气泡正好糊在它身上。
     改成把龟宝头顶的世界坐标投影到屏幕上，气泡就挂在它嘴边说话。 */
  var _hintV = null;
  function trackHint(st) {
    if (!S.ui.hint || !S.guibao || !st || !st.camera || !st.el) { return; }
    if (!S.ui.hint.classList.contains('on')) { return; }
    if (!_hintV) { _hintV = new window.THREE.Vector3(); }
    S.guibao.root.getWorldPosition(_hintV);
    _hintV.y += 1.14;                                  // 头顶再往上一点
    _hintV.project(st.camera);
    var w = st.el.clientWidth || 1, h = st.el.clientHeight || 1;
    var x = (_hintV.x * 0.5 + 0.5) * w;
    var scrY = (-_hintV.y * 0.5 + 0.5) * h;
    /* 气泡宽度：用 say() 时量到的实际半宽，没量到就按 max-width 估 */
    var half = S.hintHalf || Math.min(620, w * 0.52) / 2;
    /* 左侧让开知识卡（聚焦态它占着左下角） */
    var safeL = (S.cardRight || 0) + 14;
    var lo = half + safeL, hi = w - half - 16;
    if (lo > hi) { lo = half + 16; }          /* 屏太窄，卡片避不开就不避了 */
    x = Math.max(lo, Math.min(hi, x));
    var b = h - scrY + 16;
    /* 下界 104：别掉到知识卡和底部进度条的地盘里 */
    b = Math.max(104, Math.min(h - 130, b));
    S.ui.hint.style.left = x + 'px';
    S.ui.hint.style.bottom = b + 'px';
  }

  function card(on, d) {
    var c = S.ui.card;
    if (!c) { return; }
    if (!on) { c.classList.remove('on'); S.cardRight = 0; return; }
    c.innerHTML = '';
    /* 记下卡片右边缘：气泡挂到龟宝嘴边后，聚焦态会正好压到卡片右上角。
       这里读一次布局（切换时才读，不进每帧），气泡据此让位。 */
    S.cardRight = c.offsetLeft + c.offsetWidth;
    var hd = App.el('div', 'hd');
    hd.appendChild(App.el('div', 'gp', d.ch));
    var nx = App.el('div', 'nx');
    nx.innerHTML = '今字 <b>' + d.now + '</b>';
    hd.appendChild(nx);
    hd.appendChild(App.el('div', 'tag', d.cat));
    c.appendChild(hd);
    c.appendChild(App.el('div', 'gl', d.gloss));
    c.appendChild(App.el('div', 'lk', d.link));
    var btn = App.el('button', '', '收　回');
    btn.onclick = function () { dismiss(); };
    c.appendChild(btn);
    c.classList.add('on');
  }

  function buildUI() {
    var root = App.el('div', 'bsp-root');
    var top = App.el('div', 'bsp-top');
    top.appendChild(App.el('div', 'bsp-title', '第二关 · 骨片浮空'));
    S.ui.crumb = App.el('div', 'bsp-crumb', '');
    top.appendChild(S.ui.crumb);
    root.appendChild(top);

    var back = App.el('div', 'bsp-back', '← 回馆');
    back.onclick = function () { location.hash = '#/museum'; };
    root.appendChild(back);

    S.ui.card = App.el('div', 'bsp-card');
    root.appendChild(S.ui.card);

    S.ui.hint = App.el('div', 'bsp-hint');
    root.appendChild(S.ui.hint);

    S.ui.foot = App.el('div', 'bsp-foot');
    S.ui.foot.innerHTML = '共 <b>' + PLATES.length + '</b> 片骨 · 点一片看看它长出什么';
    root.appendChild(S.ui.foot);

    document.body.appendChild(root);
    return root;
  }

  /* ==========================================================================
     模式注册
     ========================================================================== */
  App.modes.register({
    id: 'bone-float',
    name: '骨片浮空',
    tagline: '一片骨，一个长出来的世界',
    desc: '六片刻着甲骨文的骨片悬在虚空里。点开一片，它飞到眼前放大，字亮起来，字所指的山川、日月、树木、眼睛、青铜器就从骨面上长出来 —— 收回时再缩回骨里。',
    icon: '骨',
    accent: 'var(--gold, #c8a86a)',
    tags: ['3D', '探索', '字形'],
    layout: 'wide',
    minPlayers: 1,
    maxPlayers: 1,
    status: 'ready',
    data: { plates: PLATES },

    mount: function (host) {
      injectCSS();
      S.container = host;
      var root = buildUI();
      S.root = root;
      document.body.classList.add('bsp-lock');
      requestAnimationFrame(function () { root.classList.add('on'); });

      App.stage3d.create(root, {
        camera: { pos: [0, 2.05, 11.6], look: [0, 1.28, 0] },
        fov: 46,
        fog: { color: 0x130f18, density: 0.0225 },
        shadow: true
      }, function (err, st) {
        if (err) {
          var msg = App.el('div', '', '3D 场景没能启动：' + (err.message || err));
          msg.style.cssText = 'padding:90px;color:#c9b795;font-size:14px;line-height:1.8';
          root.appendChild(msg);
          return;
        }
        S.st = st;
        build(st);
        st.onPick(onPick);
        bindLook(st);
        st.el.addEventListener('pointermove', function (e) {
          if (S.mode !== 'idle') { return; }
          hoverAt(st.ndc(e.clientX, e.clientY));
        });
        st.el.addEventListener('pointerleave', function () {
          if (S.hovered) { hoverAt({ x: 99, y: 99 }); }
        });
        st.onTick(function (dt) {
          S.t += dt;
          stepTweens(dt);
          if (S.mode !== 'idle') {
            S.stateSince = (S.stateSince || 0) + dt;
            var lim = GUARD[S.mode];
            if (lim && S.stateSince > lim) { reset(); }
          } else {
            S.stateSince = 0;
          }
          var idle = (S.mode === 'idle');
          applyLook(st);
          var camPos = st.camera.position;
          if (S.headLight && S.forward) {
            S.headLight.position.set(camPos.x + S.forward.x * 1.2,
                                     camPos.y + 0.25,
                                     camPos.z + S.forward.z * 1.2);
          }
          for (var i = 0; i < S.plates.length; i++) {
            var p = S.plates[i], b = p.userData.base;
            if (p === S.focus) { continue; }
            if (idle) {
              /* 环绕观星台缓慢公转：0.075 rad/s，一圈约 84 秒 —— 看得出来在转，
                 又不至于让人点不中。聚焦某一片时整环停住，收回后接着转。 */
              var ang = p.userData.ang + dt * 0.075;
              p.userData.ang = ang;
              p.position.x = Math.cos(ang) * b.r;
              p.position.z = Math.sin(ang) * b.r;
              p.position.y = b.y + Math.sin(S.t * 0.52 + b.ph) * 0.10;
              /* 始终朝向"人"（镜头就在圆心），转过去也不会变成一条边 */
              p.rotation.y = Math.atan2(camPos.x - p.position.x, camPos.z - p.position.z);
              p.rotation.z = b.rz + Math.sin(S.t * 0.42 + b.ph * 1.7) * 0.022;
            }
          }
          if (S.focus) { S.focus.rotation.z = Math.sin(S.t * 0.6) * 0.008; }
          if (S.prop && S.prop.update) { S.prop.update(dt, S.t); }
          if (S.guibao && S.guibao.update) {
            S.guibao.update(dt, { speed: 0, run: false, focus: false });
            trackHint(st);
          }
        });

        say('<b>提示</b>：这六片骨上都刻着字。点一片，看它长出什么来。', 11000);
      });
    },

    unmount: function () {
      document.body.classList.remove('bsp-lock');
      S.tweens.length = 0;
      S.mode = 'idle';
      S.focus = null;
      S.hovered = null;
      S.busy = false;
      S.prop = null;
      S.plates = [];
      S.guibao = null;
      S.cardRight = 0;
      S.hintHalf = 0;
      if (S.ui.hintT) { clearTimeout(S.ui.hintT); }
      if (S.st) { try { S.st.dispose(); } catch (e) {} S.st = null; }
      if (S.root && S.root.parentNode) { S.root.parentNode.removeChild(S.root); }
      S.root = null;
    }
  });

  App.bonefloat = {
    _S: S,
    PLATES: PLATES,
    focusAt: function (i) { if (S.plates[i]) { focusPlate(S.plates[i]); } },
    dismiss: dismiss,
    reset: reset
  };
})();
