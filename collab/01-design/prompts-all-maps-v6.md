# 第二关 · 六张地图全部提示词 v6

> 一次给全：大地图 + 天象 + 山川 + 草木 + 禽兽 + 人居（拆两张）+ 5 件补件。
> 每条都能直接粘。结构统一：**【主体清单】→【风格】→【禁止】**，负面用文末"通用负面"叠每张的追加项。
> 精简版（English）在每节末尾，给本机 ComfyUI / SDXL 用（100–120 词，再长前面的清单会被稀释）。

---

## 〇、通用风格段（每张都追加）

```
淡彩水墨长卷，宋画册页质感：旧绢骨白底，淡墨勾线，矿物色淡染，赭石、青绿、墨灰为主，
低饱和，大片留白，平视或微俯视的平面长卷构图，笔触清淡干净，远看形状清楚、近看有笔意。
```

## 〇二、通用负面（每张都带上）

```
任何文字、汉字、甲骨文、篆书、书法、印章、落款、题跋、签名、水印、"AI生成"字样、
边框、画框、九宫格、UI、按钮、图标、地图标记、箭头；现代物品（电线、电杆、塑料、玻璃幕墙、水泥）；
浓雾遮住主体、整体过暗、高饱和荧光色、霓虹；远景里的小人小车小动物、指甲盖大的物体、
物体被画框裁切、物体相互遮挡或融合成一团、同一物件重复出现、把物件排成一排像商品图、
厚涂油画、3D渲染、动漫、照片感
```

---

## 一、大地图 `level2-world.jpg`（保留旧版，此条仅备重出）

```
【主体清单】一幅俯瞰式的河谷长卷：
1）右上方一道连绵山脉，峰头青绿、层层叠叠；
2）一条大河从左侧前景蜿蜒流向右侧，河面宽、带沙洲；
3）下方中间：一座夯土城墙围起来的小城，城内房屋成排；
4）左下方：整齐的方格田亩；
5）左侧：一大片圆冠树林；
6）右侧：开阔的沼泽湿地，零星水鸟；
7）最远一线淡青山影。
视角：略高的俯瞰长卷，像一幅绢本设色地图，不是沙盘模型、不正俯视。
【风格】淡彩水墨地图画，旧绢底，淡墨勾线，低饱和青绿赭石。
【禁止】任何标注文字、地名标签、罗盘、比例尺、边框、现代道路。
```

**EN / SDXL**
```
bird's eye panorama of a river valley on aged silk: a long blue green mountain range across the
upper right, one broad river winding from the left foreground towards the right with sand bars,
a small walled town with earthen ramparts and rows of houses at the bottom centre, a grid of
rectangular fields at the lower left, a broad round crowned forest at the left, an open marsh
with scattered water birds at the right, faint blue grey mountains on the horizon, slightly
raised panoramic map view, thin ink contour lines, muted mineral pigments, no labels no text
```

---

## 二、天象 `level2-01-sky.jpg`（4 件：日 月 雨 火）

```
【主体清单，按顺序】
黄昏的原野长卷，天空里同时有一日一月，两者隔得很远、形状完全不同：
1）画面左上：一轮完整的圆形日盘，淡金色，边缘清楚，是整幅画最亮的东西；
2）画面右上：一弯细长的新月，白色弯钩，两个尖角朝上，绝不能画成圆盘；
3）画面中上方：一片低垂的深灰云，云脚垂下二三十条清晰的竖直雨丝，一直落到地面，看得出是一片雨幕；
4）画面中下方偏右：荒原上一堆正在烧的篝火，火苗向上窜成三四条，底下是一小堆柴，是整幅画唯一的暖橙色。
四件都很大（每件至少占画面宽度八分之一），彼此不遮挡，中间留出大片空天。
【风格】<通用风格段>
【禁止】只有太阳、只有月亮、日月重叠、月亮画成圆盘、雨丝画成装饰花纹、火焰画成红色光晕、远景小点。
```

**EN / SDXL**
```
panoramic dusk plain, four large separate subjects far apart: a round pale gold sun disc at the
upper left sky, a thin white crescent moon with upturned horns at the upper right sky, a low dark
grey cloud across the middle with twenty vertical rain streaks falling to the ground, a burning
campfire with tall flame tongues on the plain below, each subject at least one eighth of the
picture width, none overlapping, vast empty sky, faint blue grey mountains on the horizon,
ancient Chinese ink and mineral pigment painting on aged silk, thin contour lines, muted ochre
and grey green, bold clean shapes
```

