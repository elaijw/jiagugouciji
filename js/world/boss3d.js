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

  /* 龟宝暂不完全介入关卡：立牌与胜利页形象都由这个开关控制。
     要恢复就改 true（两关一起回来）。 */
  var SHOW_GB = false;

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
    /* Boss 立绘：阶段开始浮出 2.6 秒，不挡题面 */
    /* 步骤条 + 跟随标签 + 开场说明 */
    '.bd3-step{position:absolute;left:50%;top:168px;transform:translateX(-50%);z-index:6;',
    'display:flex;align-items:center;gap:10px;padding:7px 16px;border-radius:2px;',
    'background:rgba(18,14,11,.72);border:1px solid rgba(214,186,126,.22);',
    'font-size:12.5px;letter-spacing:.06em;color:#e2d3b4;backdrop-filter:blur(6px);',
    'pointer-events:none;white-space:nowrap}',
    '.bd3-step b{color:#ffce8c;font-weight:600}',
    '.bd3-step i{font-style:normal;color:#9d8f79}',
    '.bd3-tag{position:absolute;z-index:7;transform:translate(-50%,-100%);',
    'padding:4px 10px;border-radius:2px;background:rgba(255,206,140,.92);color:#2b1d0e;',
    'font-size:12px;letter-spacing:.08em;pointer-events:none;opacity:0;transition:opacity .25s;',
    'white-space:nowrap;box-shadow:0 6px 16px rgba(0,0,0,.45)}',
    '.bd3-tag.on{opacity:1}',
    '.bd3-tag:after{content:"";position:absolute;left:50%;top:100%;transform:translateX(-50%);',
    'border:5px solid transparent;border-top-color:rgba(255,206,140,.92)}',
    '.bd3-intro{position:absolute;inset:0;z-index:30;display:none;place-items:center;',
    'background:rgba(6,5,9,.78);backdrop-filter:blur(4px)}',
    '.bd3-intro.on{display:grid}',
    '.bd3-intro-card{width:min(520px,86vw);padding:26px 28px;border-radius:3px;',
    'background:linear-gradient(180deg,rgba(30,24,18,.96),rgba(20,16,13,.96));',
    'border:1px solid rgba(214,186,126,.28);box-shadow:0 30px 80px rgba(0,0,0,.6)}',
    '.bd3-intro-card h3{margin:0 0 4px;font-size:19px;letter-spacing:.14em;color:#ffe6bd;font-weight:500}',
    '.bd3-intro-card .sub{font-size:12px;color:#8f8270;letter-spacing:.18em;margin-bottom:16px}',
    '.bd3-intro-card ol{margin:0 0 18px;padding:0;list-style:none;counter-reset:s}',
    '.bd3-intro-card li{position:relative;padding-left:30px;margin:11px 0;font-size:13.5px;',
    'line-height:1.65;color:#cbbda4}',
    '.bd3-intro-card li:before{counter-increment:s;content:counter(s);position:absolute;left:0;top:1px;',
    'width:20px;height:20px;border-radius:50%;display:grid;place-items:center;font-size:11px;',
    'color:#2b1d0e;background:#d9b877}',
    '.bd3-intro-card li b{color:#ffe0b0;font-weight:600}',
    '.bd3-intro-card button{width:100%;padding:10px;font:inherit;font-size:13.5px;letter-spacing:.18em;',
    'color:#2b1d0e;background:#e8c68a;border:0;border-radius:2px;cursor:pointer}',
    '.bd3-intro-card button:hover{background:#f4d7a4}',
    '.bd3-face{position:absolute;left:20px;bottom:86px;z-index:5;width:138px;',
    'pointer-events:none;opacity:0;transform:translateX(-18px);',
    'transition:opacity .5s ease,transform .5s ease}',
    '.bd3-face.on{opacity:.96;transform:none}',
     '.bd3-face.idle{opacity:.42;transform:none}',
    '.bd3-face img{width:100%;display:block;border-radius:3px;',
    'box-shadow:0 18px 40px rgba(0,0,0,.55);border:1px solid rgba(214,186,126,.28)}',
    '.bd3-face span{display:block;margin-top:6px;text-align:center;font-size:11.5px;',
    'letter-spacing:.22em;color:#c9b48c}',
    /* 胜利卡：跟站点其它卡片同一套语言 —— 骨纸底、墨字、朱砂点睛、细发丝边 */
    '.bd3-win{position:absolute;inset:0;z-index:9;display:none;place-items:center;',
    'background:radial-gradient(circle at 50% 42%,rgba(20,16,12,.55),rgba(6,5,8,.9))}',
    '.bd3-win.on{display:grid}',
    '.bd3-card{position:relative;width:min(480px,90vw);max-height:90vh;overflow-y:auto;',
    'overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:rgba(180,73,47,.35) transparent;',
    'padding:30px 30px 24px;',
    'border:1px solid #d9cfb6;border-radius:2px;text-align:center;color:#2b2318;',
    'background:linear-gradient(180deg,#f6f3e9 0%,#efe9d9 62%,#e8e0cc 100%);',
    'box-shadow:0 30px 80px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.7)}',
    '.bd3-card:before{content:"";position:absolute;inset:6px;border:1px solid rgba(43,35,24,.09);',
    'border-radius:1px;pointer-events:none}',
    /* 入场：卡纸拍下 → 印章砸下 → 数字→三句→按钮 依次出现 */
    /* 评级印：盖在右上角的一枚方印 */
    '@keyframes bd3grade{0%{opacity:0;transform:scale(2.4) rotate(16deg)}',
    '55%{opacity:1;transform:scale(.94) rotate(4deg)}',
    '80%{transform:scale(1.05) rotate(9deg)}100%{opacity:1;transform:scale(1) rotate(8deg)}}',
    /* 骨屑：从卡片上沿落下，落到一半就淡掉 */
    '@keyframes bd3dust{0%{opacity:0;transform:translateY(-8px)}',
    '12%{opacity:.9}70%{opacity:.5}100%{opacity:0;transform:translateY(64px)}}',
    '@keyframes bd3perfect{0%{opacity:0;letter-spacing:.5em}100%{opacity:1;letter-spacing:.22em}}',
    '@keyframes bd3slam{0%{opacity:0;transform:translateY(-26px) scale(1.06) rotate(-1.2deg)}',
    '62%{opacity:1;transform:translateY(4px) scale(.995) rotate(.25deg)}',
    '100%{opacity:1;transform:none}}',
    '@keyframes bd3stamp{0%{opacity:0;transform:scale(2.1) rotate(-14deg)}',
    '55%{opacity:1;transform:scale(.92) rotate(-1deg)}',
    '78%{transform:scale(1.06) rotate(-4deg)}100%{opacity:1;transform:scale(1) rotate(-3deg)}}',
    '@keyframes bd3ink{0%{opacity:.55;transform:scale(.2)}100%{opacity:0;transform:scale(1.9)}}',
    '@keyframes bd3up{0%{opacity:0;transform:translateY(10px)}100%{opacity:1;transform:none}}',
    '.bd3-card.in{animation:bd3slam 520ms cubic-bezier(.2,.9,.25,1.15) both}',
    '.bd3-card .wseal{opacity:0}',
    '.bd3-card .wseal.stamp{animation:bd3stamp 460ms cubic-bezier(.2,1.1,.3,1.3) both}',
    '.bd3-card .wseal:after{content:"";position:absolute;margin:-10px 0 0 -10px;width:62px;height:62px;',
    'border-radius:50%;background:radial-gradient(circle,rgba(180,73,47,.5),rgba(180,73,47,0) 70%);',
    'opacity:0;pointer-events:none}',
    '.bd3-card .wseal.splat:after{animation:bd3ink 520ms ease-out both}',
    '.bd3-card .wk,.bd3-card .wt,.bd3-card .ws{opacity:0}',
    '.bd3-card.typed .wk,.bd3-card.typed .wt,.bd3-card.typed .ws{animation:bd3up 420ms ease-out both}',
    '.bd3-card.typed .wt{animation-delay:70ms}',
    '.bd3-card.typed .ws{animation-delay:150ms}',
    '.bd3-card .bd3-stats,.bd3-card .wline{opacity:0}',
    '.bd3-card.nummed .wline{animation:bd3up 360ms ease-out both}',
    '.bd3-card.nummed .bd3-stats{animation:bd3up 420ms ease-out 90ms both}',
    '.bd3-card .bd3-know{opacity:0}',
    '.bd3-card.rows .bd3-know{animation:bd3up 460ms ease-out both}',
    '.bd3-card .bd3-know .kr{opacity:0}',
    '.bd3-card.rows .bd3-know .kr{animation:bd3up 380ms ease-out both}',
    '.bd3-card.rows .bd3-know .kr:nth-of-type(1){animation-delay:60ms}',
    '.bd3-card.rows .bd3-know .kr:nth-of-type(2){animation-delay:180ms}',
    '.bd3-card.rows .bd3-know .kr:nth-of-type(3){animation-delay:300ms}',
    '.bd3-card .wrow{opacity:0}',
    '.bd3-card.acts .wrow{animation:bd3up 380ms ease-out both}',
    '.bd3-card .bd3-stat .v{font-variant-numeric:tabular-nums}',
    '.bd3-card .wrow .bd3-btn:active{transform:translateY(1px)}',
    '@media (prefers-reduced-motion: reduce){',
    '.bd3-card.in,.bd3-card .wseal.stamp,.bd3-card .wseal.splat:after,',
    '.bd3-card.typed .wk,.bd3-card.typed .wt,.bd3-card.typed .ws,',
    '.bd3-card.nummed .wline,.bd3-card.nummed .bd3-stats,',
    '.bd3-card.rows .bd3-know,.bd3-card.rows .bd3-know .kr,',
    '.bd3-card.acts .wrow{animation:none!important}',
    '.bd3-card .wseal,.bd3-card .wk,.bd3-card .wt,.bd3-card .ws,',
    '.bd3-card .bd3-stats,.bd3-card .wline,.bd3-card .bd3-know,',
    '.bd3-card .bd3-know .kr,.bd3-card .wrow{opacity:1!important}}',
    '.bd3-card{transition:transform .22s ease-out,box-shadow .22s ease-out;transform-style:preserve-3d}',
    '.bd3-card .wseal{cursor:pointer}',
    '.bd3-card .wseal:hover{filter:brightness(1.06)}',
    '.bd3-card .wseal{position:relative;width:42px;height:42px;margin:0 auto 12px;border-radius:3px;',
    'display:grid;place-items:center;background:#b4492f;color:#fdf6e3;',
    'font-family:var(--font-title,"Kaiti SC",serif);font-size:22px;',
    'box-shadow:0 2px 0 rgba(120,40,24,.35);transform:rotate(-3deg)}',
    '.bd3-card .bd3-grade{position:absolute;right:16px;top:14px;width:52px;height:52px;',
    'border:2px solid #b4492f;border-radius:2px;display:grid;place-items:center;gap:0;',
    'color:#b4492f;opacity:0;transform:rotate(8deg);background:rgba(180,73,47,.06);',
    'font-family:var(--font-title,"Kaiti SC",serif);line-height:1.02;letter-spacing:0}',
    '.bd3-card .bd3-grade span{font-size:16px;display:block}',
    '.bd3-card .bd3-grade.on{animation:bd3grade 460ms cubic-bezier(.2,1.1,.3,1.3) both}',
    '.bd3-card .bd3-grade .gl{font-size:8px;letter-spacing:.16em;color:rgba(180,73,47,.75);',
    'margin-top:2px;writing-mode:horizontal-tb}',
    '.bd3-card .bd3-dust{position:absolute;inset:0;overflow:hidden;pointer-events:none}',
    '.bd3-card .bd3-dust i{position:absolute;width:2px;height:2px;border-radius:50%;',
    'background:rgba(120,98,66,.55);animation:bd3dust 1500ms ease-in both}',
    '.bd3-card .bd3-perfect{margin-top:10px;text-align:center;font-size:12.5px;',
    'color:#b4492f;letter-spacing:.22em;opacity:0}',
    '.bd3-card.rows .bd3-perfect{animation:bd3perfect 620ms ease-out 420ms both}',
    '.bd3-card .wk{font-size:11px;letter-spacing:.34em;color:#a8552f}',
    '.bd3-card .wt{font-family:var(--font-title,"Kaiti SC",serif);font-size:27px;',
    'letter-spacing:.18em;color:#241d14;margin:10px 0 8px}',
    '.bd3-card .ws{font-size:13px;color:#5b4d3a;letter-spacing:.03em;line-height:1.95}',
    '.bd3-card .wline{height:1px;margin:18px 0 4px;position:relative;',
    'background:linear-gradient(90deg,transparent,#cfc4a8 18%,#cfc4a8 82%,transparent)}',
    '.bd3-card .wline:after{content:"";position:absolute;left:50%;top:-2px;width:5px;height:5px;',
    'transform:translateX(-50%) rotate(45deg);background:#b4492f}',
    '.bd3-card .wrow{display:flex;gap:10px;margin-top:22px}',
    '.bd3-card .wrow .bd3-btn{flex:1;padding:11px 0;border-radius:2px;font-size:13.5px;',
    'letter-spacing:.14em;border:1px solid #c9bda0;background:#efe8d6;color:#3a3025}',
    '.bd3-card .wrow .bd3-btn:hover{background:#f7f1e2;border-color:#b4492f;color:#8c3a24}',
    '.bd3-card .wrow .bd3-btn.primary{background:#b4492f;border-color:#a03d26;color:#fdf6e3}',
    '.bd3-card .wrow .bd3-btn.primary:hover{background:#c25237;border-color:#8c3a24}',
    '.bd3-stats{display:flex;gap:26px;justify-content:center;margin-top:16px}',
    '.bd3-stat{text-align:center}',
    '.bd3-stat .v{font-family:var(--font-title,"Kaiti SC",serif);font-size:24px;color:#241d14}',
    '.bd3-stat .v.grade{color:#b4492f}',
    '.bd3-stat .k{font-size:11px;letter-spacing:.16em;color:#8a7a5e;margin-top:3px}',
    '.bd3-know{margin-top:16px;padding:12px 14px;border-left:2px solid #b4492f;',
    'background:rgba(255,255,255,.5);text-align:left}',
    '.bd3-know .kh{font-size:11.5px;letter-spacing:.22em;color:#a8552f;margin-bottom:10px}',
    '.bd3-know .kr{margin:10px 0 12px}',
    '.bd3-know .kr b{display:block;font-size:14px;color:#241d14;letter-spacing:.06em;line-height:1.7}',
    '.bd3-know .kr span{display:block;margin-top:2px;font-size:11.5px;letter-spacing:.08em;color:#8c3a24}',
    '.bd3-know .kr em{display:block;margin-top:4px;font-style:normal;font-size:12px;line-height:1.8;color:#5b4d3a}',
    '.bd3-know .kn{margin-top:8px;padding-top:10px;border-top:1px dashed rgba(43,35,24,.16);',
    'font-size:11.5px;line-height:1.85;color:#6b5b46}',

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
    { text: '三人行，必有我师焉', miss: '人', missIdx: 0,
      from: '《论语·述而》',
      gloss: '几个人同行，其中一定有可以做我老师的人。',
      note: '「人」是侧身站立的人形，甲骨文里一笔写到底。' },
    { text: '知者乐水', miss: '水', missIdx: 2,
      from: '《论语·雍也》',
      gloss: '有智慧的人爱水：水随物赋形，遇阻而绕，终归大海。',
      note: '「水」是一条主流加两侧水点，三千年前的水花还没干。' },
    { text: '仁者乐山', miss: '山', missIdx: 2,
      from: '《论语·雍也》',
      gloss: '有仁德的人爱山：山静而稳，草木生焉，四时不移。',
      note: '「山」是三峰并立，中间一峰高、两侧低。' },
    { text: '朽木不可雕也', miss: '木', missIdx: 1,
      from: '《论语·公冶长》',
      gloss: '腐烂的木头没法雕刻 —— 说的是人不可教的样子。',
      note: '「木」上面是枝、中间是干、下面是根。' },
    { text: '大巧若拙', miss: '大', missIdx: 0,
      from: '《道德经·第四十五章》',
      gloss: '真正高明的技艺，看上去反而朴拙。',
      note: '「大」是张开双臂的人形 —— 张到最大，就是大。' }
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

  /* ================= 音效 =================
     全部走 battle-sfx.js：程序化生成，和战斗音乐共用一个 AudioContext。
     这里只做一件事 —— 包一层 try，声音永远不该把关卡弄崩。
     馆里「声音」关着时 battle-sfx 自己会静音，所以这里不用判断开关。 */
  function sfx(name, arg) {
    var b = App.battleSfx;
    if (!b || !b[name]) { return false; }
    try { return b[name](arg); } catch (e) { return false; }
  }

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
  /* ============================================================
     深处的巨影
     ------------------------------------------------------------
     把 boss.png 立在祭坛后方的黑暗里（z≈-13），压暗、吃雾、半透，
     读起来是"有个巨大的东西站在那儿"，而不是贴在角落的一张画。
     ============================================================ */
  function buildBossGhost(st) {
    var T = st.T;

    /* ---------- 洞窟：石门 + 两根岩柱 ---------- */
    var rockMtl = new T.MeshStandardMaterial({
      color: 0x0a0807, roughness: 1.0, metalness: 0.0, flatShading: true
    });
    function pillar(x, z, h, r) {
      var m = new T.Mesh(new T.CylinderGeometry(r * 0.72, r, h, 7, 1), rockMtl);
      m.position.set(x, h / 2 - 0.4, z);
      m.rotation.y = Math.random() * 3;
      st.scene.add(m);
      return m;
    }
    pillar(-7.2, -10.5, 7.2, 1.5);
    pillar(7.2, -10.5, 6.6, 1.4);
    pillar(-9.4, -14.0, 9.0, 1.8);
    pillar(9.4, -14.0, 8.4, 1.7);

    /* ---------- 门洞：黑色漩涡 ----------
       先在画布上画螺旋（黑 + 深紫 + 一点极淡的赭金丝），
       贴在门洞上慢慢转；中心再压一个纯黑圆，才像"往里吸的洞"。 */
    function vortexTexture() {
      var N2 = 512;
      var vc = App.stage3d.canvas(N2, N2);
      var c2 = vc.getContext('2d');
      c2.clearRect(0, 0, N2, N2);
      var cx = N2 / 2, cy = N2 / 2;
      /* 底色：由中心向外的深紫→黑 */
      var bg = c2.createRadialGradient(cx, cy, 4, cx, cy, N2 / 2);
      bg.addColorStop(0, 'rgba(6,4,10,0.98)');
      bg.addColorStop(0.55, 'rgba(14,9,24,0.92)');
      bg.addColorStop(1, 'rgba(0,0,0,0)');
      c2.fillStyle = bg;
      c2.beginPath(); c2.arc(cx, cy, N2 / 2, 0, 6.2832); c2.fill();
      /* 螺旋臂 */
      for (var arm = 0; arm < 5; arm++) {
        var a0 = (arm / 5) * Math.PI * 2;
        for (var k = 0; k < 140; k++) {
          var tt = k / 140;
          var ang2 = a0 + tt * 2.7;
          var rr = tt * (N2 * 0.46);
          var x2 = cx + Math.cos(ang2) * rr;
          var y2 = cy + Math.sin(ang2) * rr;
          var rr2 = (1 - tt) * 26 + 5;
          var g2 = c2.createRadialGradient(x2, y2, 0, x2, y2, rr2);
          var light = 0.10 + (1 - tt) * 0.30;
          g2.addColorStop(0, 'rgba(150,120,190,' + light.toFixed(3) + ')');
          g2.addColorStop(1, 'rgba(40,16,60,0)');
          c2.fillStyle = g2;
          c2.beginPath(); c2.arc(x2, y2, rr2, 0, 6.2832); c2.fill();
        }
      }
      /* 极淡的赭金丝：给一点"骨与火"的味道，不至于纯紫 */
      c2.globalCompositeOperation = 'lighter';
      for (var j = 0; j < 26; j++) {
        var ang3 = Math.random() * Math.PI * 2;
        var r3 = 40 + Math.random() * (N2 * 0.34);
        var x3 = cx + Math.cos(ang3) * r3, y3 = cy + Math.sin(ang3) * r3;
        var g3 = c2.createRadialGradient(x3, y3, 0, x3, y3, 10 + Math.random() * 14);
        g3.addColorStop(0, 'rgba(200,150,90,0.16)');
        g3.addColorStop(1, 'rgba(120,70,30,0)');
        c2.fillStyle = g3;
        c2.beginPath(); c2.arc(x3, y3, 26, 0, 6.2832); c2.fill();
      }
      c2.globalCompositeOperation = 'source-over';
      /* 中心黑洞 */
      var core = c2.createRadialGradient(cx, cy, 2, cx, cy, N2 * 0.20);
      core.addColorStop(0, 'rgba(0,0,0,1)');
      core.addColorStop(0.7, 'rgba(4,3,8,0.92)');
      core.addColorStop(1, 'rgba(6,4,12,0)');
      c2.fillStyle = core;
      c2.beginPath(); c2.arc(cx, cy, N2 * 0.21, 0, 6.2832); c2.fill();
      return App.stage3d.tex(vc);
    }

    /* 漩涡：着色器版。极坐标里把半径和角度搅在一起，就是螺旋；
       再加一层"向内抽"的相位，整片会缓慢往里流。 */
    var vortexMat = null;
    try {
      vortexMat = new T.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        fog: false,
        uniforms: {
          uTime: { value: 0 },
          uPower: { value: 1.0 }
        },
        vertexShader: [
          'varying vec2 vUv;',
          'void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }'
        ].join('\n'),
        fragmentShader: [
          'varying vec2 vUv;',
          'uniform float uTime;',
          'uniform float uPower;',
          'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }',
          'void main(){',
          '  vec2 p = vUv - 0.5;',
          '  float r = length(p) * 2.0;',
          '  float a = atan(p.y, p.x);',
          /* 螺旋：角度 + 半径 * 系数 + 时间流动 */
          '  float swirl = a + r * 3.1 - uTime * (0.55 + uPower * 0.9);',
          '  float arms = 0.5 + 0.5 * cos(swirl * 5.0);',
          '  float arms2 = 0.5 + 0.5 * cos(swirl * 11.0 + 1.7);',
          /* 越靠中心越暗、越往外越淡 */
          '  float core = smoothstep(0.30, 0.02, r);',
          '  float edge = smoothstep(1.0, 0.55, r);',
          '  float glow = (arms * 0.55 + arms2 * 0.22) * smoothstep(0.06, 0.75, r);',
          '  vec3 deep = vec3(0.045, 0.020, 0.075);',
          '  vec3 armc = vec3(0.42, 0.24, 0.62);',
          '  vec3 warm = vec3(0.55, 0.36, 0.16);',
          '  vec3 col = mix(deep, armc, glow);',
          '  col += warm * pow(glow, 3.0) * 0.35;',
          '  col *= mix(0.35, 1.0, smoothstep(0.02, 0.28, r));',
          '  col *= (1.0 - core * 0.92);',
          '  float alpha = edge * (0.55 + glow * 0.45);',
          '  gl_FragColor = vec4(col, alpha * 0.98);',
          '}'
        ].join('\n')
      });
    } catch (e0) {
      vortexMat = null;
    }

    var mouth;
    if (vortexMat) {
      mouth = new T.Mesh(new T.PlaneGeometry(15.4, 14.8), vortexMat);
    } else {
      /* 着色器不可用就退回贴图版，不让门洞变成白板 */
      var vortexTex = vortexTexture();
      mouth = new T.Mesh(
        new T.PlaneGeometry(15.4, 14.8),
        new T.MeshBasicMaterial({
          map: vortexTex, transparent: true, opacity: 1.0,
          depthWrite: false, fog: false, toneMapped: false
        })
      );
    }
    mouth.position.set(0, 5.6, -15.4);
    st.scene.add(mouth);
    S.vortex = mouth;
    S.vortexShader = !!vortexMat;

    /* ---------- 地面的火：贴地光斑 + 点光 ---------- */
    var cv = App.stage3d.canvas(256, 256), c = cv.getContext('2d');
    var g = c.createRadialGradient(128, 128, 6, 128, 128, 124);
    g.addColorStop(0, 'rgba(255,170,90,.85)');
    g.addColorStop(0.35, 'rgba(220,90,40,.35)');
    g.addColorStop(1, 'rgba(120,40,20,0)');
    c.fillStyle = g; c.beginPath(); c.arc(128, 128, 126, 0, 6.2832); c.fill();
    var fireTex = App.stage3d.tex(cv);
    var fires = [];
    [[-5.2, -7.6, 1.6], [5.4, -7.9, 1.4], [-1.0, -12.0, 1.0]].forEach(function (f) {
      var m = new T.Mesh(new T.PlaneGeometry(f[2] * 2.6, f[2] * 1.5),
        new T.MeshBasicMaterial({
          map: fireTex, transparent: true, opacity: 0.75,
          depthWrite: false, blending: T.AdditiveBlending, fog: false, toneMapped: false
        }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(f[0], 0.06, f[1]);
      st.scene.add(m);
      var lt = new T.PointLight(0xff7a2e, 2.2, 12, 2);
      lt.position.set(f[0], 1.0, f[1]);
      st.scene.add(lt);
      fires.push({ mesh: m, light: lt, base: f[2] });
    });
    S.lairFires = fires;

    /* ---------- 上升的火星 ---------- */
    var N = 120, pos = new Float32Array(N * 3), spd = [];
    for (var i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 13;
      pos[i * 3 + 1] = Math.random() * 6;
      pos[i * 3 + 2] = -8.6 - Math.random() * 6;
      spd.push(0.25 + Math.random() * 0.7);
    }
    var eg = new T.BufferGeometry();
    eg.setAttribute('position', new T.BufferAttribute(pos, 3));
    var embers = new T.Points(eg, new T.PointsMaterial({
      color: 0xffa25a, size: 0.07, transparent: true, opacity: 0.85,
      depthWrite: false, blending: T.AdditiveBlending, fog: false, sizeAttenuation: true
    }));
    st.scene.add(embers);
    S.lairEmbers = { mesh: embers, spd: spd };

    /* ---------- 深处那个巨大的身影 ---------- */
    var loader = new T.TextureLoader();
    loader.load('assets/gen/boss.png', function (tex) {
      tex.colorSpace = T.SRGBColorSpace;
      var w = 17.0, h = 28.0;
      var mat = new T.MeshBasicMaterial({
        map: tex, transparent: true, opacity: 0.0,
        color: 0x9a8d78, depthWrite: false, fog: true, toneMapped: true
      });
      var fig = new T.Mesh(new T.PlaneGeometry(w, h), mat);
      fig.position.set(0, h * 0.46, -11.0);
      fig.renderOrder = -1;
      st.scene.add(fig);
      S.ghostFigure = fig;
      var t0 = performance.now();
      (function fadeIn() {
        if (!fig.parent) { return; }
        var k = Math.min(1, (performance.now() - t0) / 1600);
        mat.opacity = 0.62 * (1 - Math.pow(1 - k, 3));
        if (k < 1) { requestAnimationFrame(fadeIn); }
      })();
    }, undefined, function () { /* 图没加载就只是一片黑洞，不影响玩 */ });
  }

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
             basePos: new T.Vector3(0, 3.45, -3.7) };
  }

  /* 把整字刻到 Boss 版心（阶段一用） */
  function engraveWhole(boss, ch, size) {
    var T = S.st.T;
    var g = boss.glyphG;
    while (g.children.length) { g.remove(g.children[0]); }
    /* 刻字时把字往前推一下：从版心后 0.30 处推出来，并放大一点再落定。
       骨版已经退到 z=-3.7，正好留出这段推出来的空间。 */
    var zEnd = g.position.z;
    g.position.z = zEnd - 0.30;
    g.scale.setScalar(0.86);
    (function pushForward() {
      var t0 = performance.now();
      (function step() {
        var k = Math.min(1, (performance.now() - t0) / 520);
        var e = 1 - Math.pow(1 - k, 3);
        g.position.z = (zEnd - 0.30) + 0.30 * e;
        g.scale.setScalar(0.86 + 0.14 * e + Math.sin(e * Math.PI) * 0.05);
        if (k < 1) { requestAnimationFrame(step); }
        else { g.position.z = zEnd; g.scale.setScalar(1); }
      })();
    })();
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

    var step = el('div', 'bd3-step');
    var tag = el('div', 'bd3-tag');

    var intro = el('div', 'bd3-intro');
    intro.innerHTML =
      '<div class="bd3-intro-card">' +
      '<h3>守字之骨 · 怎么打</h3>' +
      '<div class="sub">三 步 拆 一 个 字</div>' +
      '<ol>' +
      '<li><b>打散守阵兽</b>：它身前有一圈法阵，阵里的骨兽<em>点三下</em>就打散，散了才能动字。</li>' +
      '<li><b>拆字</b>：从下面四片骨里挑出能拼成这个字的那两块（挑错会掉护盾）。</li>' +
      '<li><b>断笔画 · 补古句</b>：第二段只点发亮的那一截；第三段给三句古文各补一个字。</li>' +
      '</ol>' +
      '<button>开 始</button>' +
      '</div>';

    /* 角落立绘已撤：改成场景深处的一张巨影（见 buildBossGhost） */
    [top, task, step, src, sayBox, flash, tag, win, intro, fade, load].forEach(function (n) {
      root.appendChild(n);
    });

    var startBtn = intro.querySelector('button');
    startBtn.onclick = function () {
      intro.classList.remove('on');
      S.intro = false;
      updateStep();
      /* 说明卡关掉的这一刻才算真的开打：一声低鼓，音乐也从头起，
         否则鼓点早在卡还没看完时就空转了好几拍。 */
      sfx('intro');
      if (App.battleMusic && App.battleMusic.start) { App.battleMusic.start(1); }
    };

    S.ui = { top: top, stages: stages, name: nm, hp: hpI, q: q, tip: tip,
             src: src, say: sayBox, flash: flash, fade: fade, load: load, win: win,
             step: step, tag: tag, intro: intro };
  }

  function setPhase(n) {
    S.phase = n;
    if (App.battleMusic && App.battleMusic.setPhase) { App.battleMusic.setPhase(n); }
    /* 一阶段是开局，不敲锣；二、三阶段各敲一声，作为"这一层拆完了"的分句 */
    if (n >= 2) { sfx('phaseUp'); }
    if (typeof updateStep === 'function') { updateStep(); }
    for (var i = 0; i < S.uiStages.length; i++) {
      S.uiStages[i].className = 'bd3-st' + (i + 1 === n ? ' on' : (i + 1 < n ? ' done' : ''));
    }
  }
  function setHp(v) {
    /* 血条不是"生命值"，是骨版的护盾强度：它到 0 不会输，
       而是重新绷紧到 55 —— 原型阶段不做失败态，免得演示时卡在空血里。 */
    if (v <= 0) {
      S.hp = 55;
      say('<b>提示</b>：它把护盾又绷紧了一层。慢慢来，别乱点。', 2600);
    } else {
      S.hp = Math.min(100, v);
    }
    S.ui.hp.style.width = S.hp + '%';
  }
  function task(html, tip) {
    S.baseTip = tip || '';
    S.ui.q.innerHTML = html;
    S.ui.tip.innerHTML = renderTip();
  }

  /* 提示行 = 本阶段的说明 + 守阵兽状态（活着时压在前面） */
  function renderTip() {
    var gd = S.guard;
    var base = S.baseTip || '';
    if (gd && !gd.dead) {
      /* 步骤条已经写了"点谁、差几下"，这里只留操作说明，避免同一句话出现两遍 */
      return base;
    }
    return base;
  }
  function refreshTip() {
    if (S.ui && S.ui.tip) { S.ui.tip.innerHTML = renderTip(); }
  }

  /* 打一下守阵兽：受击反馈 + 计数；打散后才解锁本阶段的拆字 */
  function hitGuard() {
    var gd = S.guard;
    if (!gd || gd.dead || S.phase === 9) { return; }
    gd.hp -= 1;
    gd.hitT = 0.24;
    flash('hit');
    sfx('strike', 1.0);
    var T = S.st.T;
    var wp = new T.Vector3();
    gd.beast.getWorldPosition(wp);
    S.bursts.push(debris(S.st, wp, 22, 0xffd9a0));
    updateStep();
    if (gd.hp <= 0) {
      killGuard();
    } else {
      refreshTip();
      say('<b>提示</b>：打中了，还差 ' + gd.hp + ' 下。', 1600);
    }
  }

  function killGuard() {
    var gd = S.guard;
    if (!gd || gd.dead) { return; }
    gd.dead = true;
    S.guardDead = true;
    updateStep();
    var T = S.st.T;
    var wp = new T.Vector3();
    gd.beast.getWorldPosition(wp);
    S.bursts.push(debris(S.st, wp, 70, 0xffcf96));
    flash('hit');
    sfx('shatter');
    var t0 = 0, g = gd;
    S.bursts.push(function (dt) {
      t0 += dt;
      var e = Math.min(1, t0 / 0.9);
      g.beast.scale.setScalar((0.02 + 1.55) * (1 - e));
      g.beast.rotation.y += dt * 6;
      if (g.r1) { g.r1.material.opacity = Math.max(0, 0.72 * (1 - e)); }
      if (g.r2) { g.r2.material.opacity = Math.max(0, 0.72 * (1 - e)); }
      if (e >= 1) {
        if (g.beast.parent) { g.beast.parent.remove(g.beast); }
        return false;
      }
      return true;
    });
    refreshTip();
    say('<b>提示</b>：守阵的' + gd.name + '散了，去拆它的字。', 2600);
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
    p.userData = { debris: true };
    st.scene.add(p);
    /* 兜底：不管队列有没有跑到，1.5 秒后一定从场景里摘掉，绝不留残渣 */
    setTimeout(function () {
      if (p.parent) { p.parent.remove(p); }
      try { geo.dispose(); mat.dispose(); } catch (e) {}
    }, 1500);
    var life = 1.1;
    /* 返回"可调用函数"：S.bursts 队列是按 fn(dt) 调的，
       原来返回 {obj, update} 对象 → 每帧抛 TypeError → 队列清不掉 →
       粒子冻结，画面上就剩一层碎屑残渣。 */
    var step = function (dt) {
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
    };
    step.obj = p;
    return step;
  }

  /* 换阶段时把还挂着的碎屑一次清干净，避免上一轮的粒子留在新场景里 */
  function clearDebris() {
    if (!S.st || !S.st.scene) { return; }
    var del = [];
    S.st.scene.traverse(function (o) {
      if (o.isPoints && o.geometry && o.material && o.material.transparent &&
          o !== (S.sigil && S.sigil.grp) && o.userData && o.userData.debris) {
        del.push(o);
      }
    });
    del.forEach(function (o) {
      if (o.parent) { o.parent.remove(o); }
      try { o.geometry.dispose(); o.material.dispose(); } catch (e) {}
    });
  }

  /* ================= 阶段一：构件拆解 ================= */
  /* ============================================================
     步骤条 / 跟随标签 / 开场说明
     ------------------------------------------------------------
     用户反馈"第三关玩法不明确"：三类操作（点守阵兽 / 点骨片 / 点笔画）
     在画面上长得一样，光靠一句提示分不清"现在该点哪个"。
     所以：常驻一条"第几步 · 做什么 · 还差多少"，
     再给守阵兽头顶挂一个跟随标签，明确它是可点的。
     ============================================================ */
  /* ============================================================
     悬停 / 光环
     ------------------------------------------------------------
     这一关的三种可点对象（构件骨片、笔画段、古句字骨）在静止时长得一样，
     光靠步骤条说"点下面四片"还是不够 —— 鼠标移上去要立刻有反应：
     抬起 6%、边缘发光、鼠标变手型。
     ============================================================ */
  function isPickableObj(o) {
    if (!o || !o.userData) { return false; }
    if (o.userData.alive === false) { return false; }
    return o.userData.tag === 'comp' || o.userData.tag === 'opt' ||
      o.userData.strokeIndex != null;
  }

  function findPickable(hits) {
    for (var i = 0; i < hits.length; i++) {
      var p = hits[i].object;
      while (p) {
        if (isPickableObj(p)) { return p; }
        p = p.parent;
      }
    }
    return null;
  }

  function hoverOn(o) {
    if (!o.userData._hover) {
      o.userData._hover = {
        sx: o.scale.x, sy: o.scale.y, sz: o.scale.z,
        glow: o.userData.hoverGlow == null ? null : o.userData.hoverGlow
      };
    }
    var k = 1.06;
    o.scale.set(o.userData._hover.sx * k, o.userData._hover.sy * k, o.userData._hover.sz * k);
    o.traverse(function (m) {
      if (m.material && !Array.isArray(m.material) && m.material.emissive) {
        if (m.userData._hoverEmissive == null) {
          m.userData._hoverEmissive = m.material.emissiveIntensity;
        }
        m.material.emissiveIntensity = Math.max(m.material.emissiveIntensity || 0, 0.55);
        m.material.emissive.setHex(0xffb264);
      }
    });
  }

  function hoverOff(o) {
    var h = o.userData._hover;
    if (h) {
      o.scale.set(h.sx, h.sy, h.sz);
      o.userData._hover = null;
    }
    o.traverse(function (m) {
      if (m.material && !Array.isArray(m.material) && m.material.emissive &&
          m.userData._hoverEmissive != null) {
        m.material.emissiveIntensity = m.userData._hoverEmissive;
        m.userData._hoverEmissive = null;
      }
    });
  }

  function bindHover(st) {
    var hovered = null;
    st.el.addEventListener('pointermove', function (e) {
      if (S.intro || S.phase === 9) {
        if (hovered) { hoverOff(hovered); hovered = null; st.el.style.cursor = ''; }
        return;
      }
      var hits = [];
      try { hits = st.raycast(st.ndc(e.clientX, e.clientY)) || []; } catch (err) { hits = []; }
      var ob = findPickable(hits);
      if (ob === hovered) { return; }
      if (hovered && hovered.parent) { hoverOff(hovered); }
      hovered = ob;
      if (hovered) { hoverOn(hovered); sfx('select'); }
      st.el.style.cursor = hovered ? 'pointer' : '';
    });
    st.el.addEventListener('pointerleave', function () {
      if (hovered) { hoverOff(hovered); hovered = null; }
      st.el.style.cursor = '';
    });
    S._hoverRef = function () { if (hovered) { hoverOff(hovered); hovered = null; } };
  }

  /* 光环：第二阶段的"该点这一截"，除了烧红，再给一圈呼吸的光 */
  function ensureHalo() {
    if (S.halo) { return S.halo; }
    var T = S.st.T;
    var mat = new T.MeshBasicMaterial({
      color: 0xffb264, transparent: true, opacity: 0.6,
      side: T.DoubleSide, depthWrite: false, depthTest: false, fog: false,
      blending: T.AdditiveBlending, toneMapped: false
    });
    var halo = new T.Mesh(new T.RingGeometry(0.52, 0.66, 48), mat);
    halo.renderOrder = 8;
    S.st.scene.add(halo);
    S.halo = halo;
    return halo;
  }

  function updateHalo(dt, t) {
    var pd = S.phaseData;
    var ref = (pd && pd.target != null && S.strokeRefs) ? S.strokeRefs[pd.target] : null;
    var halo = S.halo;
    if (S.phase !== 2 || !ref || !ref.parent || ref.userData.alive === false) {
      if (halo) { halo.visible = false; }
      return;
    }
    halo = ensureHalo();
    halo.visible = true;
    var T = S.st.T;
    var wp = new T.Vector3();
    ref.getWorldPosition(wp);
    halo.position.copy(wp);
    halo.scale.setScalar(1 + Math.sin(t * 3.1) * 0.12);
    halo.material.opacity = 0.45 + Math.sin(t * 3.1) * 0.22;
    halo.quaternion.copy(S.st.camera.quaternion);
  }

  function updateStep() {
    var u = S.ui && S.ui.step;
    if (!u) { return; }
    var gd = S.guard;
    var txt = '';
    if (S.phase === 9) {
      txt = '<b>已通过</b>';
    } else if (gd && !gd.dead) {
      txt = '<i>第 1 步</i> <b>点守阵的「' + gd.name + '」</b> <i>还差 ' + gd.hp + ' 下</i>';
    } else if (S.phase === 1) {
      var d1 = S.phaseData || { need: [] };
      txt = '<i>第 2 步</i> <b>从四片骨里挑出能拼成「' + PHASE1_CHAR + '」的两块</b>' +
        '<i>已拆 ' + (2 - (d1.need || []).length) + ' / 2</i>';
    } else if (S.phase === 2) {
      txt = '<i>第 2 步</i> <b>点发亮的那一段，把「' + PHASE2_CHAR + '」拆成笔画</b>';
    } else if (S.phase === 3) {
      txt = '<i>第 3 步</i> <b>给三句古文各补一个字</b>';
    }
    u.innerHTML = txt;
    u.style.display = txt ? 'flex' : 'none';
  }

  /* 守阵兽头顶的标签：每帧把世界坐标投影到屏幕 */
  function positionTag() {
    var t = S.ui && S.ui.tag;
    if (!t) { return; }
    var gd = S.guard;
    if (!gd || gd.dead || !gd.beast || !gd.beast.parent || S.phase === 9) {
      t.classList.remove('on');
      return;
    }
    var T = S.st.T;
    var v = new T.Vector3();
    gd.beast.getWorldPosition(v);
    v.y += 0.55;
    v.project(S.st.camera);
    if (v.z > 1) { t.classList.remove('on'); return; }
    var w = S.root.clientWidth || 1440, h = S.root.clientHeight || 900;
    t.style.left = Math.round((v.x * 0.5 + 0.5) * w) + 'px';
    t.style.top = Math.round((-v.y * 0.5 + 0.5) * h) + 'px';
    t.textContent = '点我 ' + gd.hp + ' 下';
    t.classList.add('on');
  }

  function clearWidgets() {
    var st = S.st;
    for (var i = 0; i < S.widgets.length; i++) {
      var w = S.widgets[i];
      /* 法阵与守阵兽要活过整段关卡：阶段三里 showQuestion() 每问一句都会清场，
         原来把法阵一起清了，兽体就永远停在 scale 0.02（羽毛鸟"没有"就是这个）
         清理时跳过它，由 summonPhase 自己在换阶段时替换。 */
      if (w.userData && w.userData.persist) { continue; }
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
    /* 换阶段：先把上一座法阵拆掉 */
    if (S.sigil && S.sigil.grp && S.sigil.grp.parent) {
      S.sigil.grp.parent.remove(S.sigil.grp);
    }
    /* 守阵兽登场：一声低吼，法阵亮起来之前就有东西了 */
    sfx('roar');
    var T = st.T;
    var grp = new T.Group();
    /* 原来在 3.35，正好落在四片构件骨（z=4.2）后面 —— 玩家点不到守阵兽。
       挪到构件骨之前，先看见、先打。 */
    grp.position.set(0, 0.02, 5.55);

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

    /* 隐形大球：兽体本身是多面体 + 细腿，射线很容易从缝里穿过去。
       给它一个 r=1.1 的透明球当点击区，点哪儿都算点中。 */
    var hit = new T.Mesh(
      new T.SphereGeometry(1.1, 12, 10),
      new T.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    );
    hit.position.set(0, 0.55, 0.06);
    hit.userData.guard = true;
    hit.userData.pickable = true;
    grp.add(hit);
    S.guardHit = hit;

    var lamp = new T.PointLight(0xffb066, 0, 9, 2);
    lamp.position.set(0, 0.6, 0.2);
    grp.add(lamp);

    addWidget(grp);
    S.sigil = {
      grp: grp, r1: r1, r2: r2, runes: runes, beast: beast, lamp: lamp,
      t: 0, phase: n, beastY: 1.75
    };

    /* 守阵兽参与判定：3 下打散，散了才允许动 Boss 的字 */
    var GUARD_NAME = { 1: '骨甲虫', 2: '骨蛇', 3: '羽骨鸟' };
    grp.userData.guard = true;
    grp.userData.persist = true;   /* 清场时不拆（见 clearWidgets） */
    S.guard = {
      hp: 3, max: 3, dead: false, phase: n,
      name: GUARD_NAME[n] || '守阵骨兽',
      grp: grp, beast: beast, hitT: 0
    };
    S.guardDead = false;
    refreshTip();
  }

  /* 跑一次性动画队列：调用方可能是函数，也可能是老的 {update} 对象（兼容） */
  function tickBursts(dt) {
    if (!S.bursts || !S.bursts.length) { return; }
    for (var bi = S.bursts.length - 1; bi >= 0; bi--) {
      var b = S.bursts[bi];
      try {
        var keep = (typeof b === 'function')
          ? b(dt)
          : (b && typeof b.update === 'function' ? b.update(dt) : false);
        if (!keep) { S.bursts.splice(bi, 1); }
      } catch (e) {
        S.bursts.splice(bi, 1);   /* 坏掉的项直接丢，别堵住队列 */
      }
    }
  }

  function tickSigil(dt) {
    var g = S.sigil;
    if (!g) { return; }
    if (!g.grp.parent && S.st) {
      /* 自愈：被别的清场逻辑顺手摘掉时就挂回去 */
      S.st.scene.add(g.grp);
      g.t = 0;
    }
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
    g.beast.scale.setScalar(0.02 + 1.72 * re);
    g.beast.rotation.y += dt * 0.75;
    g.beast.rotation.z = Math.sin(g.t * 1.1) * 0.06;
    /* 受击：短暂的横向抖动 + 放大，让"打中了"有手感 */
    /* 点击球跟着兽体升降 */
    if (S.guardHit && S.guard && !S.guard.dead) {
      S.guardHit.position.y = g.beast.position.y + 0.55;
      S.guardHit.visible = true;
    } else if (S.guardHit) {
      S.guardHit.visible = false;
    }
    if (S.guard && S.guard.hitT > 0) {
      S.guard.hitT -= dt;
      var hk = Math.max(0, S.guard.hitT / 0.24);
      g.beast.position.x = Math.sin(g.t * 90) * 0.10 * hk;
      g.beast.scale.setScalar(g.beast.scale.x * (1 + 0.12 * hk));
    } else if (S.guard && !S.guard.dead) {
      g.beast.position.x = 0;
    }
  }

  /* 立绘浮出：进阶段时亮 2.6 秒，然后收回，避免长期挡画面 */
  /* 原来这里控制角落立绘；现在立绘搬进场景深处，保留空实现避免调用处报错 */
  function showFace() {
    if (S.ghostFigure) {
      var t0 = performance.now();
      S.ghostFigure.userData.glowT = t0;
    }
  }



  function startPhase1() {
    clearDebris();
    setPhase(1);
    clearWidgets();
    summonPhase(1);
    showFace();
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
    /* 候选从 4 片加到 6 片：只有四片时"排除法"太好用，一阶几乎不用看字 */
    while (picks.length < 4 && pal.length) {
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
      var p = makePlate(st, all[k], 0.98, { seed: 300 + k * 11, tag: 'comp' });
      p.position.set(-4.10 + k * 1.64, 2.35, 4.2);
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
        sfx('crack', 1.0);
        setHp(S.hp - 12);
        S.bursts.push(debris(S.st, new S.st.T.Vector3(0, 3.4, -2.4), 46, 0xffd9a0));
      }, 10);
      /* 用 tick 做飞行动画，见 tickWidgets */
      d.need.splice(d.need.indexOf(ch), 1);
      d.got.push(ch);
      say('<b>提示</b>：拆下来了——「' + ch + '」。', 2200);
      if (!d.need.length) {
        later(function () { phase1Done(); }, 900);
        updateStep();
      } else {
        later(function () { S.busy = false; }, 700);
      }
    } else {
      /* 错误：骨片弹一下，护盾亮起 */
      d.wrong++;
      S.wrong++;
      obj.userData.kick = 0.4;
      shakeBoss(0.25);
      sfx('wrong');
      say('<b>提示</b>：这片拼不出「' + PHASE1_CHAR + '」。它一半是水，一半是石头。', 2600);
      setHp(S.hp - 4);
    }
  }

  function phase1Done() {
    setPhase(2);
    shieldBurst(function () { startPhase2(); });
  }

  /* ================= 阶段二：笔画拆解 ================= */
  /* 阶段二拆两个字的笔画：木 → 水 */
  var PHASE2_SEQ = ['木', '水'];
  var PHASE2_DESC = {
    '木': '「<em>木</em>」是一棵树的正面：上为枝，中为干，下为根。',
    '水': '「<em>水</em>」是一条主流加两侧水点 —— 水没有固定形状。'
  };

  function startPhase2() {
    clearDebris();
    setPhase(2);
    clearWidgets();
    summonPhase(2);
    showFace();
    S.p2Index = 0;
    strokeRound(S.st, S.boss);
  }

  function strokeRound(st, boss) {
    var ch = PHASE2_SEQ[S.p2Index % PHASE2_SEQ.length];
    var strokes = engraveStrokes(boss, ch, 1.72);
    S.strokeRefs = strokes;
    S.phaseData = { remain: strokes.length, target: -1, wrong: 0, timer: 0, ch: ch };
    S.ui.name.textContent = '守字之骨 · ' + ch;
    task((PHASE2_DESC[ch] || '') + '<br>点中发光的那一段，把它折断。',
      '第 <b>' + (S.p2Index + 1) + '/' + PHASE2_SEQ.length + '</b> 个字 · 共 <b>' +
      strokes.length + '</b> 段 · 点错会反噬');
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
      sfx('crack', 0.9);
      setHp(S.hp - 14);
      d.remain--;
      say('<b>提示</b>：断了一段。', 1200);
      if (d.remain <= 0) {
        S.busy = true;
        later(function () {
          task('这一段拆完了。', '');
          if (S.p2Index + 1 < PHASE2_SEQ.length) {
            S.p2Index += 1;
            strokeRound(S.st, S.boss);
          } else {
            shieldBurst(function () { startPhase3(); });
          }
        }, 700);
      } else {
        pickNextStroke();
      }
    } else {
      d.wrong++;
      S.wrong++;
      obj.userData.kick = 0.35;
      shakeBoss(0.2);
      sfx('wrong');
      say('<b>提示</b>：这一段还连得好好的。找那截在发光的。', 2200);
      setHp(S.hp - 5);
    }
  }

  /* 护盾炸裂：三圈环向外飞散 + 白光 + 骨屑 */
  function shieldBurst(done) {
    var T = S.st.T;
    var shields = S.boss.shields;
    flash('hit');
    shakeBoss(1.6);
    sfx('shieldBreak');
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
    clearDebris();
    setPhase(3);
    clearWidgets();
    summonPhase(3);
    showFace();
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
      '<span class="bd3-kai">字片即甲骨字形 · Boss 身上是同一个字</span>';
    S.ui.src.classList.remove('on');

    /* 四个选项：正确 + 干扰。干扰要"模棱两可但不能也对"：
       从同义/同类字里取，且保证不在本句里出现过。 */
    var pool = ['日', '月', '山', '木', '火', '田', '口', '目', '女', '子', '牛', '羊', '鱼', '禾', '石', '川'];
    var opts = [q.miss];
    var R = rnd(1000 + S.qIndex * 37);
    var guard = 0;
    while (opts.length < 6 && guard++ < 200) {
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
      var p = makePlate(st, opts[m], 1.04, { seed: 500 + m * 13, tag: 'opt' });
      p.position.set(-3.55 + m * 1.42, 1.62, 4.6);
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
        sfx('crack', 1.1);
        setHp(S.hp - 11);
        S.ui.src.innerHTML = '「' + q.miss + '」　' + q.from + '　·　' + q.gloss;
        S.ui.src.classList.add('on');
        say('<b>提示</b>：对了。' + q.gloss, 3200);
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
      sfx('wrong');
      setHp(S.hp - 4);
      say('<b>提示</b>：这一句的意思对不上这个字。再看一遍句子。', 2400);
    }
  }

  /* ================= 胜利 / 败退 ================= */
  function win() {
    clearWidgets();
    if (App.battleMusic) { App.battleMusic.finish(); }
    if (App.progress) {
      App.progress.boss({
        cleared: true,
        secs: Math.max(1, Math.round((performance.now() - (S.t0 || performance.now())) / 1000)),
        wrong: S.wrong || 0
      });
    }
    S.phase = 9;
    var T = S.st.T;
    var boss = S.boss;
    /* 定格用时：S.elapsed 每帧都在被 tick 覆盖，等到 1.5 秒后弹面板时
       读到的已经不是"打通那一刻"了（截图里显示 5s 就是这么来的）。 */
    S.finalElapsed = (performance.now() - S.t0) / 1000;
    var st = S.st;

    /* 骨版被吸回漩涡：先浮起来，再往洞口方向飞、越转越快、越缩越小、最后淡掉 */
    S.suck = 2.4;                       /* 漩涡加速 */
    sfx('suck');                        /* 2.4 秒上升涡流，正好压住这段吸入动画 */
    var t0 = 0;
    var from = boss.root.position.clone();
    var to = new T.Vector3(0, 5.2, -12.4);
    var mats = [];
    boss.root.traverse(function (m) {
      if (m.material && !Array.isArray(m.material)) {
        if (!m.material._suctioned) {
          m.material = m.material.clone();
          m.material._suctioned = true;
        }
        m.material.transparent = true;
        mats.push(m.material);
      }
    });
    /* 这段不用 tick 的 bursts 队列：那条队列在通关后不一定还在跑。
       自带一条 rAF，稳。 */
    var tPrev = performance.now();
    (function suckStep() {
      var now = performance.now();
      var dt2 = Math.min(0.05, (now - tPrev) / 1000);
      tPrev = now;
      t0 += dt2;
      var e = Math.min(1, t0 / 2.1);
      var k = e * e;                    /* 加速：越靠近洞口越快 */
      boss.root.position.lerpVectors(from, to, k);
      boss.root.rotation.y += dt2 * (1.2 + k * 9);
      boss.root.rotation.z = Math.sin(t0 * 5) * 0.25 * (1 - k);
      boss.root.scale.setScalar(1 - k * 0.94);
      for (var mi = 0; mi < mats.length; mi++) {
        mats[mi].opacity = 1 - Math.pow(e, 1.6);
      }
      if (e >= 1) {
        boss.root.visible = false;
        S.suck = 1.0;
        return;
      }
      requestAnimationFrame(suckStep);
    })();
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
    }, 2600);
  }

  function showWin() {
    var w = S.ui.win;
    var secs = Math.max(1, Math.round(S.finalElapsed || S.elapsed));
    w.innerHTML = '';
    var card = el('div', 'bd3-card');
    if (!document.getElementById('bd3-gb-style')) {
      var st2 = document.createElement('style');
      st2.id = 'bd3-gb-style';
      st2.textContent =
        '.bd3-gb{display:flex;align-items:center;gap:12px;justify-content:center;' +
        'margin:2px 0 14px;animation:bd3gb 700ms cubic-bezier(.2,.9,.3,1.4) both}' +
        '@keyframes bd3gb{0%{opacity:0;transform:translateY(18px) scale(.86)}' +
        '60%{opacity:1;transform:translateY(-4px) scale(1.03)}100%{opacity:1;transform:none}}' +
        '.bd3-gb img{width:76px;height:auto;display:block;' +
        'filter:drop-shadow(0 10px 16px rgba(0,0,0,.5))}' +
        '.bd3-gb span{font-size:13px;color:#d8c6a4;letter-spacing:.05em;line-height:1.6;' +
        'text-align:left;max-width:15em}';
      document.head.appendChild(st2);
    }
    card.innerHTML =
      (SHOW_GB ? '<div class="bd3-gb"><img src="assets/guibao-front.png" alt="龟宝">' +
        '<span><b>提示</b>：守字之骨散了。<br>你看，骨头碎了，字留下来了。</span></div>' : '') +
      '<div class="wseal">骨</div>' +
      '<div class="bd3-grade' + (S.wrong === 0 ? '' : (S.wrong <= 3 ? '' : ' low')) + '">' +
      '<div><span>' + (S.wrong === 0 ? '上上' : (S.wrong <= 3 ? '上' : '中')).slice(0, 1) + '</span>' +
      '<div class="gl">' + (S.wrong === 0 ? '无失' : (S.wrong <= 3 ? '小失' : '有失')) + '</div></div>' +
      '</div>' +
      '<div class="bd3-dust"></div>' +
      '<div class="wk">第三关 · 通过</div>' +
      '<div class="wt">守字之骨已散</div>' +
      '<div class="ws">构件拆了，笔画断了，残句也补齐了。<br>' +
      '这三个字不是被记住的，是被你拆开又装回去的。</div>' +
      '<div class="wline"></div>' +
      '<div class="bd3-stats">' +
      '<div class="bd3-stat"><div class="v" data-to="' + secs + '">0s</div><div class="k">用时</div></div>' +
      '<div class="bd3-stat"><div class="v" data-to="' + S.wrong + '">0</div><div class="k">失误</div></div>' +
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
      '它们是这套字后来走过的路。Boss 身上那个「泉」才是商人刻在骨头上的写法。</div></div>' +
      (S.wrong === 0 ? '<div class="bd3-perfect">这一遍，一笔没断。</div>' : '');
    var row = el('div', 'wrow');
    var again = el('button', 'bd3-btn primary', '再来一次');
    again.onclick = function () { restart(); };
    var home = el('button', 'bd3-btn', '回馆');
    home.onclick = function () { location.hash = '#/museum'; };
    row.appendChild(again); row.appendChild(home);
    card.appendChild(row);
    w.appendChild(card);
    w.classList.add('on');

    /* ---------- 出场时序 ---------- */
    var seal = card.querySelector('.wseal');
    function countUp(node) {
      var to = parseInt(node.getAttribute('data-to'), 10) || 0;
      var suffix = /s$/.test(node.textContent) ? 's' : '';
      var t0 = performance.now(), dur = 620;
      (function step() {
        var k = Math.min(1, (performance.now() - t0) / dur);
        var e = 1 - Math.pow(1 - k, 3);
        node.textContent = Math.round(to * e) + suffix;
        if (k < 1) { requestAnimationFrame(step); }
      })();
    }
    requestAnimationFrame(function () { card.classList.add('in'); });
    setTimeout(function () {
      card.classList.add('typed');
      if (seal) { seal.classList.add('stamp', 'splat'); }
      /* 印章落纸的那一声（原来借的是馆里的"成功"提示音，太轻，压不住这张卡） */
      sfx('stamp');
    }, 300);
    /* 胜利的上行五声放在数字滚完、卡面落定之后 */
    setTimeout(function () { sfx('win'); }, 640);
    setTimeout(function () {
      card.classList.add('nummed');
      [].forEach.call(card.querySelectorAll('.bd3-stat .v[data-to]'), countUp);
      var grade = card.querySelector('.bd3-grade');
      if (grade) { grade.classList.add('on'); }
    }, 620);
    /* 骨屑：卡片落定后撒一把 */
    setTimeout(function () {
      var dust = card.querySelector('.bd3-dust');
      if (!dust) { return; }
      for (var di = 0; di < 18; di++) {
        var bit = document.createElement('i');
        bit.style.left = (6 + Math.random() * 88).toFixed(1) + '%';
        bit.style.top = (Math.random() * 18).toFixed(1) + '%';
        bit.style.animationDelay = (Math.random() * 380).toFixed(0) + 'ms';
        bit.style.opacity = (0.35 + Math.random() * 0.5).toFixed(2);
        if (Math.random() > 0.7) { bit.style.width = '3px'; bit.style.height = '3px'; }
        dust.appendChild(bit);
      }
      setTimeout(function () { if (dust.parentNode) { dust.parentNode.removeChild(dust); } }, 2200);
    }, 560);
    setTimeout(function () { card.classList.add('rows'); }, 980);
    setTimeout(function () { card.classList.add('acts'); }, 1320);

    /* 小彩蛋：点印章再砸一次（带朱砂溅点和声音） */
    if (seal) {
      seal.onclick = function () {
        seal.classList.remove('stamp', 'splat');
        void seal.offsetWidth;
        seal.classList.add('stamp', 'splat');
        sfx('stamp');
        sfx('crack', 0.5);
      };
    }
    /* 卡面轻微视差：鼠标在卡片范围内时，纸面跟着偏一点 */
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduce) {
      card.addEventListener('mousemove', function (e) {
        var r = card.getBoundingClientRect();
        var dx = (e.clientX - r.left) / r.width - 0.5;
        var dy = (e.clientY - r.top) / r.height - 0.5;
        card.style.transform = 'perspective(900px) rotateY(' + (dx * 3.2).toFixed(2) +
          'deg) rotateX(' + (-dy * 2.4).toFixed(2) + 'deg)';
      });
      card.addEventListener('mouseleave', function () {
        card.style.transform = '';
      });
    }
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
    positionTag();
    updateHalo(dt, t);
    /* 一次性动画（碎屑、护盾炸、崩解）放在最前面跑：
       原来它在阶段分支后面，某些阶段根本走不到，粒子就冻在原地成了"残渣"。 */
    tickBursts(dt);
    /* 战斗音乐自愈：进关卡时声音是关的，玩到一半打开了也要响 */
    if (App.battleMusic && !App.battleMusic.isPlaying() &&
        App.museumAudio && App.museumAudio.isOn && App.museumAudio.isOn() && S.phase !== 9) {
      App.battleMusic.start(S.phase || 1);
    }

    /* 门里的黑色漩涡 */
    if (S.vortex) {
      if (S.vortexShader && S.vortex.material.uniforms) {
        S.suckP = (S.suckP || 1.0) + (((S.suck || 1.0) - (S.suckP || 1.0)) * Math.min(1, dt * 2.2));
        S.vortex.material.uniforms.uTime.value += dt;
        S.vortex.material.uniforms.uPower.value = S.suckP;
        var pk0 = 1 + Math.sin(t * 0.7) * 0.012 + (S.suckP - 1) * 0.05;
        S.vortex.scale.set(pk0, pk0, 1);
        S.vortex.rotation.z -= dt * 0.10 * S.suckP;
      } else {
        S.vortex.rotation.z -= dt * 0.10;
        var pk = 1 + Math.sin(t * 0.7) * 0.012;
        S.vortex.scale.set(pk, pk, 1);
        S.vortex.material.opacity = 0.90 + Math.sin(t * 1.3) * 0.05;
      }
    }
    /* 深处的巨影：极慢摆动 */
    if (S.ghostFigure) {
      S.ghostFigure.position.x = Math.sin(t * 0.18) * 0.35;
      S.ghostFigure.rotation.z = Math.sin(t * 0.13) * 0.006;
    }
    /* 巢穴的火：光斑呼吸 + 火星上升 */
    if (S.lairFires) {
      for (var fi = 0; fi < S.lairFires.length; fi++) {
        var f2 = S.lairFires[fi];
        f2.light.intensity = 1.7 + Math.sin(t * 5.2 + fi * 1.7) * 0.5;
        f2.mesh.material.opacity = 0.62 + Math.sin(t * 4.1 + fi * 2.1) * 0.14;
      }
    }
    if (S.lairEmbers) {
      var ea = S.lairEmbers.mesh.geometry.attributes.position.array;
      for (var ei = 0; ei < S.lairEmbers.spd.length; ei++) {
        ea[ei * 3 + 1] += S.lairEmbers.spd[ei] * dt;
        if (ea[ei * 3 + 1] > 8.5) {
          ea[ei * 3 + 1] = 0.1;
          ea[ei * 3] = (Math.random() - 0.5) * 13;
          ea[ei * 3 + 2] = -8.6 - Math.random() * 6;
        }
      }
      S.lairEmbers.mesh.geometry.attributes.position.needsUpdate = true;
    }

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

    /* 一次性动画已移到 tick 顶部（见 tickBursts） */

    /* 龟宝 */
    if (S.guibao && S.guibao.update) {
      var focus = (S.phase === 2 && S.phaseData && S.phaseData.target >= 0);
      S.guibao.update(dt, { speed: 0, run: false, focus: focus });
    }

    S.elapsed = (performance.now() - S.t0) / 1000;
  }

  /* ================= 点击分发 ================= */
  function onPick(ev) {
    if (S.phase === 9 || S.intro) { return; }
    var o = ev.obj;
    if (!o) { return; }

    /* 1) 点到的如果是守阵兽，就是"打一下" */
    var g = o;
    while (g && !(g.userData && g.userData.guard)) { g = g.parent; }
    if (g && S.guard && !S.guard.dead) { hitGuard(); return; }

    /* 2) 守阵兽还活着：本阶段的字暂时不许动 */
    if (S.guard && !S.guard.dead) {
      say('<b>提示</b>：先把它召出来的' + S.guard.name + '打散。', 2000);
      return;
    }

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
      buildBossGhost(st);
      S.boss = makeBoss(st);

      var gb = SHOW_GB ? App.stage3d.makeGuibao(st.T, { scale: 1.35 }) : null;
      if (gb) {
        gb.root.position.set(-3.2, 0, 3.6);
        gb.root.rotation.y = 0.42;
        st.scene.add(gb.root);
        S.guibao = gb;
      }

      st.onTick(tick);
      st.onPick(onPick);
      bindHover(st);

      S.t0 = performance.now();
      setHp(100);
      startPhase1();
      /* 战斗音乐：和馆里「声音」开关联动 */
      if (App.battleMusic) { App.battleMusic.start(1); }
      showFace();
      /* 第一次进来先讲清楚怎么打；点「开始」才关 */
      S.intro = true;
      if (S.ui.intro) { S.ui.intro.classList.add('on'); }

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
    if (App.battleMusic) { App.battleMusic.stop(0.5); }
    if (S._hoverRef) { S._hoverRef(); S._hoverRef = null; }
    if (S.halo) {
      if (S.halo.parent) { S.halo.parent.remove(S.halo); }
      S.halo = null;
    }
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
    hitGuard: hitGuard, killGuard: killGuard,
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
