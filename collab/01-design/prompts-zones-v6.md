# 第二关五图 · 出图关键词 v6

> ⚠ 已被 [prompts-all-maps-v6.md](prompts-all-maps-v6.md) 取代（那份是六张全量、可直接粘）。
> 本文件保留的是：为什么现在的图不行、局部重绘怎么做、水印问题。

> 现在的图问题不在"画得不好看"，在**该出现的东西没出现、或者小到点不中**。
> 这份文件只解决这一件事：把"要认的东西"写进关键词，并且强迫它们大。
> 对应 art-brief-zones.md 的要求，坐标以 `js/core/_data.js` 里 zones[].objects 为准。

---

## 〇、先看三条（不改这三条，换多少关键词都一样）

1. **一张图的天花板是 6–9 件大物件。**
   16:9 画面里，每件要占到画面宽 ≥8%（约 210px），横排最多 8 个、纵排最多 5 排，
   再往上就必然出现"远景小点"。人居现在 33 件——这不是关键词问题，是内容问题，见第六节。

2. **物件清单写在提示词最前面，风格写在后面。**
   模型对开头 1/3 的权重最高。先写"这张画里必须有 A、B、C、D"，再写"水墨、旧绢、留白"。
   反过来写（先风格再物件），出来的就是现在这样：一幅好看的风景，物件是背景里的小点。

3. **每件必须带齐"大小 + 朝向 + 位置"三件套，并且明写"分开"。**
   ❌「有一头牛」 ✅「一头比人还高的黄牛，侧面站立，站在画面中部浅水里」
   ❌「有鹿有牛有虎」 ✅「……，九种动物各占一块地方、彼此不遮挡」

另外两件必须写进负面的（现在的图全中）：
- **远景小点**：「远景里的小人、小舟、成群的鸟、指甲盖大的物体」
- **水印字样**：现在六张图右下角都有 `AI生成 WORKBUDD>`（见第八节）

---

## 一、通用风格段（每张都追加）

**中文**
```
淡彩水墨长卷，宋画册页质感：旧绢骨白底，淡墨勾线，矿物色淡染，
赭石、青绿、墨灰为主，低饱和，大片留白，平视或微俯视的平面长卷构图，
笔触清淡干净，远看形状清楚、近看有笔意。
```

**English（SDXL / ComfyUI 用）**
```
ancient Chinese ink and mineral pigment painting on aged silk, bone white ground,
thin dark contour lines, translucent low saturation washes of ochre, grey green and ink,
panoramic flat composition, generous empty space, clean bold shapes that read at thumbnail size
```

---

## 二、通用负面（每张都追加）

**中文**
```
任何文字、汉字、甲骨文、篆书、书法、印章、落款、题跋、签名、水印、"AI生成"字样、
边框、画框、九宫格、UI、按钮、图标、地图标记、箭头；
现代物品（电线、电杆、塑料、玻璃幕墙、水泥）；
浓雾遮住主体、整体过暗、高饱和荧光色、霓虹；
远景里的小人小车小动物、指甲盖大的物体、物体被画框裁切、
物体相互遮挡或融合成一团、同一物件重复出现、把物件排成一排像商品图、
厚涂油画、3D 渲染、动漫、照片感
```

**English**
```
text, letters, chinese characters, calligraphy, seal, signature, watermark, logo, ui, frame,
border, grid, modern objects, heavy fog over subjects, dark, oversaturated, neon,
tiny distant objects, crowded composition, overlapping objects, cropped objects,
rows of objects like a product catalogue, oil painting impasto, 3d render, anime, photo
```

---

## 三、天象 `level2-01-sky.jpg`（整张重出 · 4 件）

**为什么现在的图不行**：只出了一颗巨月，没有日、没有雨、没有火。
原因是「symbolic cosmology / 巨月」这类词把画面推成"一颗大月亮 + 风景"，
其余三件被模型当成配景吞掉了。

**关键改法**：把"一天体"改成"两个天体 + 一片雨幕 + 一堆火"四个并列名词摆在句首，
并且点名"形状必须不同"（模型特别爱把日月画成一个圆）。

