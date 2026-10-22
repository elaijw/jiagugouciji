/* 内置数据：由现有原型抽取，供各模式共用。*/
(function (App) {
  'use strict';
  var BUILTIN_PIECES = [
  {n:'日',s:'日',c:'natural'},{n:'月',s:'月',c:'natural'},{n:'雨',s:'雨',c:'natural'},
  {n:'水',s:'水',c:'natural'},{n:'火',s:'火',c:'natural'},{n:'山',s:'山',c:'natural'},
  {n:'田',s:'田',c:'natural'},{n:'木',s:'木',c:'natural'},
  {n:'人',s:'人',c:'body'},{n:'大',s:'大',c:'body'},{n:'女',s:'女',c:'body'},
  {n:'子',s:'子',c:'body'},{n:'目',s:'目',c:'body'},{n:'耳',s:'耳',c:'body'},
  {n:'口',s:'口',c:'body'},{n:'又',s:'又',c:'body'},{n:'止',s:'止',c:'body'},
  {n:'牛',s:'牛',c:'life'},{n:'羊',s:'羊',c:'life'},{n:'犬',s:'犬',c:'life'},
  {n:'豕',s:'豕',c:'life'},{n:'隹',s:'隹',c:'life'},{n:'鱼',s:'鱼',c:'life'},
  {n:'禾',s:'禾',c:'life'},{n:'屮',s:'屮',c:'life'},
  {n:'宀',s:'宀',c:'object'},{n:'门',s:'门',c:'object'},{n:'酉',s:'酉',c:'object'},
  {n:'斤',s:'斤',c:'object'},{n:'戈',s:'戈',c:'object'},{n:'矢',s:'矢',c:'object'},
  {n:'糸',s:'糸',c:'object'},{n:'囗',s:'囗',c:'object'},{n:'力',s:'力',c:'object'},
  {n:'贝',s:'贝',c:'object'},{n:'舟',s:'舟',c:'object'},{n:'卜',s:'卜',c:'object'}
];
  var BUILTIN_POOL = [
  {g:'明',w:'日+月',mean:'从日从月，日月相照',src:'贞：翌日其明？',lv:'通说',ref:''},
  {g:'休',w:'人+木',mean:'从人从木，人倚树而息',src:'贞：王休，无灾？',lv:'通说'},
  {g:'采',w:'又+木',mean:'从爪从木，手在树上摘取',src:'贞：呼采，受年？',lv:'通说'},
  {g:'相',w:'目+木',mean:'从目从木，以目视木',src:'贞：相其有灾？',lv:'通说'},
  {g:'集',w:'隹+木',mean:'从隹从木，鸟聚于树',src:'贞：其集于木？',lv:'通说'},
  {g:'鸣',w:'口+隹',mean:'从口从隹，鸟鸣于口',src:'贞：其鸣？',lv:'通说'},
  {g:'渔',w:'水+鱼',mean:'从水从鱼，水中取鱼',src:'贞：王渔，获？',lv:'通说'},
  {g:'涉',w:'水+止',mean:'从水从步，趟水过河',src:'贞：涉河，无灾？',lv:'通说'},
  {g:'析',w:'木+斤',mean:'从木从斤，以斧劈木',src:'贞：析木，吉？',lv:'通说'},
  {g:'焚',w:'木+火',mean:'从林从火，以火烧林',src:'贞：焚，其雨？',lv:'通说'},
  {g:'取',w:'又+耳',mean:'从又从耳，以手取耳（古以割耳计功）',src:'贞：取，获？',lv:'通说'},
  {g:'及',w:'人+又',mean:'从人从又，手自后及人',src:'贞：及，其来？',lv:'通说'},
  {g:'秉',w:'又+禾',mean:'从又从禾，手持禾束',src:'贞：秉禾，受年？',lv:'通说'},
  {g:'逐',w:'止+豕',mean:'从止从豕（或从犬），追豕',src:'贞：王其逐，获？',lv:'通说'},
  {g:'获',w:'又+隹',mean:'从又从隹，捕获鸟',src:'贞：田，获？',lv:'通说'},
  {g:'家',w:'宀+豕',mean:'从宀从豕，屋下养豕',src:'贞：家，无灾？',lv:'通说'},
  {g:'安',w:'宀+女',mean:'从宀从女，室中有女则安',src:'贞：安，吉？',lv:'通说'},
  {g:'灾',w:'宀+火',mean:'从宀从火，屋中起火为灾',src:'贞：其有灾？',lv:'通说'},
  {g:'牢',w:'宀+牛',mean:'从宀（或从囗）从牛，圈养之牛',src:'贞：牢，其雨？',lv:'通说'},
  {g:'牧',w:'牛+又',mean:'从牛从攴，驱牛放牧',src:'贞：牧于田？',lv:'通说'},
  {g:'兵',w:'又+斤',mean:'从廾从斤，双手持斧',src:'贞：兵，其来？',lv:'通说'},
  {g:'伐',w:'人+戈',mean:'从人从戈，以戈击人',src:'贞：伐某方，受有祐？',lv:'通说'},
  {g:'得',w:'又+贝',mean:'从又从贝（或从彳），手持贝为得',src:'贞：得，吉？',lv:'通说'},
  {g:'受',w:'又+舟',mean:'从爪从又从舟，一手授一手受',src:'贞：受年？',lv:'通说'},
  {g:'共',w:'又+口',mean:'从廾从某物，双手供奉',src:'贞：共，吉？',lv:'通说'},
  {g:'闻',w:'耳+口',mean:'从耳从口，以耳闻声',src:'贞：闻，其来？',lv:'通说'},
  {g:'卜',w:'卜',mean:'象灼骨所现之裂纹，为卜兆本形',src:'贞：卜，其雨？',lv:'通说'},
  {g:'即',w:'口+人',mean:'从皀从卩，人就食器（与“既”相对）',src:'贞：即，食？',lv:'有讨论'},
  {g:'既',w:'口+人',mean:'从皀从旡，食毕回首（与“即”相对）',src:'贞：既，雨？',lv:'有讨论'},
  {g:'饮',w:'人+酉',mean:'从人从酉（或从欠），俯首就酒器',src:'贞：饮，吉？',lv:'有讨论'},
  {g:'保',w:'人+子',mean:'从人从子，负子于背',src:'贞：保，无灾？',lv:'有讨论'},
  {g:'孕',w:'人+子',mean:'从人从子，人腹中有子',src:'贞：孕，其嘉？',lv:'有讨论'},
  {g:'乳',w:'人+子',mean:'象母抱子哺乳之形',src:'贞：乳，吉？',lv:'有讨论'},
  {g:'弃',w:'子+又',mean:'从子从廾（箕），双手弃子，反映古俗',src:'贞：弃，其雨？',lv:'有讨论'}
];
  var DIVINE = [
  {t:'受年',q:'贞：今岁受年？',gain:'田 禾 牛',ok:'今年有好收成',bad:'岁不熟'},
  {t:'其雨',q:'贞：其雨？',gain:'水 雨 日',ok:'果然下雨',bad:'不雨'},
  {t:'田猎',q:'贞：王其田，无灾？',gain:'犬 豕 隹 矢',ok:'田猎有获',bad:'无获遇险'},
  {t:'征伐',q:'贞：伐某方，受有祐？',gain:'戈 矢',ok:'受有祐',bad:'弗受祐'},
  {t:'祭祀',q:'贞：燎于河？',gain:'酉 囗 宀',ok:'神享其祭',bad:'神弗享'}
];
  var PIECE_CATS = [
  {k:'natural', n:'自然'}, {k:'body', n:'人体'},
  {k:'life', n:'动植物'}, {k:'object', n:'器物建筑'}
];
  var DIFF = {
  easy:   {label:'入门', timeScale:1.5,  poolFilter:'easy',
           hint:true,  divine:true,  fastRatio:0.65, timeoutPen:1, divineRisk:false},
  normal: {label:'进阶', timeScale:1.0,  poolFilter:'all',
           hint:true,  divine:true,  fastRatio:0.50, timeoutPen:2, divineRisk:true},
  hard:   {label:'挑战', timeScale:0.75, poolFilter:'hard',
           hint:false, divine:true,  fastRatio:0.35, timeoutPen:3, divineRisk:true}
};

  App.data = {
    BUILTIN_PIECES: BUILTIN_PIECES,
    BUILTIN_POOL: BUILTIN_POOL,
    DIVINE: DIVINE,
    PIECE_CATS: PIECE_CATS,
    DIFF: DIFF,
  };
})(window.App = window.App || {});