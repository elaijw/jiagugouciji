// 盘点字形库：哪些字有真字形、哪些没有（供选样时避开"没有字形"的字）
global.window = {};
require('../js/core/_data.js');
var p = window.App.glyphs.parts;
var ks = Object.keys(p);
console.log('总字数', ks.length);
['王', '车', '虎', '雨', '日', '月', '水', '马', '龙', '田', '山', '人', '涉', '既', '伐', '焚'].forEach(function (c) {
  console.log('  ' + c + '\t' + (!!p[c]));
});
console.log('全部：');
console.log(ks.join(' '));