### 中文提示词
```
【画面主体，按顺序】
黄昏的原野长卷，天空里同时有一日一月，两者隔得很远、形状完全不同：
1）画面左上：一轮完整的圆形日盘，淡金色，边缘清楚，是整幅画最亮的东西；
2）画面右上：一弯细长的新月，白色弯钩，两个尖角朝上，绝不能画成圆盘；
3）画面中上方：一片低垂的深灰云，云脚垂下二三十条清晰的竖直雨丝，一直落到地面，看得出是一片雨幕；
4）画面中下方偏右：荒原上一堆正在烧的篝火，火苗向上窜成三四条，底下是一小堆柴，是整幅画唯一的暖橙色。
四件东西都很大（每件至少占画面宽度八分之一），彼此不遮挡，中间留出大片空天。

【风格】淡彩水墨长卷，旧绢底，淡墨勾线，低饱和矿物色，地平线一线淡青远山。

【禁止】只有太阳、只有月亮、日月重叠、月亮画成圆盘、雨丝画成装饰花纹、
火焰画成红色光晕、远景小点。
```

### English（ComfyUI）
```
panoramic dusk plain, one sun and one crescent moon together in the sky and far apart:
a big round pale gold sun disc at the upper left, a thin white crescent moon with two
upturned horns at the upper right, the two shapes obviously different;
a low dark grey cloud across the upper middle with twenty or more vertical rain streaks
falling from its edge down to the ground;
a burning campfire on the plain at the lower centre right, three or four tall flame tongues
over a small pile of firewood, the only warm orange in the picture;
each subject at least one eighth of the picture width, none overlapping, vast empty sky;
ancient Chinese ink and mineral pigment painting on aged silk, thin contour lines,
muted ochre, grey green and bone white, faint distant mountains
```

**保留的四个热点位置**（画成这样就不用重标）：
日 左上 (420,285) · 月 右上 (2145,215) · 雨 上中 (1255,780) · 火 下中偏右 (1330,1145)

---

## 四、山川 补「田」（局部重绘，别整张重出）

山川的 24 处热点已经按现图标好了，**整张重出会全部作废**。
只补一件：在 (2200,900) r=170 那块坡上画田。

### 局部重绘指令（中文）
```
在这块缓坡上画一片水田：七八块整齐的长方形田块，田埂把田分得清清楚楚，
田里是浅浅的水、映着天光，几行淡绿的秧苗，透视线顺着坡的走向走。
风格与周围一致：淡墨勾线，低饱和青绿淡染。
```
负面追加：`草坡、空草地、石头、树、房子、道路、整齐的棋盘格`

### English（img2img / inpaint）
```
a patchwork of irrigated rice paddies on the gentle slope: seven rectangular plots divided
by clearly raised earthen bunds, shallow water reflecting the pale sky, rows of young green
shoots, perspective following the slope, same thin ink outline and pale mineral wash as the
surrounding landscape
```
参数：mask 盖住热点圆 + 外扩 40px；denoise 0.72–0.8；mask blur 12；
negative 追加 `grass slope, empty meadow, rocks, trees, houses, road, chessboard grid`

---

## 五、草木 补「禾」「米」/ 禽兽 补「虎」「虫」

同样的局部重绘，坐标用现有的：

### 禾 (1480,590) r=150
```
一株成熟的谷子（粟）：一根粗壮主茎，顶端一穗沉甸甸的谷穗被重量压弯、低垂下来，
穗上颗粒密而清楚，茎下部几片细长叶。一眼要和竹子分得开
（竹子是直立空心秆、节明显；谷子是弯穗下垂）。
```
EN: `one ripe millet plant: a single thick stalk with a heavy dense grain ear bent over and hanging down, individual grains visible, a few narrow leaves on the lower stem, clearly not bamboo`