---

## 三、山川 `level2-02-land.jpg`（9 件：山 丘 谷 石 土 泉 川 水 田）

```
【主体清单，按顺序】
山水长卷：左侧高峰耸立，中部大河横过，右侧远处低丘，前景河滩。
1）左侧中景：并列的尖峰群，轮廓清楚，中峰最高；
2）峰群中间：两座山之间一道明显的 V 形凹口（山口）；
3）右侧远景：一座低矮的圆顶小丘，和左边的尖峰形成对比；
4）中部：一条宽阔的河面从左到右横贯画面，是画面最宽的水面；
5）前景中下：一条窄的弯曲溪流汇入大河，明显比大河细；
6）最左侧前景：两块石头之间涌出泉水，水面上有同心圆波纹；
7）左侧前景河滩：一块孤立的大石，石面纹理可辨；
8）河滩上（下左）：隆起的一堆黄土，顶面平缓；
9）右侧坡地：整齐的方格水田，田埂把田分成七八块，一眼看出是田。
九件各自独立、都很大、互不遮挡；大河与细溪的宽窄必须一眼分得出。
【风格】<通用风格段>
【禁止】把水田画成普通草坡、把细溪画成大河的支流一样宽、山画成土包、远景小点。
```

**EN / SDXL**
```
panoramic mountain and river landscape: a cluster of sharp peaks at the left with a clear V shaped
pass between two of them, one low rounded hill in the right distance, one broad river crossing the
middle from left to right, a narrow winding stream joining it in the foreground and clearly
thinner, spring water welling out between two rocks at the far left with concentric ripples, one
isolated large boulder on the gravel bank at the left foreground, a raised heap of yellow earth
beside it, a grid of rectangular irrigated plots with raised bunds on the slope at the far right;
each of the nine things large and separate, none hidden; thin ink contour lines, pale mineral
washes on aged silk, muted ochre, grey green and bone white
```

---

## 四、草木 `level2-03-plant.jpg`（6 件：木 林 竹 禾 米 屮）

```
【主体清单，按顺序】
河岸草木图：一条浅溪斜穿画面，两岸植物高低错落。
1）左侧：一棵独立的乔木，树干、主枝、树冠完整，是画面里最完整的一棵树；
2）左后方：成片的树林，很多棵树重叠成林，和左边独树形成"单株 / 成林"的对比；
3）右前方：一丛竹子，直立的茎、竹节清楚、细长竹叶；
4）中部：一株成熟的谷子，一根粗壮主茎，顶上一穗沉甸甸的谷穗被重量压弯、低垂下来，颗粒清楚；
5）左下方近景：平整沙地上一小堆散落的白米粒，四五十粒，颗粒分明，约一只手掌大；
6）右下方：一小丛刚出土的嫩草，两三片叶子。
六种植物形态必须明显不同：独树 / 成林 / 竹子 / 弯穗的谷子 / 地上的米粒 / 细叶嫩草，不能都画成"一团绿"。
【风格】<通用风格段>
【禁止】把谷子画成竹子、把米粒画成石头、把独树和树林画成一样、植物融成一团绿、远景小点。
```

**EN / SDXL**
```
a shallow stream running diagonally through the picture with plants on both banks: one tall
broadleaf tree standing alone at the left with trunk, main branches and a full crown, a dense grove
of many overlapping trees in the upper background behind it, a clump of jointed bamboo with slender
leaves at the right foreground, one ripe millet plant with a heavy grain ear bent over in the
middle, a small heap of white rice grains on sandy ground at the lower left, a tiny clump of new
grass shoots with two or three leaves at the lower right, each separate and obviously different in
shape, none merging into one green mass; thin ink contour lines, pale mineral washes on aged silk,
muted ochre, jade green and bone white
```

---

## 五、禽兽 `level2-04-beast.jpg`（9 件：豕 鹿 牛 羊 犬 虎 虫 鱼 隹）

