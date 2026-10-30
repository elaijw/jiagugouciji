/* ============================================================
   甲骨奇谭 · 第三关：三阶段 Boss 战（3D）
   ------------------------------------------------------------
   Boss 是一块悬在战场上的巨大骨版，字刻在版心，三圈骨环护着它。
   三个阶段各自换一种"拆"的方式：

     一、构件拆解  「涉」＝水 + 止。四片构件骨里挑出真的两个，
                   挑对 → 构件从字上分离、飞出、骨版受击。
     二、笔画拆解  「木」。字被拆成一段段独立的骨管，只能点中被高亮的那一段；
                   点错扣护盾，点对断一段。全部断完 → 护盾炸裂。
     三、古句填字  三句出自《论语》《道德经》的句子各缺一字，
                   从四片字骨里选那片对的。三句连对 → 骨版崩解。

   数据来源：
     字形   App.glyphs.parts（经 App.worldGlyph.strokesOf 归一化的折线）
     关卡   App.levels.boss.tiers（字 / 构件 / 段数 / 释义）
     龟宝   App.guibao.build
   ============================================================ */
(function (App) {
  'use strict';
  if (!App || !App.modes) { return; }

  /* ================= CSS ================= */
  var CSS = [
    '.bd3-root{position:fixed;inset:0;z-index:400;overflow:hidden;background:#08070c;',
    'font-family:var(--font-song,"Songti SC",serif);color:#efe4cd;user-select:none}',
    'body.bd3-lock{overflow:hidden}',
    '.bd3-stage{position:absolute;inset:0}',
    '.bd3-stage canvas{display:block;width:100%;height:100%}',

    /* 顶栏 */
    '.bd3-top{position:absolute;left:0;right:0;top:0;z-index:6;display:flex;align-items:center;',
    'gap:16px;padding:14px 20px;pointer-events:none}',
    '.bd3-top>*{pointer-events:auto}',
    '.bd3-btn{border:1px solid rgba(214,186,126,.34);background:rgba(22,18,15,.66);color:#e6d6b4;',
    'font:inherit;font-size:13px;padding:6px 13px;border-radius:2px;cursor:pointer;letter-spacing:.08em;',
    'transition:.2s;backdrop-filter:blur(6px)}',
    '.bd3-btn:hover{border-color:rgba(232,206,146,.85);background:rgba(48,38,28,.85);color:#fff3d8}',
    '.bd3-btn.on{border-color:#ffce8c;color:#fff3d8;background:rgba(70,50,30,.9)}',

    /* 阶段指示 */
    '.bd3-stages{display:flex;gap:6px;align-items:center;margin:0 auto}',
    '.bd3-st{display:flex;align-items:center;gap:6px;padding:6px 13px;border-radius:2px;',
    'border:1px solid rgba(214,186,126,.16);background:rgba(16,13,11,.5);',
    'font-size:12px;letter-spacing:.16em;color:#7d6b52;transition:.35s}',
    '.bd3-st b{font-weight:400;font-size:11px;opacity:.7}',
    '.bd3-st.on{border-color:rgba(232,196,120,.7);color:#ffd79a;background:rgba(52,38,22,.8)}',
    '.bd3-st.done{border-color:rgba(120,180,120,.45);color:#9fc08a}',
    '.bd3-st.done b::after{content:" ✓"}',

    /* Boss 状态 */
    '.bd3-hud{display:flex;flex-direction:column;gap:6px;align-items:flex-end}',
    '.bd3-name{font-size:13px;letter-spacing:.2em;color:#d8c49c}',
    '.bd3-hp{width:180px;height:5px;background:rgba(255,255,255,.08);border-radius:3px;overflow:hidden}',
    '.bd3-hp i{display:block;height:100%;width:100%;background:linear-gradient(90deg,#c8543a,#e8a35c);',
    'transition:width .5s cubic-bezier(.2,.8,.3,1)}',

    /* 底部任务条 */
    /* 任务条放上方。原来贴在底部 150px 处，阶段三的四片字骨正好长在
       同一高度 —— 白字压在米色骨片上，句子和选项互相吃掉（截图里两样都糊）。 */
    '.bd3-task{position:absolute;left:50%;top:78px;transform:translateX(-50%);z-index:6;',
    'max-width:min(760px,90vw);text-align:center;pointer-events:none;',
    'padding:14px 34px;border-radius:4px;',
    'background:radial-gradient(ellipse at center,rgba(8,7,10,.86) 0%,rgba(8,7,10,.62) 58%,rgba(8,7,10,0) 100%)}',
    '.bd3-q{font-size:20px;letter-spacing:.14em;color:#f2e2c0;line-height:1.7;',
    'text-shadow:0 2px 18px #000}',
    /* 空缺槽用 CSS 画，不写字。
       原来槽里填的是「□」（U+25A1）再加一条下边框 —— 一个人看着就像缺了两个字，
       而原句其实只缺一个。空元素只有边框，一个槽就是一个格子。 */
    '.bd3-q em{display:inline-block;width:1em;height:1em;vertical-align:-.1em;',
    'font-style:normal;margin:0 5px;border:1px dashed rgba(255,207,138,.62);',
    'border-radius:3px;background:rgba(255,207,138,.09);', 'box-shadow:0 0 14px rgba(255,180,90,.22) inset}',
    '.bd3-tip{font-size:12.5px;letter-spacing:.1em;color:#a8946e;margin-top:9px}',
    '.bd3-tip b{color:#ffce8c;font-weight:400}',
    /* 一行轻提示：把"字片是楷书、Boss 身上才是甲骨文"这件事说清楚，
       免得玩家以为我们拿楷体冒充了甲骨形。 */
    '.bd3-know{margin-top:18px;padding-top:15px;border-top:1px solid rgba(255,255,255,.09);', 'text-align:left}',
    '.bd3-know .kh{font-size:11.5px;letter-spacing:.24em;color:#9c8a6a;margin-bottom:9px}',
    '.bd3-know .kr{font-size:12.5px;line-height:1.62;color:#c9b795;margin-bottom:9px}',
    '.bd3-know .kr b{display:block;color:#f0dfbe;font-weight:400;letter-spacing:.05em}',
    '.bd3-know .kr span{color:#8d7a58;margin-right:8px}',
    '.bd3-know .kr em{font-style:normal;color:#a5947a;display:block;font-size:11.5px}',
    '.bd3-know .kn{font-size:11px;line-height:1.6;color:#7d6e56;margin-top:4px}',
    '.bd3-kai{display:inline-block;margin-left:12px;padding:1px 8px;border-radius:9px;',
    'font-size:11px;letter-spacing:.06em;color:#8f8064;background:rgba(255,255,255,.05)}',

    /* 古句出处（答对后浮出） */
    '.bd3-src{position:absolute;left:50%;top:190px;transform:translateX(-50%);z-index:6;',
    'font-size:12px;letter-spacing:.12em;color:#9d8a68;opacity:0;transition:opacity .4s;pointer-events:none}',
    '.bd3-src.on{opacity:1}',

    /* 提示气泡 */
    '.bd3-say{position:absolute;left:50%;bottom:44px;transform:translateX(-50%);z-index:6;',
    'max-width:min(620px,86vw);padding:9px 18px;border-left:2px solid rgba(232,196,120,.55);',
    'background:linear-gradient(90deg,rgba(18,15,12,.85),rgba(18,15,12,.35));',
    'font-size:13px;line-height:1.7;color:#e2d3b6;letter-spacing:.04em;',
    'transition:opacity .3s;pointer-events:none}',
    '.bd3-say b{color:#ffcf8a;font-weight:400}',

    /* 受击闪白 */
    '.bd3-flash{position:absolute;inset:0;z-index:7;pointer-events:none;opacity:0;',
    'background:radial-gradient(circle at 50% 42%,rgba(255,214,150,.55),transparent 62%)}',
    '.bd3-flash.hit{animation:bd3hit .42s ease-out}',
    '@keyframes bd3hit{0%{opacity:.9}100%{opacity:0}}',

    /* 胜利面板 */
    '.bd3-win{position:absolute;inset:0;z-index:9;display:none;place-items:center;',
    'background:radial-gradient(circle at 50% 45%,rgba(24,18,12,.72),rgba(8,7,10,.94))}',
    '.bd3-win.on{display:grid}',
    '.bd3-card{width:min(460px,88vw);padding:34px 32px;border:1px solid rgba(214,186,126,.3);',
    'background:linear-gradient(180deg,rgba(24,20,16,.96),rgba(16,13,11,.98));text-align:center}',
    '.bd3-card .wk{font-size:11px;letter-spacing:.34em;color:#9a845f}',
    '.bd3-card .wt{font-size:30px;letter-spacing:.22em;color:#f6e2b6;margin:12px 0 6px}',
    '.bd3-card .ws{font-size:13px;color:#b8a483;letter-spacing:.08em;line-height:2}',
    '.bd3-card .wrow{display:flex;gap:10px;margin-top:24px}',
    '.bd3-card .wrow .bd3-btn{flex:1;padding:10px}',
    '.bd3-stats{display:flex;gap:18px;justify-content:center;margin-top:18px;',
    'padding-top:16px;border-top:1px solid rgba(214,186,126,.16)}',
    '.bd3-stat{text-align:center}',
    '.bd3-stat .v{font-size:20px;color:#ffce8c}',
    '.bd3-stat .k{font-size:11px;letter-spacing:.14em;color:#8a7a5e;margin-top:3px}',

    /* 黑幕 / 加载 */
    '.bd3-fade{position:absolute;inset:0;z-index:20;background:#060509;opacity:0;',
    'pointer-events:none;transition:opacity .35s}',
    '.bd3-fade.on{opacity:1;pointer-events:auto}',
    '.bd3-load{position:absolute;inset:0;z-index:22;display:grid;place-items:center;background:#08070c;',
    'font-size:13px;letter-spacing:.3em;color:#8f7f66;transition:opacity .5s}',
    '.bd3-load.off{opacity:0;pointer-events:none}',
    '.bd3-load .ring{width:34px;height:34px;border:1px solid rgba(214,186,126,.22);',
    'border-top-color:#d8b878;border-radius:50%;animation:bd3spin 1s linear infinite;margin:0 auto 16px}',
    '@keyframes bd3spin{to{transform:rotate(360deg)}}',
    '.bd3-err{padding:24px;font-size:13px;line-height:2;color:#e0a37a;text-align:center}'
  ].join('');

  function injectCSS() {
    if (document.getElementById('bd3-css')) { return; }
    var s = document.createElement('style');
    s.id = 'bd3-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ================= 关卡数据 ================= */

  /* 三句古句：出处、原文、空缺字、释义。
     只用确定出处的句子；空缺字必须在 App.glyphs.parts 里有字形，
     否则第三阶段会没东西可点（启动时会断言一次，见 checkSentences）。 */
  /* 题库。三句都取出处明确的经典句，逐字核过原文。
     注：「说」「知」「师」在现有字库里没有甲骨字形 ——
     按"没有可靠依据不硬造字形"的规矩，阶段三的字片一律用楷书，
     不拿现代楷体冒充甲骨形。 */
  var SENTENCES = [
    { text: '学而时习之，不亦说乎', miss: '说', missIdx: 8,
      from: '《论语·学而》',
      gloss: '学了又按时温习，不也令人喜悦吗。「说」通「悦」。',
      note: '「说」通「悦」，此处读 yuè。' },
    { text: '知之为知之，不知为不知，是知也', miss: '知', missIdx: 14,
      from: '《论语·为政》',
      gloss: '知道就是知道，不知道就是不知道，这才是真正的智慧。末字「知」通「智」。',
      note: '句末「知」通「智」，指智慧。' },
    { text: '三人行，必有我师焉', miss: '师', missIdx: 7,
      from: '《论语·述而》',
      gloss: '几个人同行，其中一定有可以做我老师的人。',
      note: '「师」指可师法之人，不必是职业教师。' }
  ];

  /* 阶段一的字必须同时满足三个条件：
       ① 在 App.glyphs.parts 里有字形（没有字形 = Boss 版心一块白板）；
       ② 是合体字，能说出它由哪两件组成；
       ③ 这个"组成"有据可查，不是我编的。
     「涉」在这份数据里没有字形，换「泉」：既有字形，释义原话是
     "象泉之形：石穴里涌出的水" —— 水 + 石，两件都在数据里。 */
  var PHASE1_CHAR = '泉';
  var PHASE1_COMPS = ['水', '石'];
  var PHASE2_CHAR = '木';

  /* ================= 状态 ================= */
  var S = {
    st: null, host: null, root: null, alive: true,
    phase: 1, hp: 100,
    boss: null, guibao: null,
    widgets: [],           /* 当前阶段摆在场景里的可点物件 */
    busy: false,
    wrong: 0,
    t0: 0, elapsed: 0,
    qIndex: 0,
    cleared: [],
    timer: []
  };

  var el = App.el;

  /* 从既有数据取字的释义；取不到返回 null，绝不编造。
     注意：这里只借 App.levels.map.zones 当"字典"用（旧数据里带着每个字的
     释义与出土信息），不渲染任何区域、点位或地图结构 —— 新第三关没有地图。 */
  function meaningOf(ch) {
    var L = App.levels;
    var zs = (L && L.map && L.map.zones) || [];
    for (var i = 0; i < zs.length; i++) {
      var arr = (zs[i].objects || []).concat(zs[i].extra || []);
      for (var j = 0; j < arr.length; j++) {
        if (arr[j] && arr[j].char === ch) { return arr[j]; }
      }
    }
    return null;
  }
  function noteOf(ch) {
    var t = (App.levels && App.levels.boss && App.levels.boss.tiers) || [];
    for (var i = 0; i < t.length; i++) {
      var l = t[i].list || [];
      for (var j = 0; j < l.length; j++) { if (l[j].char === ch) { return l[j].note || ''; } }
    }
    return '';
  }

  function rnd(seed) { return App.stage3d.rnd(seed); }

  /* ================= 材质 ================= */
  function boneMat(T, seed, glow) {
    return new T.MeshStandardMaterial({
      map: App.stage3d.boneTex(seed),
      color: 0xd8cbb0,
      roughness: 0.86, metalness: 0.02,
      emissive: new T.Color(0x5a3c1e),
      emissiveIntensity: glow == null ? 0.14 : glow
    });
  }
  function glyphMat(T, color, emissive, glow) {
    return new T.MeshStandardMaterial({
      color: color == null ? 0x2e2416 : color,
      roughness: 0.62, metalness: 0.06,
      emissive: new T.Color(emissive == null ? 0xffb264 : emissive),
      emissiveIntensity: glow == null ? 0.18 : glow
    });
  }

  /* ================= 战场 ================= */
  function buildArena(st) {
    var T = st.T;
    st.renderer.toneMappingExposure = 1.0;
    st.scene.fog = new T.FogExp2(0x14121c, 0.019);
    if (st.lights) {
      st.lights.hemi.intensity = 0.22;
      st.lights.sun.intensity = 0.55;
      st.lights.fill.intensity = 0.16;
    }

    /* 天穹 */
    var cv = App.stage3d.canvas(8, 256), c = cv.getContext('2d');
    var g = c.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#07060c'); g.addColorStop(0.55, '#161222');
    g.addColorStop(0.82, '#2a1c20'); g.addColorStop(1, '#120e14');
    c.fillStyle = g; c.fillRect(0, 0, 8, 256);
    var dome = new T.Mesh(new T.SphereGeometry(200, 24, 16),
      new T.MeshBasicMaterial({ map: App.stage3d.tex(cv), side: T.BackSide, fog: false, depthWrite: false }));
    st.scene.add(dome);

    /* 远山：两圈低剪影 */
    var R = rnd(17);
    [[70, 12, 8, 16, 0x131020], [44, 8, 4, 9, 0x1a1524]].forEach(function (cfg) {
      for (var i = 0; i < cfg[1]; i++) {
        var a = i / cfg[1] * Math.PI * 2 + R() * 0.3;
        var rr = cfg[0] + R() * 14;
        var h = cfg[2] + R() * cfg[3];
        var rad = h * (0.6 + R() * 0.5);
        var m = new T.Mesh(new T.ConeGeometry(rad, h, 6, 1),
          new T.MeshStandardMaterial({ color: cfg[4], roughness: 1, metalness: 0, flatShading: true }));
        m.position.set(Math.cos(a) * rr, -7 + h * 0.45, Math.sin(a) * rr);
        m.rotation.y = R() * 6.28;
        st.scene.add(m);
      }
    });

    /* 战场地面：一圈圈同心骨环，暗示"这是一个祭坛" */
    var disc = new T.Mesh(new T.CircleGeometry(15, 48),
      new T.MeshStandardMaterial({ color: 0x14110e, roughness: 0.99, metalness: 0 }));
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0;
    disc.receiveShadow = true;
    st.scene.add(disc);
    for (var k = 1; k <= 3; k++) {
      var ring = new T.Mesh(new T.TorusGeometry(k * 3.4, 0.035, 6, 60),
        new T.MeshStandardMaterial({ color: 0x6e5a3a, roughness: 0.7, metalness: 0.2,
          emissive: new T.Color(0x2a1e0e), emissiveIntensity: 0.5 }));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.02;
      st.scene.add(ring);
    }
    /* 中心一点微光，照亮龟宝脚下 */
    var under = new T.PointLight(0xff9a55, 6, 9, 2);
    under.position.set(0, 0.6, 3.2);
    st.scene.add(under);

    /* 主光：从 Boss 后上方压下来，剪影感 */
    var key = new T.PointLight(0xffc489, 22, 26, 2);
    key.position.set(0, 8.5, -3.5);
    st.scene.add(key);
    var rim = new T.PointLight(0x7f9fd8, 10, 22, 2);
    rim.position.set(-6, 4.5, 5);
    st.scene.add(rim);
    return { key: key, rim: rim, under: under };
  }

  /* ================= Boss =================
     一块竖立的骨版 + 三圈护盾骨环 + 底部骨刺。
     字的载体是这块版：骨版不属于"某个场景的装饰"，它就是 Boss 本体。 */
  function makeBoss(st) {
    var T = st.T;
    var g = new T.Group();
    g.position.set(0, 3.4, -2.6);

    var plateGeo = App.stage3d.bonePlateGeo(T, 2.9, 3.7, 0.40, 71);
    var body = new T.Mesh(plateGeo, boneMat(T, 71, 0.10));
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);

    /* 版心：一块更暗的凹面，字刻在它上面才不"浮" */
    var inset = new T.Mesh(new T.CylinderGeometry(1.14, 1.14, 0.10, 32),
      new T.MeshStandardMaterial({ color: 0x7a6547, roughness: 1, metalness: 0,
        emissive: new T.Color(0x1d150c), emissiveIntensity: 0.5 }));
    inset.rotation.x = Math.PI / 2;
    inset.position.z = 0.40;
    g.add(inset);

    /* 底部三根骨刺，扎进地里，让骨版"钉"在那儿 */
    for (var i = 0; i < 3; i++) {
      var a = (i / 3) * Math.PI - Math.PI / 2;
      var spike = new T.Mesh(new T.ConeGeometry(0.20, 1.5, 6),
        new T.MeshStandardMaterial({ color: 0x6a5a42, roughness: 0.95, metalness: 0.02 }));
      spike.position.set(Math.cos(a) * 0.92, -2.42, Math.sin(a) * 0.5);
      spike.rotation.x = Math.PI;
      spike.rotation.z = Math.cos(a) * 0.12;
      spike.castShadow = true;
      g.add(spike);
    }

    /* 三圈护盾骨环：XY 平面，绕 z 轴不同速旋转 */
    var shields = [];
    for (var s2 = 0; s2 < 3; s2++) {
      var rr = 1.82 + s2 * 0.26;
      var tor = new T.Mesh(
        new T.TorusGeometry(rr, 0.045 - s2 * 0.008, 6, 54),
        new T.MeshStandardMaterial({
          color: 0x9a8050, roughness: 0.42, metalness: 0.5,
          emissive: new T.Color(0x8a5a20), emissiveIntensity: 0.75,
          transparent: true, opacity: 0.9
        })
      );
      tor.userData.spin = (s2 % 2 ? -1 : 1) * (0.22 + s2 * 0.10);
      tor.userData.baseOp = 0.9;
      g.add(tor);
      shields.push(tor);
    }

    /* 字：单独一个组，拆解时逐件移走 */
    /* 刻字层要浮在骨版的"最前表面"之外。
       骨版 depth 0.40 + bevel 0.42*0.40，中心化之后正面在 z≈0.37；
       原来字层放在 0.30，笔画管半径只有 0.07 —— 整根管子都嵌在骨头里，
       阶段二截图里骨版是"一块白板 + 几粒灰点"，就是这么来的。 */
    var glyphG = new T.Group();
    glyphG.position.set(0, 0.06, 0.46);
    g.add(glyphG);

    var flash = new T.PointLight(0xff5a3a, 0, 16, 2);
    flash.position.set(0, 0.4, 1.6);
    g.add(flash);

    st.scene.add(g);
    return { root: g, body: body, glyphG: glyphG, shields: shields, flash: flash,
             basePos: new T.Vector3(0, 3.4, -2.6) };
  }

  /* 把整字刻到 Boss 版心（阶段一用） */
  function engraveWhole(boss, ch, size) {
    var T = S.st.T;
    var g = boss.glyphG;
    while (g.children.length) { g.remove(g.children[0]); }
    var gm = App.worldGlyph.glyphMesh(ch, size || 2.1, { color: 0x3a2c18, emissive: 0xffb264, glow: 0.22 });
    if (gm) {
      gm.name = 'boss-glyph';
      g.add(gm);
    }
    return gm;
  }

  /* 把字拆成一段段独立骨管（阶段二用）。
     为什么用 Tube 而不是 Extrude：
     每段笔画要能单独"脱开"，Tube 天然是一段独立的管子，
     而且打光时圆管的高光会让"这是一根骨"读得比扁片清楚。 */
  function engraveStrokes(boss, ch, size) {
    var T = S.st.T;
    var g = boss.glyphG;
    while (g.children.length) { g.remove(g.children[0]); }
    var stk = App.worldGlyph.strokesOf(ch);
    if (!stk) { return []; }
    var sc = (size || 2.1);
    var out = [];
    for (var i = 0; i < stk.pieces.length; i++) {
      var pts = stk.pieces[i];
      if (pts.length < 2) { continue; }
      var v3 = [];
      for (var j = 0; j < pts.length; j++) {
        v3.push(new T.Vector3((pts[j][0] - 0) * sc, (pts[j][1] - 0) * sc, 0));
      }
      var curve = new T.CatmullRomCurve3(v3, false, 'catmullrom', 0.4);
      var rad = Math.max(0.075, stk.hw * sc * 1.85);
      var geo = new T.TubeGeometry(curve, Math.max(8, pts.length * 3), rad, 7, false);
      /* 两端加个球头，切口才不是"被锯断的管子" */
      var m = new T.Mesh(geo, glyphMat(T, 0x3a2c18, 0xffb264, 0.20));
      m.castShadow = true;
      m.userData.pickable = true;
      m.userData.strokeIndex = i;
      g.add(m);
      out.push(m);
    }
    return out;
  }

  /* ================= 场景里的可点骨片 ================= */
  /* 把楷书字写到一张透明贴面上，贴在骨面。
     只在这一处用 —— 字形本身不是主角，读得出来才是。 */
  function kaiFace(T, ch, size, fz) {
    var cv = App.stage3d.canvas(256, 256), c = cv.getContext('2d');
    c.clearRect(0, 0, 256, 256);
    c.fillStyle = '#2a2014';
    c.font = '600 178px "Songti SC","SimSun","Noto Serif CJK SC",serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(ch, 128, 138);
    var tx = App.stage3d.tex(cv, 1);
    var m = new T.Mesh(
      new T.PlaneGeometry(size * 0.60, size * 0.60),
      new T.MeshBasicMaterial({ map: tx, transparent: true, depthWrite: false })
    );
    m.position.z = fz + 0.003;
    return m;
  }

  function makePlate(st, ch, size, opt) {
    var T = st.T, o = opt || {};
    var g = new T.Group();
    var depth = size * 0.16;
    var geo = App.stage3d.bonePlateGeo(T, size, size * 1.1, depth, o.seed || 5);
    var body = new T.Mesh(geo, boneMat(T, o.seed || 5, o.glow == null ? 0.16 : o.glow));
    body.castShadow = true;
    g.add(body);
    var fz = depth * 0.5 + depth * 0.42 + 0.004;
    if (o.kai) {
      /* 楷书字片：阶段三考的是句子与字义，不是字形识别。
         而且「说」「知」「师」在字库里没有甲骨形 —— 若只给正确答案留一块空白骨，
         这一题就废了。统一用楷书写，四个选项同一种画法，也不会靠"谁长得不一样"露答案。 */
      var km = kaiFace(T, ch, size, fz);
      if (km) { g.add(km); }
    } else {
      var gm = App.worldGlyph.glyphMesh(ch, size * 0.58,
        { color: 0x322616, emissive: o.emissive || 0xffb264, glow: o.glyphGlow == null ? 0.16 : o.glyphGlow });
      if (gm) { gm.position.z = fz; g.add(gm); }
      else { var km2 = kaiFace(T, ch, size, fz); if (km2) { g.add(km2); } }
    }
    g.userData.pickable = true;
    g.userData.char = ch;
    g.userData.tag = o.tag || '';
    return g;
  }

  /* ================= UI ================= */
  function buildUI() {
    var root = S.root;
    var top = el('div', 'bd3-top');
    var back = el('button', 'bd3-btn', '← 回馆');
    /* 「回馆」就真的回馆。原来写死 #/modes（模式列表），
       第二关的「← 回馆」回的是 #/museum，两关出口不一致，
       玩家从第三关出来会落到一张关卡列表上，而不是博物馆大厅。 */
    back.onclick = function () { location.hash = '#/museum'; };
    top.appendChild(back);

    var stages = el('div', 'bd3-stages');
    S.uiStages = [];
    ['构件拆解', '笔画拆解', '古句填字'].forEach(function (nm, i) {
      var d = el('div', 'bd3-st');
      d.innerHTML = '<b>' + (i + 1) + '</b>' + nm;
      stages.appendChild(d);
      S.uiStages.push(d);
    });
    top.appendChild(stages);

    var hud = el('div', 'bd3-hud');
    var nm = el('div', 'bd3-name', '守字之骨');
    var hp = el('div', 'bd3-hp');
    var hpI = el('i');
    hp.appendChild(hpI);
    hud.appendChild(nm); hud.appendChild(hp);
    top.appendChild(hud);

    var task = el('div', 'bd3-task');
    var q = el('div', 'bd3-q');
    var tip = el('div', 'bd3-tip');
    task.appendChild(q); task.appendChild(tip);

    var src = el('div', 'bd3-src');
    var sayBox = el('div', 'bd3-say');
    var flash = el('div', 'bd3-flash');
    var fade = el('div', 'bd3-fade');

    var load = el('div', 'bd3-load');
    var ring = el('div', 'ring');
    load.appendChild(ring);
    load.appendChild(el('div', '', '正在唤醒守字之骨'));

    var win = el('div', 'bd3-win');

    [top, task, src, sayBox, flash, win, fade, load].forEach(function (n) { root.appendChild(n); });

    S.ui = { top: top, stages: stages, name: nm, hp: hpI, q: q, tip: tip,
             src: src, say: sayBox, flash: flash, fade: fade, load: load, win: win };
  }

  function setPhase(n) {
    S.phase = n;
    for (var i = 0; i < S.uiStages.length; i++) {
      S.uiStages[i].className = 'bd3-st' + (i + 1 === n ? ' on' : (i + 1 < n ? ' done' : ''));
    }
  }
  function setHp(v) {
    /* 血条不是"生命值"，是骨版的护盾强度：它到 0 不会输，
       而是重新绷紧到 55 —— 原型阶段不做失败态，免得演示时卡在空血里。 */
    if (v <= 0) {
      S.hp = 55;
      say('<b>龟宝</b>：它把护盾又绷紧了一层。慢慢来，别乱点。', 2600);
    } else {
      S.hp = Math.min(100, v);
    }
    S.ui.hp.style.width = S.hp + '%';
  }
  function task(html, tip) {
    S.ui.q.innerHTML = html;
    S.ui.tip.innerHTML = tip || '';
  }
  function say(html, ms) {
    S.ui.say.innerHTML = html;
    S.ui.say.style.opacity = '1';
    if (S._sayT) { clearTimeout(S._sayT); }
    if (ms) { S._sayT = setTimeout(function () { S.ui.say.style.opacity = '0'; }, ms); }
  }
  function flash(kind) {
    var f = S.ui.flash;
    f.className = 'bd3-flash';
    void f.offsetWidth;
    f.className = 'bd3-flash ' + (kind || 'hit');
  }
  function later(fn, ms) {
    var id = setTimeout(fn, ms);
    S.timer.push(id);
    return id;
  }

  /* ================= 反馈 ================= */
  function shakeBoss(power) {
    var b = S.boss;
    if (!b) { return; }
    b.shakeT = 0.42;
    b.shakeP = power == null ? 1 : power;
    b.flash.intensity = 14 * (power == null ? 1 : power);
  }

  function debris(st, at, n, color) {
    var T = st.T;
    var R = rnd(Math.random() * 1e6 | 0);
    var pos = new Float32Array(n * 3);
    var vel = [];
    for (var i = 0; i < n; i++) {
      pos[i * 3] = at.x + (R() - 0.5) * 1.6;
      pos[i * 3 + 1] = at.y + (R() - 0.5) * 1.6;
      pos[i * 3 + 2] = at.z + (R() - 0.5) * 0.8;
      vel.push([(R() - 0.5) * 4.5, R() * 4.0 + 0.5, (R() - 0.5) * 3.0]);
    }
    var geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    var mat = new T.PointsMaterial({
      color: color || 0xe8d2a8, size: 0.12, transparent: true, opacity: 1,
      sizeAttenuation: true, depthWrite: false
    });
    var p = new T.Points(geo, mat);
    st.scene.add(p);
    var life = 1.1;
    return {
      obj: p,
      update: function (dt) {
        life -= dt;
        var arr = geo.attributes.position.array;
        for (var i2 = 0; i2 < n; i2++) {
          vel[i2][1] -= 11 * dt;
          arr[i2 * 3] += vel[i2][0] * dt;
          arr[i2 * 3 + 1] += vel[i2][1] * dt;
          arr[i2 * 3 + 2] += vel[i2][2] * dt;
        }
        geo.attributes.position.needsUpdate = true;
        mat.opacity = Math.max(0, life / 1.1);
        if (life <= 0) {
          st.scene.remove(p);
          geo.dispose(); mat.dispose();
          return false;
        }
        return true;
      }
    };
  }

  /* ================= 阶段一：构件拆解 ================= */
  function clearWidgets() {
    var st = S.st;
    for (var i = 0; i < S.widgets.length; i++) {
      var w = S.widgets[i];
      if (w.parent) { w.parent.remove(w); }
      if (w.userData && w.userData.dispose) { w.userData.dispose(); }
    }
    S.widgets = [];
  }

  function addWidget(o) {
    S.st.scene.add(o);
    S.widgets.push(o);
    return o;
  }

  /* ============================================================
     法阵与阶段召唤
     ------------------------------------------------------------
     每一阶段开始时，Boss 在身前亮起一座法阵，并从阵里召出一只阶段怪物：
       一阶 骨甲虫（护着构件）  二阶 骨蛇（护着笔画）  三阶 羽骨鸟（护着残句）
     全是程序化几何：环 + 字纹 + 简单体块，不引入模型文件。
     怪物只做"守阵"表演，不参与判定 —— 判定仍然是原来的构件/笔画/古句。
     ============================================================ */
  var SIGIL_RUNES = ['日', '月', '山', '水', '木', '火', '土', '人'];

  function makeBeast(T, phase) {
    var g = new T.Group();
    var bone = new T.MeshStandardMaterial({
      color: 0xd8c9a6, roughness: 0.72, metalness: 0.06,
      emissive: new T.Color(0x3a2410), emissiveIntensity: 0.22
    });
    var glow = new T.MeshStandardMaterial({
      color: 0xffce8c, roughness: 0.35, metalness: 0.1,
      emissive: new T.Color(0xff8c3c), emissiveIntensity: 0.85,
      transparent: true, opacity: 0.92
    });

    if (phase === 1) {
      /* 骨甲虫：六边形甲壳 + 六条短腿 */
      var body = new T.Mesh(new T.IcosahedronGeometry(0.40, 0), bone);
      body.scale.set(1.15, 0.72, 1.0);
      g.add(body);
      var core = new T.Mesh(new T.OctahedronGeometry(0.17, 0), glow);
      core.position.y = 0.16;
      g.add(core);
      for (var i = 0; i < 6; i++) {
        var a = (i / 6) * Math.PI * 2;
        var leg = new T.Mesh(new T.CylinderGeometry(0.035, 0.05, 0.34, 6), bone);
        leg.position.set(Math.cos(a) * 0.42, -0.16, Math.sin(a) * 0.42);
        leg.rotation.z = Math.cos(a) * 0.7;
        leg.rotation.x = -Math.sin(a) * 0.7;
        g.add(leg);
      }
    } else if (phase === 2) {
      /* 骨蛇：一串骨球盘成螺旋 */
      for (var k = 0; k < 9; k++) {
        var r = 0.13 - k * 0.008;
        var seg = new T.Mesh(new T.SphereGeometry(Math.max(0.06, r), 10, 8), k === 8 ? glow : bone);
        var ang = k * 0.62;
        seg.position.set(Math.cos(ang) * (0.36 - k * 0.028), -0.34 + k * 0.085, Math.sin(ang) * (0.36 - k * 0.028));
        g.add(seg);
      }
      var head = new T.Mesh(new T.ConeGeometry(0.12, 0.26, 8), bone);
      head.position.set(0.06, 0.46, 0.02);
      head.rotation.z = -0.5;
      g.add(head);
    } else {
      /* 羽骨鸟：纺锤身 + 两片骨翼 */
      var torso = new T.Mesh(new T.ConeGeometry(0.22, 0.62, 8), bone);
      torso.rotation.x = Math.PI;
      g.add(torso);
      var skull = new T.Mesh(new T.SphereGeometry(0.14, 12, 10), glow);
      skull.position.y = 0.36;
      g.add(skull);
      var beak = new T.Mesh(new T.ConeGeometry(0.05, 0.24, 6), bone);
      beak.position.set(0, 0.34, 0.20);
      beak.rotation.x = Math.PI / 2;
      g.add(beak);
      for (var w = 0; w < 2; w++) {
        var wing = new T.Mesh(new T.PlaneGeometry(0.52, 0.24), new T.MeshStandardMaterial({
          color: 0xe6d6b2, roughness: 0.8, metalness: 0.04,
          emissive: new T.Color(0x2a1a0c), emissiveIntensity: 0.2,
          side: T.DoubleSide
        }));
        wing.position.set(w ? 0.32 : -0.32, 0.06, 0);
        wing.rotation.z = w ? -0.5 : 0.5;
        g.add(wing);
      }
    }
    return g;
  }

  function summonPhase(n) {
    var st = S.st;
    if (!st) { return; }
    var T = st.T;
    var grp = new T.Group();
    grp.position.set(0, 0.02, 3.35);

    var ringMat = new T.MeshBasicMaterial({
      color: 0xffd9a0, transparent: true, opacity: 0.0,
      side: T.DoubleSide, depthWrite: false
    });
    var r1 = new T.Mesh(new T.RingGeometry(1.55, 1.68, 80), ringMat);
    r1.rotation.x = -Math.PI / 2;
    grp.add(r1);
    var r2 = new T.Mesh(new T.RingGeometry(0.86, 0.95, 64), ringMat.clone());
    r2.rotation.x = -Math.PI / 2;
    grp.add(r2);

    var runes = [];
    for (var i = 0; i < SIGIL_RUNES.length; i++) {
      var ch = SIGIL_RUNES[i];
      if (!(App.worldGlyph && App.worldGlyph.hasGlyph(ch))) { continue; }
      var gm = App.worldGlyph.glyphMesh(ch, 0.34, {
        color: 0x2a1c0c, emissive: 0xffb264, glow: 0.9
      });
      if (!gm) { continue; }
      var a = (i / SIGIL_RUNES.length) * Math.PI * 2;
      gm.position.set(Math.cos(a) * 1.24, 0.02, Math.sin(a) * 1.24);
      gm.rotation.x = -Math.PI / 2 + 0.30;
      gm.rotation.z = -a;
      gm.traverse(function (m) {
        if (m.material && !Array.isArray(m.material)) {
          m.material.transparent = true;
          m.material.opacity = 0;
        }
      });
      grp.add(gm);
      runes.push(gm);
    }

    var beast = makeBeast(T, n);
    beast.position.set(0, -1.1, 0.06);
    beast.scale.setScalar(0.02);
    grp.add(beast);

    var lamp = new T.PointLight(0xffb066, 0, 9, 2);
    lamp.position.set(0, 0.6, 0.2);
    grp.add(lamp);

    addWidget(grp);
    S.sigil = {
      grp: grp, r1: r1, r2: r2, runes: runes, beast: beast, lamp: lamp,
      t: 0, phase: n, beastY: 1.75
    };
  }

  function tickSigil(dt) {
    var g = S.sigil;
    if (!g || !g.grp.parent) { return; }
    g.t += dt;
    var k = Math.min(1, g.t / 1.1);
    var e = 1 - Math.pow(1 - k, 3);

    g.r1.material.opacity = 0.72 * e;
    g.r2.material.opacity = 0.38 * e;
    g.lamp.intensity = 2.6 * e;

    g.r1.rotation.z -= dt * 0.55;
    g.r2.rotation.z += dt * 0.85;

    for (var i = 0; i < g.runes.length; i++) {
      var m = g.runes[i];
      var pulse = 0.55 + 0.45 * Math.sin(g.t * 2.2 + i * 0.8);
      m.traverse(function (o) {
        if (o.material && !Array.isArray(o.material)) {
          o.material.opacity = 0.95 * e * pulse;
        }
      });
    }

    /* 召唤物从阵里升起来，然后悬着转 */
    var rise = Math.min(1, Math.max(0, (g.t - 0.25) / 0.9));
    var re = 1 - Math.pow(1 - rise, 3);
    g.beast.position.y = -1.1 + (g.beastY + 1.1) * re
      + Math.sin(g.t * 1.6) * 0.05 * re;
    g.beast.scale.setScalar(0.02 + 1.55 * re);
    g.beast.rotation.y += dt * 0.75;
    g.beast.rotation.z = Math.sin(g.t * 1.1) * 0.06;
  }

  function startPhase1() {
    setPhase(1);
    clearWidgets();
    summonPhase(1);
    var st = S.st;
    var boss = S.boss;
    engraveWhole(boss, PHASE1_CHAR, 1.72);
    S.phaseData = { need: PHASE1_COMPS.slice(), got: [], wrong: 0 };

    S.ui.name.textContent = '守字之骨 · 泉';
    task('这个字是「<em>泉</em>」——石穴里涌出的水。<br>把它身上拼起来的两块拆下来。',
      '从下面四片构件骨里挑，挑错会挨一下');

    /* 四个候选：两个真的 + 两个干扰。
       干扰项从 palette 里取，且保证不是正确项 —— 池子大小恒为 4，
       所以"池里有几个"不泄露"答案有几个"。 */
    var pal = ((App.levels.boss && App.levels.boss.palette) || [])
      .filter(function (c) { return PHASE1_COMPS.indexOf(c) < 0 && App.worldGlyph.hasGlyph(c); });
    var R = rnd(913);
    var picks = [];
    while (picks.length < 2 && pal.length) {
      var idx = Math.floor(R() * pal.length) % pal.length;
      var c = pal.splice(idx, 1)[0];
      if (picks.indexOf(c) < 0) { picks.push(c); }
    }
    var all = PHASE1_COMPS.concat(picks);
    /* 洗牌 */
    for (var i = all.length - 1; i > 0; i--) {
      var j = Math.floor(R() * (i + 1));
      var tmp = all[i]; all[i] = all[j]; all[j] = tmp;
    }

    S.plateRefs = {};
    for (var k = 0; k < all.length; k++) {
      var p = makePlate(st, all[k], 1.06, { seed: 300 + k * 11, tag: 'comp' });
      p.position.set(-2.85 + k * 2.05, 2.35, 4.2);
      p.userData.baseY = p.position.y;
      p.userData.phase = 0;
      addWidget(p);
      S.plateRefs[all[k]] = p;
    }
    S.busy = false;
  }

  function onPickComp(obj) {
    if (S.busy || S.phase !== 1) { return; }
    var ch = obj.userData.char;
    var T = S.st.T;
    var d = S.phaseData;
    if (d.need.indexOf(ch) >= 0) {
      /* 正确：骨片飞向 Boss，然后消失；Boss 掉血、抖动 */
      S.busy = true;
      obj.userData.flyTo = { t: 0, from: obj.position.clone() };
      var self = obj;
      later(function () {
        if (self.parent) { self.parent.remove(self); }
        shakeBoss(1);
        flash('hit');
        setHp(S.hp - 12);
        S.bursts.push(debris(S.st, new S.st.T.Vector3(0, 3.4, -2.4), 46, 0xffd9a0));
      }, 10);
      /* 用 tick 做飞行动画，见 tickWidgets */
      d.need.splice(d.need.indexOf(ch), 1);
      d.got.push(ch);
      say('<b>龟宝</b>：拆下来了——「' + ch + '」。', 2200);
      if (!d.need.length) {
        later(function () { phase1Done(); }, 900);
      } else {
        later(function () { S.busy = false; }, 700);
      }
    } else {
      /* 错误：骨片弹一下，护盾亮起 */
      d.wrong++;
      S.wrong++;
      obj.userData.kick = 0.4;
      shakeBoss(0.25);
      say('<b>龟宝</b>：这片拼不出「' + PHASE1_CHAR + '」。它一半是水，一半是石头。', 2600);
      setHp(S.hp - 4);
    }
  }

  function phase1Done() {
    setPhase(2);
    shieldBurst(function () { startPhase2(); });
  }

  /* ================= 阶段二：笔画拆解 ================= */
  function startPhase2() {
    setPhase(2);
    clearWidgets();
    summonPhase(2);
    var st = S.st, boss = S.boss;
    var strokes = engraveStrokes(boss, PHASE2_CHAR, 1.72);
    S.strokeRefs = strokes;
    S.phaseData = { remain: strokes.length, target: -1, wrong: 0, timer: 0 };
    S.ui.name.textContent = '守字之骨 · 木';
    task('「<em>木</em>」是一棵树的正面：上为枝，中为干，下为根。<br>点中发光的那一段，把它折断。',
      '共 <b>' + strokes.length + '</b> 段 · 点错会反噬');
    S.busy = false;
    pickNextStroke();
  }

  function pickNextStroke() {
    var d = S.phaseData;
    if (!d) { return; }
    var alive = [];
    for (var i = 0; i < S.strokeRefs.length; i++) {
      if (S.strokeRefs[i].userData.alive !== false) { alive.push(i); }
    }
    if (!alive.length) { return; }
    d.target = alive[Math.floor(Math.random() * alive.length)];
  }

  function onPickStroke(obj) {
    if (S.busy || S.phase !== 2) { return; }
    var d = S.phaseData;
    var idx = obj.userData.strokeIndex;
    if (idx === d.target) {
      obj.userData.alive = false;
      obj.userData.fall = 0;
      obj.userData.fallV = -1.4 - Math.random();
      shakeBoss(0.8);
      flash('hit');
      setHp(S.hp - 14);
      d.remain--;
      say('<b>龟宝</b>：断了一段。', 1200);
      if (d.remain <= 0) {
        S.busy = true;
        later(function () {
          task('护盾裂了。', '');
          shieldBurst(function () { startPhase3(); });
        }, 700);
      } else {
        pickNextStroke();
      }
    } else {
      d.wrong++;
      S.wrong++;
      obj.userData.kick = 0.35;
      shakeBoss(0.2);
      say('<b>龟宝</b>：这一段还连得好好的。找那截在发光的。', 2200);
      setHp(S.hp - 5);
    }
  }

  /* 护盾炸裂：三圈环向外飞散 + 白光 + 骨屑 */
  function shieldBurst(done) {
    var T = S.st.T;
    var shields = S.boss.shields;
    flash('hit');
    shakeBoss(1.6);
    for (var i = 0; i < shields.length; i++) {
      (function (sh, k2) {
        var mat = sh.material;
        var t0 = 0;
        var spin = sh.userData.spin;
        S.bursts = S.bursts || [];
        S.bursts.push(function (dt) {
          t0 += dt;
          var e = Math.min(1, t0 / 0.9);
          var sc = 1 + e * 1.5;
          sh.scale.set(sc, sc, sc);
          sh.rotation.z += dt * spin * 6;
          mat.opacity = Math.max(0, 0.9 * (1 - e));
          if (e >= 1) {
            if (sh.parent) { sh.parent.remove(sh); }
            return false;
          }
          return true;
        });
      })(shields[i], i);
    }
    S.bursts.push(debris(S.st, new T.Vector3(0, 3.4, -2.4), 90, 0xffd9a0));
    later(function () { if (done) { done(); } }, 850);
  }

  /* ================= 阶段三：古句填字 ================= */
  function startPhase3() {
    setPhase(3);
    clearWidgets();
    summonPhase(3);
    var st = S.st, boss = S.boss;
    /* 这一阶段 Boss 不放空，而是"释放封印"：骨版上刻回完整的本字「泉」，
       让玩家一边看着这个字，一边补它守着的句子。
       （原来这里把字整个清掉、只刻一个缺字方框 —— 整块骨版变成一块白板，
        玩家会以为 Boss 已经被打散了，只剩一个框，很像是渲染坏了。） */
    engraveWhole(boss, PHASE1_CHAR, 1.72);
    S.ui.name.textContent = '守字之骨 · 残句';
    S.qIndex = 0;
    S.phaseData = { correct: 0 };
    showQuestion();
  }

  function showQuestion() {
    var st = S.st;
    clearWidgets();
    var q = SENTENCES[S.qIndex];
    if (!q) { win(); return; }
    var parts = q.text.split('');
    /* 空缺位置按 missIdx 定位。
       不能只找"第一个等于 miss 的字"：「知之为知之，不知为不知，是知也」
       头一个字也是「知」，一按 indexOf 就把句首挖空了。 */
    var at = (q.missIdx != null && parts[q.missIdx] === q.miss) ? q.missIdx : parts.indexOf(q.miss);
    var shown = '';
    for (var i = 0; i < parts.length; i++) {
      shown += (i === at) ? '<em></em>' : parts[i];
    }
    S.ui.q.innerHTML = shown;
    S.ui.tip.innerHTML = '从下面四片字骨里，选出缺的那个字　·　第 <b>' +
      (S.qIndex + 1) + '/' + SENTENCES.length + '</b> 句' +
      '<span class="bd3-kai">字片用楷书 · Boss 身上是甲骨文</span>';
    S.ui.src.classList.remove('on');

    /* 四个选项：正确 + 干扰。干扰要"模棱两可但不能也对"：
       从同义/同类字里取，且保证不在本句里出现过。 */
    var pool = ['日', '月', '山', '木', '火', '田', '口', '目', '女', '子', '牛', '羊', '鱼', '禾', '石', '川'];
    var opts = [q.miss];
    var R = rnd(1000 + S.qIndex * 37);
    var guard = 0;
    while (opts.length < 4 && guard++ < 200) {
      var c = pool[Math.floor(R() * pool.length) % pool.length];
      if (opts.indexOf(c) >= 0) { continue; }
      if (q.text.indexOf(c) >= 0) { continue; }
      opts.push(c);
    }
    for (var j = opts.length - 1; j > 0; j--) {
      var k = Math.floor(R() * (j + 1));
      var t = opts[j]; opts[j] = opts[k]; opts[k] = t;
    }

    for (var m = 0; m < opts.length; m++) {
      var p = makePlate(st, opts[m], 1.04, { seed: 500 + m * 13, tag: 'opt', kai: true });
      p.position.set(-2.15 + m * 1.95, 1.62, 4.6);
      p.userData.baseY = p.position.y;
      addWidget(p);
    }
    S.busy = false;
  }

  function onPickOption(obj) {
    if (S.busy || S.phase !== 3) { return; }
    var q = SENTENCES[S.qIndex];
    var ch = obj.userData.char;
    if (ch === q.miss) {
      S.busy = true;
      /* 选对：字片飞向句中空缺 */
      obj.userData.flyUp = 0;
      later(function () {
        flash('hit');
        shakeBoss(0.7);
        setHp(S.hp - 11);
        S.ui.src.innerHTML = '「' + q.miss + '」　' + q.from + '　·　' + q.gloss;
        S.ui.src.classList.add('on');
        say('<b>龟宝</b>：对了。' + q.gloss, 3200);
        S.qIndex++;
        S.phaseData.correct++;
        later(function () {
          if (S.qIndex >= SENTENCES.length) { win(); }
          else { showQuestion(); }
        }, 2400);
      }, 520);
    } else {
      S.wrong++;
      obj.userData.kick = 0.4;
      shakeBoss(0.18);
      setHp(S.hp - 4);
      say('<b>龟宝</b>：这一句的意思对不上这个字。再看一遍句子。', 2400);
    }
  }

  /* ================= 胜利 / 败退 ================= */
  function win() {
    clearWidgets();
    S.phase = 9;
    var T = S.st.T;
    var boss = S.boss;
    /* 定格用时：S.elapsed 每帧都在被 tick 覆盖，等到 1.5 秒后弹面板时
       读到的已经不是"打通那一刻"了（截图里显示 5s 就是这么来的）。 */
    S.finalElapsed = (performance.now() - S.t0) / 1000;
    var st = S.st;

    /* 骨版崩解：下沉 + 旋转 + 缩小 */
    var t0 = 0;
    S.bursts = S.bursts || [];
    S.bursts.push(function (dt) {
      t0 += dt;
      var e = Math.min(1, t0 / 1.6);
      boss.root.position.y = boss.basePos.y - e * 4.2;
      boss.root.rotation.z = e * 0.55;
      boss.root.rotation.y = e * 1.1;
      boss.root.scale.setScalar(1 - e * 0.65);
      if (e >= 1) {
        boss.root.visible = false;
        return false;
      }
      return true;
    });
    S.bursts.push(debris(S.st, new T.Vector3(0, 3.4, -2.4), 120, 0xe8d2a8));
    flash('hit');
    S.ui.q.innerHTML = '';
    S.ui.tip.innerHTML = '';
    S.ui.src.classList.remove('on');

    /* 龟宝跑到台前做一个跳 */
    if (S.guibao && S.guibao.root) {
      var gb = S.guibao;
      gb.root.userData.victoryT = 0;
      var z0 = gb.root.position.z, x0 = gb.root.position.x;
      S.bursts.push(function (dt) {
        gb.root.userData.victoryT += dt;
        var t2 = gb.root.userData.victoryT;
        var e = Math.min(1, t2 / 1.4);
        /* 走到祭坛中央偏左，边走边跳两下 —— 只挪 0.3 米的话，
           从镜头看它根本没动，胜利像"画面切走了"。 */
        gb.root.position.x = x0 + (0.2 - x0) * e;
        gb.root.position.z = z0 + (1.6 - z0) * e;
        gb.root.rotation.y = 0.42 * (1 - e);
        gb.root.position.y = Math.abs(Math.sin(t2 * 9.0)) * 0.42 * (1 - e * 0.5);
        if (gb.update) {
          gb.update(dt, { speed: t2 < 1.4 ? 1.0 : 0, run: false, focus: false });
        }
        return t2 < 2.4;
      });
    }

    /* 胜利光柱：Boss 一散，场地中央空得发慌。一束从天上落下来的暖光，
       把"这里刚刚结束了一件事"撑住，也给龟宝一个舞台。 */
    var beamMat = new T.MeshBasicMaterial({
      color: 0xffcf96, transparent: true, opacity: 0,
      depthWrite: false, side: T.DoubleSide, fog: false, toneMapped: false,
      blending: T.AdditiveBlending
    });
    var beam = new T.Mesh(new T.CylinderGeometry(2.6, 3.4, 16, 24, 1, true), beamMat);
    beam.position.set(0, 8, 0.2);
    st.scene.add(beam);
    var bt = 0;
    S.bursts.push(function (dt) {
      bt += dt;
      beamMat.opacity = Math.min(0.16, bt * 0.18);
      return true;
    });

    later(function () {
      showWin();
    }, 1500);
  }

  function showWin() {
    var w = S.ui.win;
    var secs = Math.max(1, Math.round(S.finalElapsed || S.elapsed));
    w.innerHTML = '';
    var card = el('div', 'bd3-card');
    card.innerHTML =
      '<div class="wk">第三关 · 通过</div>' +
      '<div class="wt">守字之骨已散</div>' +
      '<div class="ws">构件拆了，笔画断了，残句也补齐了。<br>' +
      '这三个字不是被记住的，是被你拆开又装回去的。</div>' +
      '<div class="bd3-stats">' +
      '<div class="bd3-stat"><div class="v">' + secs + 's</div><div class="k">用时</div></div>' +
      '<div class="bd3-stat"><div class="v">' + S.wrong + '</div><div class="k">失误</div></div>' +
      '<div class="bd3-stat"><div class="v">' + (S.wrong === 0 ? 'S' : (S.wrong <= 3 ? 'A' : 'B')) +
      '</div><div class="k">评级</div></div>' +
      '</div>' +
      /* 胜利界面要交代"刚刚补的那三句是什么"。
         玩家打完了只看一个 S 评级，等于白打。 */
      '<div class="bd3-know"><div class="kh">今天补回去的三句</div>' +
      SENTENCES.map(function (q) {
        return '<div class="kr"><b>' + q.text + '</b>' +
          '<span>' + q.from + '</span>' +
          '<em>' + q.gloss + '</em></div>';
      }).join('') +
      '<div class="kn">三句都出自《论语》，不是甲骨文原文 —— ' +
      '它们是这套字后来走过的路。Boss 身上那个「泉」才是商人刻在骨头上的写法。</div></div>';
    var row = el('div', 'wrow');
    var again = el('button', 'bd3-btn', '再来一次');
    again.onclick = function () { restart(); };
    var home = el('button', 'bd3-btn', '回馆');
    home.onclick = function () { location.hash = '#/museum'; };
    row.appendChild(again); row.appendChild(home);
    card.appendChild(row);
    w.appendChild(card);
    w.classList.add('on');
  }

  function restart() {
    S.ui.win.classList.remove('on');
    S.ui.src.classList.remove('on');
    var st = S.st;
    /* 重建 Boss（上一轮把它沉下去、缩没了） */
    if (S.boss && S.boss.root.parent) { st.scene.remove(S.boss.root); }
    S.boss = makeBoss(st);
    S.widgets = [];
    S.bursts = [];
    S.wrong = 0;
    S.finalElapsed = 0;
    S.hp = 100;
    setHp(100);
    S.t0 = performance.now();
    S.elapsed = 0;
    S.busy = false;
    if (S.guibao && S.guibao.root) {
      S.guibao.root.position.set(-3.2, 0, 3.6);
      S.guibao.root.rotation.y = 0.4;
    }
    startPhase1();
  }

  /* ================= 每帧 ================= */
  function tick(dt, t) {
    if (!S.alive || !S.st) { return; }
    var T = S.st.T;
    tickSigil(dt);

    /* Boss 待机：浮 + 护盾转 */
    var b = S.boss;
    if (b && b.root.visible) {
      b.root.position.y = b.basePos.y + Math.sin(t * 0.9) * 0.10;
      b.root.rotation.z = Math.sin(t * 0.55) * 0.012;
      if (S.phase !== 9) {
        b.root.position.x = b.basePos.x + Math.sin(t * 0.42) * 0.18;
      }
      for (var i = 0; i < b.shields.length; i++) {
        var sh = b.shields[i];
        if (!sh.parent) { continue; }
        sh.rotation.z += dt * sh.userData.spin;
      }
      /* 受击抖动 */
      if (b.shakeT > 0) {
        b.shakeT -= dt;
        var k = Math.max(0, b.shakeT / 0.42);
        b.root.position.x += Math.sin(t * 62) * 0.14 * k * (b.shakeP || 1);
        b.root.position.y += Math.cos(t * 71) * 0.09 * k * (b.shakeP || 1);
        b.flash.intensity = Math.max(0, b.flash.intensity - dt * 34);
      } else if (b.flash.intensity !== 0) {
        b.flash.intensity = Math.max(0, b.flash.intensity - dt * 34);
      }
    }

    /* 骨片：浮动 + 高亮 + 飞行动画 */
    for (var w = 0; w < S.widgets.length; w++) {
      var o = S.widgets[w];
      if (!o.parent) { continue; }
      if (o.userData.baseY != null) {
        o.position.y = o.userData.baseY + Math.sin(t * 1.15 + w * 1.7) * 0.07;
      }
      o.rotation.y = Math.sin(t * 0.7 + w) * 0.10;
      /* 错的弹一下 */
      if (o.userData.kick > 0) {
        o.userData.kick -= dt;
        var kk = Math.max(0, o.userData.kick / 0.4);
        o.position.x += Math.sin(t * 46) * 0.06 * kk;
      }
      /* 对的飞走 */
      if (o.userData.flyTo) {
        var f = o.userData.flyTo;
        f.t += dt;
        var e = Math.min(1, f.t / 0.55);
        o.position.lerpVectors(f.from, new T.Vector3(0, 3.2, -2.2), e);
        o.scale.setScalar(1 - e * 0.85);
        o.rotation.y += dt * 7;
        if (e >= 1 && o.parent) { o.parent.remove(o); }
      }
      /* 阶段三选对：往上飞进句子 */
      if (o.userData.flyUp != null) {
        o.userData.flyUp += dt;
        var e2 = Math.min(1, o.userData.flyUp / 0.5);
        o.position.y += dt * 3.2;
        o.scale.setScalar(1 + e2 * 0.3);
        o.material && (o.material.opacity = 1 - e2);
        if (e2 >= 1 && o.parent) { o.parent.remove(o); }
      }
    }

    /* 阶段二：高亮目标笔画 */
    if (S.phase === 2 && S.strokeRefs && S.phaseData) {
      var tg = S.phaseData.target;
      for (var s2 = 0; s2 < S.strokeRefs.length; s2++) {
        var sm = S.strokeRefs[s2];
        if (!sm.parent) { continue; }
        if (sm.userData.alive === false) {
          /* 断落的笔画：往下掉、变透明 */
          sm.userData.fall -= dt;
          sm.position.y += sm.userData.fallV * dt;
          sm.rotation.z += dt * 2.2;
          sm.material.transparent = true;
          sm.material.opacity = Math.max(0, 1 + sm.userData.fall);
          if (sm.material.opacity <= 0 && sm.parent) { sm.parent.remove(sm); }
          continue;
        }
        var isT = (s2 === tg);
        /* 高亮不能只是"亮一点"：几段笔画挨在一起，亮度差 30% 根本分不出来。
           目标段烧到 2.0 并且换成偏红的光，其余压到 0.05 沉进骨头里。 */
        sm.material.emissiveIntensity = isT
          ? 0.85 + Math.sin(t * 7.5) * 0.30
          : 0.05;
        sm.material.emissive.setHex(isT ? 0xff5a10 : 0xd8a060);
        sm.material.color.setHex(isT ? 0x8a5a20 : 0x4a3a22);
        if (sm.userData.kick > 0) {
          sm.userData.kick -= dt;
          sm.position.x += Math.sin(t * 52) * 0.03;
        }
      }
    }

    /* 一次性动画（护盾炸、Boss 崩解） */
    if (S.bursts && S.bursts.length) {
      for (var bi = S.bursts.length - 1; bi >= 0; bi--) {
        if (!S.bursts[bi](dt)) { S.bursts.splice(bi, 1); }
      }
    }

    /* 龟宝 */
    if (S.guibao && S.guibao.update) {
      var focus = (S.phase === 2 && S.phaseData && S.phaseData.target >= 0);
      S.guibao.update(dt, { speed: 0, run: false, focus: focus });
    }

    S.elapsed = (performance.now() - S.t0) / 1000;
  }

  /* ================= 点击分发 ================= */
  function onPick(ev) {
    if (S.phase === 9) { return; }
    var o = ev.obj;
    if (!o) { return; }
    var tag = o.userData && o.userData.tag;
    if (S.phase === 1 && tag === 'comp') { onPickComp(o); return; }
    if (S.phase === 2 && o.userData && o.userData.strokeIndex != null) { onPickStroke(o); return; }
    if (S.phase === 3 && tag === 'opt') { onPickOption(o); return; }
  }

  /* ================= mount ================= */
  function mount(host, ctx) {
    injectCSS();
    var root = el('div', 'bd3-root');
    document.body.appendChild(root);
    document.body.classList.add('bd3-lock');
    S.host = host; S.root = root; S.alive = true;
    S.widgets = []; S.bursts = []; S.timer = []; S.wrong = 0;
    buildUI();

    App.stage3d.create(root, {
      fov: 48,
      fog: { color: 0x14121c, density: 0.019 },
      camera: { pos: [0, 4.3, 11.5], look: [0, 2.9, 0] },
      exposure: 1.0,
      hemi: 0.22, sun: 0.55, fill: 0.16,
      shadow: true
    }, function (err, st) {
      if (err || !st) {
        root.innerHTML = '';
        var e = el('div', 'bd3-err',
          '3D 引擎没能载入（' + (err && err.message ? err.message : '未知错误') + '）。<br>刷新一次通常就好。');
        root.appendChild(e);
        return;
      }
      S.st = st;
      var sh = el('div', 'bd3-stage');
      root.insertBefore(sh, root.firstChild);
      sh.appendChild(st.el);
      st.el.style.position = 'absolute';
      st.el.style.inset = '0';
      st.el.style.width = '100%';
      st.el.style.height = '100%';

      buildArena(st);
      S.boss = makeBoss(st);

      var gb = App.stage3d.makeGuibao(st.T, { scale: 1.35 });
      if (gb) {
        gb.root.position.set(-3.2, 0, 3.6);
        gb.root.rotation.y = 0.42;
        st.scene.add(gb.root);
        S.guibao = gb;
      }

      st.onTick(tick);
      st.onPick(onPick);

      S.t0 = performance.now();
      setHp(100);
      startPhase1();

      var ld = S.ui.load;
      ld.classList.add('off');
      setTimeout(function () { if (ld.parentNode) { ld.parentNode.removeChild(ld); } }, 600);

      S._kd = function (e) {
        if (e.key === 'Escape') { location.hash = '#/modes'; }
      };
      window.addEventListener('keydown', S._kd);
    });
  }

  function unmount() {
    S.alive = false;
    if (S._kd) { window.removeEventListener('keydown', S._kd); S._kd = null; }
    for (var i = 0; i < S.timer.length; i++) { clearTimeout(S.timer[i]); }
    S.timer = [];
    clearWidgets();
    if (S.st) { try { S.st.dispose(); } catch (e) {} S.st = null; }
    if (S.root && S.root.parentNode) { S.root.parentNode.removeChild(S.root); }
    document.body.classList.remove('bd3-lock');
    S.root = null; S.boss = null; S.guibao = null; S.strokeRefs = null;
  }

  App.boss3d = {
    mount: mount, unmount: unmount, _S: S,
    startPhase1: startPhase1, startPhase2: startPhase2, startPhase3: startPhase3,
    win: win, restart: restart, SENTENCES: SENTENCES
  };

  App.modes.register({
    id: 'boss-3d',
    name: '守字之骨',
    tagline: '三阶段 · 3D Boss 战',
    desc: '一块悬在祭坛上的巨大骨版，字刻在版心，三圈骨环护着它。'
        + '先拆它的构件，再断它的笔画，最后用三句古语把它的残句补齐——'
        + '每拆一件，骨版就矮一分。',
    icon: '骨',
    accent: 'var(--cinnabar)',
    tags: ['3D', 'Boss 战', '三阶段'],
    layout: 'wide',
    minPlayers: 1, maxPlayers: 1,
    status: 'ready',
    data: { packs: [], assets: ['glyphs'] },
    mount: mount,
    unmount: unmount
  });
})(window.App = window.App || {});