### 米 (470,1250) r=130
```
平整沙地上一小堆散落的白米粒，四五十粒，颗粒分明，有的聚成小堆、有的散开几粒，
整体约一只手掌大。
```
EN: `a small heap of white rice grains scattered on flat sandy ground, about fifty individual grains, some in a little pile and a few loose`

### 虎 (2136,620) r=150
```
一只全身侧面的虎，站在草地上：橙黄毛色，身上有清晰的黑色横条纹（条纹必须明显），
张口吼叫、露出犬齿，长尾拖在身后。
```
EN: `one tiger standing in full side view on the grass bank, ochre orange fur with bold black horizontal stripes, mouth open in a roar showing fangs, long tail trailing behind`
负面追加：`cow, bull, buffalo, leopard spots, no stripes`

### 虫 (2250,1220) r=130（蛇）
```
一条盘曲的蛇：身子绕成两三圈的螺旋，用细线画出鳞片，头微微抬起，
蜷在草丛前的地面上。
```
EN: `a coiled snake on the ground in front of the grass, body spiralled in two or three loops, scales drawn with fine ink lines, head slightly raised`
负面追加：`worm, earthworm, rope, curled grass`

---

## 六、人居 `level2-05-life.jpg`（33 件 → 拆两张）

现在这张是"好看的村落风景"：房子、船、小人都有，但 33 个字里能点的不超过 8 个。
一张 16:9 装不下 33 个"够大能点中"的物件——这是硬约束，不是提示词能绕过的。

**建议拆成两张 + 砍掉 11 件小器物：**

| 张 | 收哪些字 | 件数 |
|---|---|---|
| 主图（村落风景） | 邑 郭 门 宀 井 舟 鼎 缶 皿 酉 | 10 |
| 副图（河边人群近景） | 大 人 女 子 衣 力 目 耳 口 止 又 足 | 12 |
| 砍掉/移到图鉴 | 囗 玉 贝 卜 糸 弓 矢 刀 斧 斤 戈 | 11 |

> 玉、贝、刀、斧这些本来就只有几厘米大，放进 2624 宽的长卷里必然变成小点。
> 真想留，只能单独做一张"近景台面/作坊"（那就又是摆件图了）。

### 主图 · 中文提示词
```
【画面主体，按顺序】
商代小村落的长卷，一条河从右下方流过：
1）左侧中景：一座夯土城墙围起来的聚落整体，城墙有清楚的夯层横纹，墙里露出几座茅草屋顶；
2）聚落左侧另有一段独立的夯土外墙，能看出墙的厚度；
3）城墙正中一道木构城门：两扇木板门，中间门洞清楚；
4）右侧近景：一栋大茅草顶的土屋，屋顶占房子的大半；
5）村中空地上：一口带木栏的水井，方形井口；
6）右下河边：一条独木舟泊在岸边；
7）井边地上摆着一只三足两耳的青铜鼎，三只脚看得清；
8）鼎旁一只大腹小口的灰陶罐；
9）再旁一只浅口陶盘，口沿清楚；
10）还有一只窄口深腹的青铜酒器。
器物都贴着地面、摆在井边和屋前，旁边有几个忙碌的人（人画小、只作背景衬托），
器物之间留出空当、各自独立、都很大。

【风格】淡彩水墨长卷，旧绢底，淡墨勾线，低饱和矿物色。

【禁止】把器物排成一排像商品图、器物悬空、器物被房子挡住、远景小点、文字。
```

### 主图 · English
```
ancient Chinese landscape painting of a small Bronze Age village beside a river:
on the left a walled settlement with a rammed earth rampart showing horizontal construction
layers and thatched roofs inside it; a separate stretch of rammed earth outer wall to its left;
a wooden double gate set in the wall; on the right foreground one large thatched mud house
with a big roof; a square stone well with a wooden railing in the open ground; a dugout canoe
moored at the river bank on the right; beside the well a bronze three legged ding cauldron,
a big bellied narrow mouthed pottery jar, a shallow pottery dish with a clear rim, and a slim
deep bronze wine vessel, all standing on the ground, small figures working around them as
background scale; each object large and separate with space between; thin ink contour lines,
pale mineral washes on aged silk, muted ochre and grey green
```