```
【主体清单，按顺序】
水畔群兽图：浅水滩与草岸，九种动物各占一块地方，全部侧面、互不遮挡、都很大。
1）左侧岸边（近景）：一头肥猪，身子滚圆、四条短腿、背上有鬃；
2）左上草岸：一头鹿，枝状分叉的角，站姿；
3）中上草岸：一头牛，双角横张，体型是画面里最大的动物；
4）右上草岸：一只羊，角向下弯，体型中等；
5）中下岸边（近景）：一只狗，尾巴向上卷，体型小；
6）右侧草丛边：一只虎，橙黄毛色、黑色横条纹明显，张口露牙；
7）中部浅水：两条侧视的鱼，鳍和尾清楚；
8）左下（近景）：一只短尾小鸟，站在地上低头啄食；
9）右下角草丛：一条盘曲的蛇，身子绕成两三圈，鳞纹可见。
九种各自独立；虎与狗必须明显不同（条纹 vs 卷尾）；牛要最大。
【风格】<通用风格段>
【禁止】把虎画成有斑点的豹、把猪画成狗、把蛇画成绳子、动物互相遮挡、九种混在一团、远景小点。
```

**EN / SDXL**
```
animals of a river bank, nine creatures each on its own patch of ground, side view, none
overlapping: a fat pig with short legs and a bristly back at the left foreground, a deer with
branching antlers on the upper left bank, a large ox with wide horns at the centre top, a sheep
with curving horns at the right top, a small dog with an upturned tail at the centre foreground,
a tiger with bold black stripes at the right, two fish seen from the side in the shallow water,
a small short tailed bird pecking the ground at the lower left, a coiled snake in the grass at the
lower right; nine separate animals, all large; thin ink contour lines, pale mineral washes on aged
silk, muted ochre, grey green and bone white
```

---

## 六、人居 `level2-05-life.jpg`（33 件 → 拆两张）

一张 16:9 装不下 33 个"够大能点中"的物件（每件 ≥8% 宽，横排最多 8 个）。
按下面拆：主图 10 件 + 副图 12 件，剩下 11 件（囗 玉 贝 卜 糸 弓 矢 刀 斧 斤 戈）本来就只有几厘米大，移走或进图鉴。

### 6.1 主图 `level2-05a-life.jpg`（邑 郭 门 宀 井 舟 鼎 缶 皿 酉）

```
【主体清单，按顺序】
商代小村落的长卷，一条河从右下方流过：
1）左侧中景：一座夯土城墙围起来的聚落整体，城墙有清楚的夯层横纹，墙里露出几座茅草屋顶；
2）聚落左侧另有一段独立的夯土外墙，能看出墙的厚度；
3）城墙正中一道木构城门：两扇木板门，中间门洞清楚；
4）右侧近景：一栋大茅草顶的土屋，屋顶占房子的大半；
5）村中空地上：一口带木栏的水井，方形井口；
6）右下河边：一条独木舟泊在岸边；
7）井边地上：一只三足两耳的青铜鼎，三只脚看得清；
8）鼎旁：一只大腹小口的灰陶罐；
9）再旁：一只浅口陶盘，口沿清楚；
10）还有一只窄口深腹的青铜酒器。
器物都贴着地面、摆在井边和屋前，旁边几个忙碌的人（人画小，只做背景衬比例），
器物之间留出空当、各自独立、都很大。
【风格】<通用风格段>
【禁止】把器物排成一排像商品图、器物悬空、器物被房子或树挡住、远景小点、文字。
```

**EN / SDXL**
```
ancient Chinese landscape painting of a Bronze Age village beside a river: on the left a walled
settlement with a rammed earth rampart and thatched roofs inside, a wooden double gate in the wall;
right foreground one large thatched mud house; a square stone well with a wooden railing on open
ground; a dugout canoe moored at the pale river bank; beside the well a three legged bronze ding
cauldron, a big bellied narrow mouthed pottery jar, a shallow pottery dish and a slim bronze wine
vessel standing on the ground with space between them, small figures for scale; thin ink contour
lines, pale mineral washes on aged silk, muted ochre and grey green, generous empty space
```

### 6.2 副图 `level2-05b-life-figure.jpg`（大 人 女 子 衣 力 目 耳 口 止 又 足）

