/* 演示点亮开关的核验表达式（配合 dev/_eval.js 用）。
   要证明四件事：
     ① 开关在、文案对；
     ② 打开后 5/5 片亮、每片 pin 都 lit；
     ③ **存档一个字节都没动**；
     ④ 关掉能回到真实进度。 */
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const Q = (s) => document.querySelector(s);
  const QA = (s) => Array.prototype.slice.call(document.querySelectorAll(s));
  await sleep(300);

  const btn = Q('.wy2-lite');
  if (!btn) {
    return { err: '没有找到 .wy2-lite', scene: (Q('.scene') || {}).className || null };
  }

  const readStore = () => {
    try { return String(JSON.stringify(App.store.get('wangyi', null))); } catch (e) { return 'ERR ' + e.message; }
  };
  const snap = () => {
    /* render() 会重建节点，所以每次都重新查——缓存引用读到的是旧文案 */
    const b = Q('.wy2-lite');
    return {
      text: b ? b.textContent : null,
      aria: b ? b.getAttribute('aria-pressed') : null,
      on: b ? b.classList.contains('on') : null,
      meter: (Q('.wy2-meter-line strong') || {}).textContent || null,
      words: (Q('.wy2-meter-words') || {}).textContent || null,
      glowOn: QA('.wy2-glow.on').length,
      glowAll: QA('.wy2-glow').length,
      pinLit: QA('.wy2-pin.lit').length,
      pinAll: QA('.wy2-pin').length
    };
  };

  const before = readStore();
  const s0 = snap();

  btn.click();
  await sleep(450);
  const s1 = snap();
  const afterOn = readStore();

  Q('.wy2-lite').click();
  await sleep(450);
  const s2 = snap();
  const afterOff = readStore();

  /* 顺带验一次小地图：演示态下进去，进度条与"已学完"文案要跟上 */
  Q('.wy2-lite').click();
  await sleep(350);
  const pins = QA('.wy2-pin');
  if (pins[0]) { pins[0].click(); }
  await sleep(700);
  const zone = {
    head: (Q('.wy2-zone-head span') || {}).textContent || null,
    fill: (Q('.wy2-zone-fill') || {}).style ? Q('.wy2-zone-fill').style.width : null,
    cardOpen: !!Q('.wy2-card, .wy2-learn, .wy2-sheet')
  };
  const back = Q('.wy2-back');
  if (back) { back.click(); }
  await sleep(600);
  const backOk = !!Q('.wy2-lite');

  return {
    s0, s1, s2, zone, backOk,
    storeUnchanged: before === afterOn && before === afterOff,
    storeSample: before.slice(0, 120),
    errs: (window.__errs || []).slice(0, 5)
  };
})()