### 副图 · 中文提示词（河边人群近景）
```
【画面主体，按顺序】
河边一片开阔地上的商代人群近景，人是主体、画得很大：
1）正中一个正面站立的大人，双臂平伸张开；
2）左边一个侧身站立的人，头、身、腿都清楚；
3）右边一个跪坐的女子，双手放在膝上；
4）前面一个小孩，个头只到大人的腰；
5）大人身上穿着交领长衣，衣纹清楚；
6）大人手里一件耒耜，正在翻土（长柄、下端铲形）；
7）大人脸部的眼睛画得清楚；
8）侧面那人露出的耳朵；
9）正面大人的嘴；
10）小孩踩在地上的脚，脚趾清楚；
11）大人伸出的右手，五指清楚；
12）侧身那人的脚。
人物都是近景，每个人至少占画面宽六分之一，脸和手都要画清楚。

【风格】淡彩水墨，旧绢底，淡墨勾线，低饱和矿物色，背后一条河、几棵树。

【禁止】把人物画成远景小人、人物互相遮挡、脸糊成一团、手指粘连。
```

---

## 七、尺寸与后处理

| 路线 | 做法 |
|---|---|
| 线上生成（豆包/即梦/Agnes） | 出 **2560×1440**（16:9，选 2K）；等比缩到宽 2624（高约 1476），居中裁到 **1472** |
| 本机 ComfyUI | `1344×768` 出图 → `tools/comfy_finalize.py --mode lanczos` → 2624×1472 |
| 落盘 | JPEG q92，单张 600–900KB |

重采样一律 **lanczos**，不要 bicubic（水墨线条会发糊）。

---

## 八、必须先处理的问题：六张图全带水印

`assets/level2-0*.jpg` 和 `level2-world.jpg` 右下角都有 **`AI生成 WORKBUDD>`** 白字，
而 `_data.js` 里 `bgCredit` 写的是"无第三方水印"——线上会被看出来。

半透明白字压在墨底上，取旁边 40px 的同质肌理克隆覆盖即可（不影响画面内容，
**大地图那版也可以照样修，不动构图**）。修完再发布，别等重画。

---

## 九、验收（逐张、逐字对）

1. 清单上的字，每一个都能在图上**指着说出来**；
2. 每件 ≥ 画面宽 8%，点得中（图上量：210px 直径以上）；
3. 没有文字/印章/水印/边框；
4. 是**一幅风景**，不是把东西排一排；
5. 标点时用 `dev/mark-hotspots.html`，导出 JSON 直接回填 `_data.js`。

**只补单件的（山川/草木/禽兽）不要重标全部**——补进去的那一件正好落在现有热点上，
标点总数不变，只微调那一处。

---

## 十、跑法

**A. 线上生成（推荐先试，2K 出图质量比本机 8G 显卡好）**
把「中文提示词 + 通用风格段 + 通用负面」拼成一条，比例选 16:9、清晰度 2K。
天象、人居主图各出 4 张挑一张；一张图里物件是齐的才留。

**B. 本机 ComfyUI**
```
python tools/comfy_batch.py --spec tools/specs_maps_v6.json --only v6-sky
python tools/comfy_batch.py --spec tools/specs_maps_v6.json --only v6-life-main
python tools/comfy_batch.py --spec tools/specs_patch_v6.json        # 补件（田禾米虎虫）
python tools/comfy_finalize.py --mode lanczos
```
- SDXL 提示词**控制在 100–120 词**：规格文件里已按这个长度精简过，
  这份文档里的完整版是给线上模型用的（长句更能锁物件）。
- 服务**连出两张会假死**，一次只跑一张，跑完重启。
- 补件如果合成痕迹重，改走「局部重绘」：把现有图 `stage: refine` + mask，denoise 0.75，
  用第四、五节那段描述当正向词。

**C. 水印**
所有出图先看右下角，有 `AI生成 WORKBUDD>` 就先擦掉再上线（见第八节）。