```
【主体清单，按顺序】
河边一片开阔地上的商代人群近景，人是主体、画得很大：
1）正中：一个正面站立的大人，双臂平伸张开；
2）左边：一个侧身站立的人，头、身、腿都清楚；
3）右边：一个跪坐的女子，双手放在膝上；
4）前面：一个小孩，个头只到大人的腰；
5）大人身上：穿着交领长衣，衣纹清楚；
6）大人手里：一件耒耜，正在翻土（长柄、下端铲形）；
7）大人脸部：眼睛画得清楚；
8）侧面那人：露出的耳朵；
9）正面大人：嘴；
10）小孩踩在地上的脚：脚趾清楚；
11）大人伸出的右手：五指清楚；
12）侧身那人的脚。
每个人至少占画面宽六分之一，脸和手都要画清楚。
【风格】<通用风格段>，背后一条河、几棵树。
【禁止】把人物画成远景小人、人物互相遮挡、脸糊成一团、手指粘连。
```

**EN / SDXL**
```
close view of Bronze Age people on an open river bank, figures large and clear: centre a tall man
standing frontally with both arms stretched out, left a man standing in profile, right a woman
kneeling with hands on her knees, in front a small child half his height, the man wears a long
crossed collar robe with clear folds and holds a wooden digging tool with a long handle and spade
blade, clear faces, hands with five fingers, bare feet with toes, each figure at least one sixth of
the picture width, none overlapping, ancient Chinese ink and mineral pigment painting on aged silk,
thin contour lines, muted ochre and grey green
```

---

## 七、五件补件（局部重绘用，不整张重出）

| 字 | 坐标 | 提示词 |
|---|---|---|
| 田 | (2200,900) r=170 | 在这块缓坡上画一片水田：七八块整齐的长方形田块，田埂把田分得清清楚楚，田里是浅浅的水、映着天光，几行淡绿的秧苗，透视线顺着坡的走向走。 |
| 禾 | (1480,590) r=150 | 一株成熟的谷子：一根粗壮主茎，顶端一穗沉甸甸的谷穗被重量压弯、低垂下来，穗上颗粒密而清楚，茎下部几片细长叶。一眼要和竹子分得开。 |
| 米 | (470,1250) r=130 | 平整沙地上一小堆散落的白米粒，四五十粒，颗粒分明，有的聚成小堆、有的散开几粒，整体约一只手掌大。 |
| 虎 | (2136,620) r=150 | 一只全身侧面的虎，站在草地上：橙黄毛色，身上有清晰的黑色横条纹（条纹必须明显），张口吼叫、露出犬齿，长尾拖在身后。 |
| 虫 | (2250,1220) r=130 | 一条盘曲的蛇：身子绕成两三圈的螺旋，用细线画出鳞片，头微微抬起，蜷在草丛前的地面上。 |

负面追加：田 `草坡、空草地、石头、树、房子、道路、棋盘格` / 禾 `竹子、芦苇、麦子` /
米 `石头、沙子、盐粒` / 虎 `牛、豹、斑点、没有条纹` / 虫 `蚯蚓、绳子、草团`

参数：mask 盖住热点圆 + 外扩 40px，denoise 0.72–0.8，mask blur 12。

---

## 八、尺寸与交付

| 路线 | 做法 |
|---|---|
| 线上生成 | 2560×1440（16:9、2K）→ 等比缩到宽 2624 → 居中裁到 1472 |
| 本机 ComfyUI | 1344×768 → `tools/comfy_finalize.py --mode lanczos` |
| 落盘 | JPEG q92，单张 600–900KB，重采样一律 lanczos |
| 命名 | `level2-world.jpg` `level2-01-sky.jpg` `level2-02-land.jpg` `level2-03-plant.jpg` `level2-04-beast.jpg` `level2-05a-life.jpg` `level2-05b-life-figure.jpg` |

**注意**：山川/草木/禽兽的 24 处热点已按现图标好，整张重出会全部作废——
只想补缺件就走第七节的局部重绘，新物件正好落在现有热点上。

---

## 九、跑法 & 水印

**本机 ComfyUI**（规格已按 100–130 词精简，可直接跑）
```
python tools/comfy_batch.py --spec tools/specs_maps_v6.json --only v6-sky
python tools/comfy_batch.py --spec tools/specs_maps_v6.json --only v6-life-main
python tools/comfy_batch.py --spec tools/specs_patch_v6.json
python tools/comfy_finalize.py --mode lanczos
```
一次只跑一张（服务连出两张会假死），跑完重启。

**水印**：现用六张图右下角都有 `AI生成 WORKBUDD>` 白字，而 `bgCredit` 写的是"无第三方水印"。
新图走无水印通道；已在用的大地图用仿制图章点一下即可，不动构图。
