# 接入说明 · 字趣 · 甲骨构字记

> 给接手的 AI 会话看。读完这一份就能继续，不必回翻历史。
>
> **最后更新 2026-11-01（一）**：§7.19 —— **馆内古筝终于出声；打散守阵兽后点不到字**。
> 两条都是"看起来没问题、就是不工作"的坑：
> ① 古筝**不能接 `createMediaElementSource`**（file:// 下媒体被判跨源，输出恒 0，静默无报错），
>    只能用 `<audio>` + `el.volume`；② **three 的 `Raycaster` 不看 `visible`**，
>    守阵兽那只隐形点击球在它被打散后仍挡在最前面吃点击，必须在射线结果里自己筛。
> **接手先读 §7.19，再读 §7.18 / §7.17 / §7.16 / §7.15**。
> §7.15 里 10 条坑每条都花掉一轮以上（尤其是第 3 条：暗场里 `metalness > 0`
> 一定会给出一条消不掉的假高光，别再去改几何了）。
> §7.12 / §7.13 / §7.14 讲的是被替换掉的旧王邑方案，只当历史读，**不要再照着改**。

---

## 0. 先做三件事

```powershell
# 1 确认仓库状态（下面「二」有当前预期值）
cd C:\DSH\字趣
git log --oneline -3
git status --porcelain

# 2 确认代码可用
& 'C:\Users\32058\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe' dev\_syntax_probe.js
& 'C:\Users\32058\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe' dev\_verify_deploy.js .

# 3 起本地预览（改了要给人看，站点的所有路径都是相对的，file:// 也能开）
#    端口占用就往上找
python -m http.server 8099
```

**环境路径**（本机固定，不要另找解释器）：
- Python：`C:\Users\32058\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe`
- Node：`C:\Users\32058\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe`
- Edge：`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`
- LibreOffice kit：见 `office-pptx` skill 的 Installed LibreOffice Kit 段

---

## 1. 项目是什么

面向**甲骨文**的汉字文化互动平台（教育、非商业）。用甲骨字形本身做玩法。

| | |
|---|---|
| 仓库 | `C:\DSH\字趣` |
| 远端 | `github.com/elaijw/jiagugouciji` |
| 线上 | https://elaijw.github.io/jiagugouciji/ |
| 技术栈 | **纯 `<script>` + 全局 `App` 命名空间；无框架、无构建、无依赖、双击即开** |
| 规模 | 产品代码 **8105 行 / 19 个文件**（index.html + css×4 + js）—— 实测口径 |
| 部署 | GitHub Pages；`deploy.ps1` 会 commit + push（**未经用户明确说"推"不要跑**） |

**路由**：`#/home` `#/modes` `#/atlas` `#/howto` `#/settings` `#/play/:modeId`

**三个玩法**（设定不可擅改）：

| id | 名称 | 一句话 | 备注 |
|---|---|---|---|
| `bone-build` | 甲骨构字 | 龟宝带玩家认识甲骨文，再完成构件入门练习 | **第一关**，单人、无倒计时，5 次练习；每题伴随甲骨知识与答后讲解 |
| `wangyi-map` | 殷商王邑 | 学习主题小地图，点亮对应王邑区域并解锁下一幅 | **主玩法**，5 幅主题框架；61 个现有字形学习点，主题待用户提供 |
| `boss-raid` | 构件讨伐 | 拆字为武、组构为招 | 21 关线性，横版对战 |

**数据规模**：73 个甲骨字形 · 37 构件 · 34 字卡 · 61 王邑实物 · 21 讨伐关
+ 讨伐名录 88 尊 → 图鉴 **5 档 / 241 条目**（102 去重字数留在页头）

---

## 1.5 第二关：两套坐标空间（**最容易搞错，务必先读**）

第二关有两张完全不同的图，**各有自己的像素空间**。混用会把热区全打乱。

| 用途 | 图 | 空间 | 数据字段 |
|---|---|---|---|
| **游戏内热区**（点实物学字） | `assets/wangyi-map.jpg` | **1800×1010**（`map.viewBox = "0 0 1800 1010"`） | `map.zones[].objects[].x/y/r` |
| **分区插画**（小地图页展示） | `assets/level2-0X-*.jpg` | **2624×1472** | `map.zones[].art` |

- 首页世界图另有一张写死在代码里的 `assets/wangyi-atlas.svg`（图解式底图，不是热区底图）。
- **踩过的坑**：曾把 `objects` 的 x/y 按 2624×1472 重写，与 1800×1010 不符，
  越靠右下的点位偏得越多。已用 `_check/levels.json.bak` 回滚，
  并用 `dev/_restore_hotspots.py` 写了自检（**越界必须为 0**）。
- `dev/_build_hotspots.py` 产出的 `out/level2-maps/hotspots.json` 是
  **2624×1472 空间**（给插画配热点用），**不能直接写进 objects**。
  该目录里有 `README-坐标系必读.md` 说明这一点。

## 1.6 第二关字表（已盘点，可核验）

- 实际字数 **61**（天象 4 · 山川 9 · 草木 6 · 禽兽虫鱼 9 · 人居器物 33），
  跨区无重复；甲骨字形 **61/61 全覆盖**（数据集共 73 字）。
- 完整逐字表 + 释义 + 可画物体 + 难物化分析：`out/level2-charset-audit.md`
  （由 `dev/_l2_charset_audit_report.py` 生成）。
- 字形来源：Oracle Bone Glyphs v0.3（Li & Bian，**CC BY 4.0**，
  DOI `10.5281/zenodo.22467946`）→ `js/core/_data.js` 的 `App.glyphs.parts`。
- **难物化 17 字**，其中「身体局部」6 字（目 耳 口 止 又 足）最棘手，热点天然偏小。
- 第三关 Boss 21 字与第二关**重叠 7 字**（山 人 木 日 月 水 虎），
  两关目标不同不算冲突，但**别互相取字凑数**。

---

## 2. 仓库当前状态（接手时核对）

**以 `git log --oneline -3` 与 `git status --porcelain` 的实测为准**，
本节只记留意事项（提交号会变，别照抄）：

- 远端 `origin/main` 已含「修复开始游戏页手机排版，第二关大地图改为唯一选图入口」等提交。
- **推送要走系统代理**：本机设了 `http://127.0.0.1:12450`，而 git 不知道，
  直连会 `Failed to connect to github.com:443`。用
  `git -c http.proxy=http://127.0.0.1:12450 push origin main`（只对这一条命令生效，不写配置）。
- 工作区目前有**未提交**改动：`index.html`、`js/core/shell.js`、`README.md`、`HANDOFF.md`
  与**新增未跟踪**的 `js/museum/`、`css/museum.css`、`vendor/`（= 本轮 3D 博物馆层，见「7.10」）；
  另有历史遗留的 `blender/`（`.blend` 空白场景与 `blender_render/` 空目录，本轮未使用）。
- `dev/` 与 `out/` 下有大量**未跟踪**的核查脚本与产出（地图、清单），未入仓库。
  `_check/`（本轮验证用的 puppeteer 脚本与截图）已在 `.gitignore` 里，不入仓库。

**上一次那版「绿金皮」已被撤回。** 撤回前把它存成了 git tag，随时可查：

```powershell
git show wip-jade-gold-rejected --stat        # 那版改了什么
git show wip-jade-gold-rejected:css/theme.css | head -80
```

> 撤回的只是**外衣**（玉绿 + 鎏金那组令牌与用法，在 `css/theme.css` 与
> `js/core/build.js` 的字形配色里）。`js/core/shell.js` 里的 `sheetWrap()`
> **保留了**——"内容装在一块浅色面上"这个结构是对的，只是那个面已经从
> 羊皮纸卷轴改成了**骨版**（见「六」）。

**这次新增/改动的文件**：

| 文件 | 里面是什么 |
|---|---|
| `assets/bone.png` | **新增**。骨材质（斑驳 + 骨纹 + 虫蛀孔），512 无缝平铺，`dev/_gen_bone.py` 生成 |
| `css/theme.css` | 骨材质令牌、页底三层背景、`--edge` 压深、**兆纹**分区线令牌 |
| `css/ui.css` | `.sheet` 骨版、图鉴改**拓片集**、`.home-sec` 叠兆纹 |
| `css/modes.css` | `.ac-glyph path` 线宽 1.9 → 2.4px（反白字发虚，必须加粗） |
| `js/core/build.js` | 刻辞底纹加深（真看得见）、撤掉多余的那层 SVG 网格 |
| `js/core/shell.js` | 保留 `sheetWrap()`；拓片卡新增 `.ac-rub`（朱笔今字） |

**★ 最近一轮（第二关地图与热点）的状态**：

| 项 | 状态 |
|---|---|
| 分区插画 | 六张已出，五张已接入 `assets/level2-0X-*.jpg`（`zones[].art`）；`level2-00-world` 是大地图，**尚未接入页面** |
| 热区坐标 | **保持原有 1800×1010 标定，未动**（曾误改，已回滚，自检越界 0） |
| 字表盘点 | 完成，见 `out/level2-charset-audit.md` |
| 插画热点清单 | `out/level2-maps/hotspots.json`（2624×1472 空间，给插画用） |
| 仍在工作区未提交 | `js/core/_data.js`、`js/modes/wangyi-map.js`、`js/core/levels.json`、`css/modes.css`、`HANDOFF.md` |
| 已知未决 | 人居器物那张的「衣」不够明确；大地图「天象」区偏弱 |

---

## 3. 用户明确的约束（违反即返工）

1. **不推送远程**，除非用户明确说「推」。其余时间最多提交到本地。
2. **不覆盖用户未提交的修改**。动手前先 `git status`。
3. **只按用户明确授权改玩法** —— 当前用户已明确授权第一关改为龟宝引导的单人入门课，边拼字边学甲骨知识；第二关改为主题小地图逐幅解锁，完成一幅点亮王邑总图对应区域。五个主题先沿用现有数据分区作可替换占位，收到用户主题后再替换名称与教学内容；字形数据与历史事实不编造，第三关 Boss 流程保留。这个决定覆盖此前对第一、二关“玩法流程不动”的旧要求。
4. **绝不编造甲骨字形。** 字形一律取自 `App.glyphs.parts`（73 个）；合体字数据集里没有整字甲骨形（这是真实情况），退用构件并排组合，并**标明「组合示意」**。
5. **甲骨形上不直接印现代字** —— 默认隐藏，悬停 / `:focus-visible` / `:active` 才显现。（这条用户强调过两次，我曾"为了可用性"妥协成半透明，被纠正。）
6. **署名必须保留**：字形数据 CC BY 4.0（Qing-sheng Li & Yu-lin Bian；镜像 `github.com/zhouyongh/hanzi-glyphs-svg`）/ 首页骨片照 CC0（Gary Todd）/ 当前王邑总图为项目原创学习示意（非考古复原），仓库保留的旧版底图由 Agnes AI 生成。页面与 README 均须准确区分新旧地图来源。
7. 用户**极其简短**，讨厌反问，要看到"真的改了 + 真的测了"。汇报要**诚实**：不确定的说不确定，自己犯的错要讲。

---

## 4. 技术陷阱（都踩过，勿重蹈）

| 坑 | 症状 | 正解 |
|---|---|---|
| **Edge 无头最小视口 482px** | 用 `--window-size=390` 量手机，得到的是 482px 布局再裁切，得出"移动端横向溢出"的**假结论** | 必须走 CDP `Emulation.setDeviceMetricsOverride`（见 `dev/_mobile.js`） |
| **状态类撞名** | 我给滚动显现加 `.rv`，而 `.rv` 是玩法"复盘"块的旧类名（带 `background: var(--bone-hi)`），导致每个标记元素被涂成白底 | 加状态类前先 grep 一遍。现用 `.mo-rv / .mo-in` |
| **`getBoundingClientRect` 含 transform** | 显现动画平移 16px，使"三块底边对齐"检查误判为否 | 测**布局**用 `offsetTop/offsetHeight` |
| **显隐动效没兜底** | 观察器不工作时内容永久不可见 | 隐藏态只在 `html.js-motion` 下生效（JS 自己挂）+ 2.5s 强制显示 |
| **CSS 内联 `feTurbulence` SVG 当背景** | 单独渲染正常，但作为 CSS 背景 `backgroundImage` 恒为 `none`（各种编码都试过） | 用 PNG（`assets/bone.png`）。简单的 `path` + `stroke-opacity` 那种 data URI 是好的（`--crack` 就是） |
| **`100vw` 含滚动条宽** | 页面可横向挪动 10px；改用 `overflow-x: hidden` 又**弄坏 sticky 顶栏** | 用 `overflow-x: clip`（不创建滚动容器） |
| **子类选择器权重** | `app.css` 的 `.stage > .info > .bar .btn.sm` 压过 `.info > .bar .btn.sm` | 用同等权重覆盖 |
| **筛选片数字口径** | 图鉴写"全部 102"（去重字数）点进去 153 条 | 牌子用**条目数**；去重字数留在页头 |
| **`App.store` 的键自带前缀** | 探针写 `App.store.set('ziqu.bossraid', …)` → 存成 `ziqu.ziqu.bossraid`，等于没写 | `storeKey()` 会自己加 `ziqu.`；只传 `'bossraid'`。症状是"只有第 1 关进得去"，很难往键上想 |
| **CDP 脚本被 Node 先解析一次** | `"…replace(/[ \n\r\t]+/g,' ')…"` 里 `\n` 被吃成真换行 → 浏览器报 `Invalid regular expression: missing /` | 字符串里再嵌正则要 `\\n`；**更稳的做法是不用正则**，把原文带回来在 Python 里 `split()` |
| **有顶层 await 就不能 require** | `const fs = require('fs')` + 顶层 await → `ERR_AMBIGUOUS_MODULE_SYNTAX` | 用 `import { writeFileSync } from 'node:fs'` |
| **CDP 新开的浏览器停在 `about:blank`** | 忘写 `Page.navigate`，后面每条 evaluate 都是 `App is not defined`，而 `ev()` 只回一个 `ERR:` 字符串 | 显式 `Page.navigate`；就绪判据用**真实数据在不在**轮询，别睡固定时长 |
| **`ev()` 只报 `Uncaught`** | 异常消息被吞成一句没有信息量的 `Uncaught` | 取 `exceptionDetails.exception.description`，不然只能靠猜 |
| **`--syntax` 内联 Python 被 PowerShell 吃引号** | `SyntaxError: unterminated string literal` | 补丁写成**文件**再跑，别用 `python -c "..."` |
| **PowerShell 管道截断会掐死上游进程** | `Select-Object -First N` 使 node 提前退出，截图没写完；**表现是 `[exit code: 1]`**，看着像测试挂了 | 别截断要跑完的进程。看到 exit 1 先单独重跑确认，别急着当成失败 |
| **`html[data-theme="bone"]` 权重高于 `:root`** | 只在 `:root` 改了 `--edge`，页面上**毫无变化** | 同一个令牌要在**两处**都改（`theme.css` 的 `:root` 与 `html[data-theme="bone"]`） |
| **SVG 的 `stroke-width` 写在 `<svg>` 上没用** | 字形结构是 `<svg><g><path stroke-width=".15"/></g></svg>`，那个是 path 的**表现属性**；外层写 CSS 不起作用（实测 CSS 2.8px → 实际 1.9px） | 线宽一律写 **path**，且口径在 `modes.css` 那一组 `non-scaling-stroke` 里（`ui.css` 后加载不了，同权重下 `modes.css` 胜） |
| **`opacity` 加在区块上** | 想让装饰背景淡一点，结果**整块内容**（含所有文字）一起变淡 | 装饰层的透明度写进它自己的 SVG/色值里，别用父级 `opacity` |
| **反复 `Runtime.evaluate` 轮询会让页面不长高** | 在 CDP 里循环量 `scrollHeight` 等"稳定"，页面反而恒停在 394px、`#sceneRoot` 为空；加 `Runtime.enable`/`Log.enable` 也一样 | 导航后**老实等一个固定时长**（5~6s）再量。`dev/_route_shot.py` 是好的，`dev/_probe_point.py` 是坏的 |
| **CDP 端口被上一轮没退干净的 Edge 占住** | 截图空白、`location.hash` 为空、卡片 0 张 —— 看着像页面渲染坏了，其实**连到了上一轮那个 about:blank 的旧 target**。`child.kill()` 杀不干净 | 每轮换端口与 profile；收尾时走 CDP `Browser.close` 让浏览器自己退；再校验一次"路由取到了没"，没取到就重试 |
| **`<g>` 没有 `.click()`** | SVG 里的 `.bo-cut` / `.bo-part` 是 `SVGElement`，不是 `HTMLElement`。`el.click()` 抛 TypeError，而异常被求值器吞掉 → 表现是"点了没反应"，**极易误判成游戏坏了** | 驱动 SVG 用 `el.dispatchEvent(new MouseEvent('click',{bubbles:true}))`。见 `dev/_raid_shot.py` 的 `fire()` |
| **自定义属性里的 `url()` 按样式表解析** | 想用 `--fig-src: url(assets/x.png)` 再在 `background-image: var(--fig-src)` 里用，会去 `css/assets/x.png` 取 —— **静默 404**，什么都不显示 | 别用变量传图；直接放一个同源的 `<img>` 叠层 |
| **流内图片写 `height:100%` 会退化** | 父元素高度若靠 `aspect-ratio` 从宽度推（此刻尚未确定），百分比高度退化成 `auto`，竖长的图把 111px 的格子撑到 398px，一行高低不齐 | 叠层/填充图一律**绝对定位**（`inset` 或 `left/top%+width/height%`），不参与父元素定高 |
| **可分离方形结构元做形态学** | 图像处理里"先横后纵"等于方形结构元，膨胀出来的**方角腐蚀收不回去**，素材上留下成片直角台阶 | 要圆盘效果就上**八方向线形结构元**（横、纵 + 两条对角，对角半长取 r/√2）；四个方向必须都从**同一份输入**取，否则半径叠乘 |
| **Windows 解包副本会带 CRLF** | 与远端比出"整个文件都不同"，看着像大改，其实**只差行尾符**（远端 LF、本地 CRLF）。照推等于把文件整篇重写，提交里全是噪音，review 时看不出真正改了什么 | 判定是否要推用 **git blob sha**（`sha1("blob <len>\0" + content)`），不要用 mtime/size；行尾符差异先归一化再逐字节比。本次 `deploy.ps1` 就是这样被识别并跳过的 |
| **`--dump-dom` + `--virtual-time-budget` 判页面** | 同样的八个页面跑两轮，失败的页面还不一样（一轮空 3 个、一轮空 5 个）——有图要下载的页面会拖住虚拟时钟，输出直接为空 | 判页面用 **CDP 就绪轮询**（见 `dev/_live_check.py`），一个浏览器逐页导航，等"路由落对 + 挂载点有子节点"再判定 |
| **空 DOM 被当成"没有报错"** | 检查方式是"在 DOM 里搜错误字样"。dump 失败时 DOM 是空的，空串里当然搜不到错误 → **空跑也算通过**。这是最坏的一种假绿：验证工具本身在骗人 | 判据要反过来写——**"挂起来才算过"**，不是"没搜到错就算过"。`dom 为空` 必须判失败，且不猜超时原因（"图片大"只是猜测），只如实记"没测到" |
| **就绪判据用固定睡眠** | 浏览器可能还停在 `about:blank`，此时所有选择器都返回 0。把 0 当成结论，就会报出"线上 0 张卡片"这种**假故障**，比漏报还费时间 | 断言 `location.host` 非空 **且** 挂载点有子节点。另外：短路由（如首页 hash 为空）会被路由规范化成 `#/home`，就绪条件要给**可接受集合**，写死比 `""` 会让首页永远判失败 |

---

## 5. 验证套件（`dev/`，现 91 个：`_*.py` 83 + `_*.js` 8）

> **路径说明**：下面命令里的 `C:\DSH\字趣` 与那几个 `$py` / `$node` 是原作者机器上的
> 位置，换了机器要改。本机（WorkBuddy 工作副本）的实际路径见 §7.10。
> 只统计 `dev/` 下的脚本文件数，不代表都能跑——`_probe_point.py` 就已知不可靠。

改完**必须**跑，全绿才算完。

```powershell
$py  = 'C:\Users\32058\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe'
$node= 'C:\Users\32058\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe'
cd C:\DSH\字趣

& $node dev\_syntax_probe.js          # 语法 + 缺失引用
& $node dev\_verify_deploy.js .       # index.html 每个引用能否精确命中（现 18 个）
& $node dev\_contrast.js              # 对比度；基线 = 1（只剩"描边/分隔线"非文字那对）
& $py   dev\_final_check.py           # 八个页面
& $py   dev\_run_shell.py             # 壳层（顶栏/路由/首页/图鉴/说明/展板/成就/页脚）
& $py   dev\_run_drive.py             # 甲骨构字
& $py   dev\_run_wy.py                # 殷商王邑（逐笔拖入 11/11）
& $py   dev\_run_bo.py                # 构件讨伐
& $node dev\_mobile.js <url> 390 844 out.png   # 手机端（CDP 真视口）★ 是 .js，要用 $node 跑
& $py   dev\_lv_test.py 1440 1000     # 展板悬停/点击（CDP 真鼠标）
& $py   dev\_motion_test.py <url>     # 滚动显现/字形描绘/视差
& $py   dev\_bb_audit.py 390 844      # 甲骨构字"一屏放得下"
& $py   dev\_scroll_shot.py <url> 1440 1000 760 out.png   # 滚动后截图
```

**本次新加的四个工具**：

```powershell
& $py dev\_gen_bone.py                          # 生成 assets/bone.png（骨材质），带接缝自检
& $py dev\_route_shot.py <route> <宽> <高> <png> [滚动到]
      # 按路由截图 + 报一把关键量：骨材质层是否生效、blend、横向溢出、
      # 刻辞底纹字符数、.sheet 数、.atlas-card 数、拓片字形的线宽/颜色
& $py dev\_scroll_diag.py <route> <宽> <高>      # 谁在滚、能不能滚（html/body/.wrap/… 全列）
& $py dev\_probe_point.py <route> <宽> <高> <x> <y> [滚动到]
      # 点探：某一点上的命中栈与盒模型 ★ 目前**不可靠**（页面常停在 394px），
      # 急着查某点归谁管时再修它，日常用 _route_shot.py
```

**推送与线上核验**（这一组是这次新加的，改完代码要用它才能确认"线上真的生效了"）：

```bash
# 令牌从本机凭据管理器取，不落盘、不打印
GH_TOKEN=$(printf "protocol=https\nhost=github.com\n\n" | GIT_TERMINAL_PROMPT=0 \
  git credential fill 2>/dev/null | sed -n 's/^password=//p')

GH_TOKEN="$GH_TOKEN" python dev/_push_api.py --dry               # 只列清单，不提交
GH_TOKEN="$GH_TOKEN" python dev/_push_api.py --message-file msg.txt
      # 走 GitHub REST API（这份副本没有 .git，且代理对 git push 返 502）。
      # 用 git blob sha 判定"要不要推"；默认跳过 deploy.ps1（仅行尾符差异）

python dev/_live_check.py            # 内容层（逐字节比本地与线上）+ 功能层（八页）
python dev/_live_check.py --content --wait    # 只比内容，没生效就轮询
python dev/_live_check.py --pages             # 只跑八页
python dev/_live_check.py --needle "js/modes/boss-raid.js=POOL_SIZE"
```

**四个 CSS 的花括号要配平**（`theme/ui/app/modes`）。**改动前记得 `git status`。**

---

## 6. 设计方向：卡在哪里，往哪走

### 用户的最终判断（原话）

> 「你做的好素 啊 而且空白好多 我不是跟你讲了 大胆去改」
> （给我看参考 PPT 之后）「**我们是甲骨文你就只会抄吗**」

### 我犯的两个错

**错一：做成了一张平的米色纸。**
原来是"骨白极简"——低饱和、无阴影、圆角归零、装饰全退。
结果**素、空白多**。骨白是对的，但我把"骨"理解成了"白色"。

**错二：照抄参考稿。**
用户给了 `走进甲骨看殷商.pptx`（8 页满版图，已提取到 `C:\DSH\_ppt_pics\v01..v08.jpg`），
那套是**深玉绿 + 鎏金 + 祥云 + 卷轴**。我照着做了 ✗
——但**祥云是明清纹样、玉绿鎏金是清代宫廷色，跟甲骨无关**。
套上去只能说明我会抄。

### 正解（已实施）

> **先把这一节读完再动手。** 上一版（骨材质 + 拓片铺满）虽然做了"材质"，
> 但方向仍然是错的——因为**我从没读过下面这三份实测规范**，
> 全靠自己想"该加点什么"。结果是把页面越糊越厚，用户直接说
> 「改的有什么意义 每次都这样 你能不能好好学习下优秀案例」。

#### 三家美术馆的实测规范（**必须真读，别猜**）

- [大阪中之島美術館 DESIGN.md](https://kzhrknt.github.io/awesome-design-md-jp/design-md/nakanoshima-museum/DESIGN.md)
- [森美術館 preview](https://kzhrknt.github.io/awesome-design-md-jp/design-md/mori-art-museum/preview.html)
  ／ [DESIGN.md](https://kzhrknt.github.io/awesome-design-md-jp/design-md/mori-art-museum/DESIGN.md)
- [東京都現代美術館 MOT DESIGN.md](https://kzhrknt.github.io/awesome-design-md-jp/design-md/mot-art-museum/DESIGN.md)
- 文化机构首页的实测结论：[文化机构官网首页排了十一件展品，安静的调性一下散了](https://www.jizankeji.com/zhishi/551.html)

**三家的共同点（这才是"优秀案例"的干货）**：

| 项目 | 中之岛 | 森 | MOT |
|---|---|---|---|
| 地色 | 纯白 `#ffffff` | 白 | 白 |
| 有彩色 | **0 个** | 1 个（绯红 `#bf0d3e`） | 1 个（链接蓝 `#356eb0`） |
| `box-shadow` | **声明 0 件** | 不用，靠面色 | 几乎全 `none` |
| 层次 | 1px `#808080` 罫 | 面色浓淡 | `#ffffff/#f1f1f1/#dddddd` 四段面 |
| 卡片 | `transparent`、无框无影 | 面色卡 | 无框无影 |
| 圆角 | 0（只有日历圆） | 5px | 0 或 5px |
| 字号 | 14 正文 / h2 20 | 15 正文 / h1 27 | 16 正文 / h1 44 |
| 容器 | 960 | — | 1200 |
| 导航 | **动词**（訪ねる/学ぶ/参加する） | — | 4 项 |

**教训（我犯的，逐条记下）**：

1. **"素"的解不是加纹理，是版面结构 + 编辑层级。**
   我两次都答错了：第一次做成无菌白纸（素、空），
   第二次往地上糊四层纹理（浑、脏、装饰抢戏）。
2. **地色必须是平的。** 三家没有一家给页面地加材质。
   地和内容抢注意力时，读者分不清哪个是信息、哪个是装饰。
3. **层次靠面色浓淡 + 1px 罫，不靠阴影。** 一屏十几个浮块，页面就吵。
4. **有彩色要少。** 中之岛 0 个，另两家各 1 个。
   我用了骨/朱砂/青铜/拓黑/骨斑/绿/蓝一大把。
5. **密度有上限。** "首屏排十一件展品，安静的调性一下散了"。
   153 张铺成 11 列整面墙是**过**，不是大胆。
   正解：按真实档位**分组** + 组间留大空 + 每张给足白边。
6. **别"盒子套盒子"。** 浅色版面里再放同色卡片+边框，层次反而糊。
   玩法卡 / 每日一字 / 我的收集都已退成透明分栏 + 1px 上罫。
7. **装饰性小纹样（兆纹小波浪那种）是噪音。** 题材好不代表用法对；
   兆该当**结构**（真的按兆裂劈版面），不是描在罫线上的 12px 花边。

#### 现在长什么样

- 地：平的骨色 `#f2e8d5` + 一层极淡纸纹（`--fiber`）
- 内容版：`.sheet` 浅色纸面 + 1px 中性灰罫，无 clip-path、无内圈线
- 分区：`--rule` 1px 罫；悬停反馈靠**颜色**（朱砂）而不是位移+阴影
- 图鉴：**分组拓片集**——构件 37 / 合体字 34 / 王邑实物 61 / 讨伐字形 21，
  每组一个标题 + 条数，组间 `--s-9` 大空
- 拓片：`.ac-ob` 墨底承载，**卡身透明**（墨是落在纸上的一个印，不是网页盒子）

**「六」里剩下的活**：钻凿作边饰、卜辞体制（前辞/命辞/占辞/验辞）、
图鉴详情浮层与说明页也走拓片语言。**做之前先读上面那几份规范。**

---

## 7. 关键文件地图

```
index.html                壳（顶栏 + #sceneRoot + 页脚；脚本按序引入）
css/
  theme.css               设计令牌 + 通用组件 + 弹窗 + 状态提示   ← 改样式优先这里
                          （令牌有两处：:root 与 html[data-theme="bone"]，都要改）
  ui.css                  壳层布局：首页/图鉴/说明/展板/成就/页脚  ← 页面样式改这里
  app.css                 旧单文件版遗留（构件格、比分板、棋盘）
  modes.css               三个玩法各自的界面 + **字形线宽口径**（.ac-glyph path 等）
js/core/
  build.js                启动：品牌字形、**底纹生成 buildPatternURI()**、外观
  shell.js                路由 + 全部页面场景（~1077 行）  ← 页面结构改这里
  motion.js               滚动显现 / 字形描绘 / 底纹视差
  atlas.js                图鉴数据层（合并三个玩法的进度）
  achievements.js         成就与评级
  modes.js                模式注册表（register 只复制白名单字段！）
  leveldata.js            glyphSvg / glyphStrokeSvg / glyphStrokes
  _data.js                73 字形的几何（由 dev/_gen_glyph_parts.py 生成，勿手改）
  data.js / packs.js      构件池、字卡、内容包
js/modes/                 bone-build.js / wangyi-map.js / boss-raid.js
js/museum/                ★ 3D 博物馆（独立一层，删掉 6 处引用即可整体摘除，见「7.10」）
  museum-tex.js           341 行  Canvas 贴图层：骨面 / 刻辞(真字形 Path2D) / 石地 / 竖排石牌 / 环境球
  museum3d.js            1170 行  three.js 场景层：大厅 + 甲骨文展厅 + 自写轨道控制器 + 射线拾取
  museum.js               731 行  UI/路由层：面板、六区 chip、龟宝、观展记录、2D 降级大厅
vendor/three.min.js       608 KB   Three.js r149 UMD（MIT），**按需注入，不在 index.html 里**
assets/                   oracle-bone.jpg(首页骨片照) wangyi-map.jpg(旧版 Agnes 底图)
                          wangyi-atlas.svg(当前原创王邑总图) guibao-front/side/back.png(龟宝设定图)
                          paper.png(纸纹，浅色面上用) bone.png(骨材质，页底用)
dev/                      51 个自查工具（见「五」）
README.md                 给读者看的项目文档（含素材授权、设计令牌说明）
```

**产物代码行数**（index.html + css×4 + js）：**8105 行 / 19 个文件**。
（先前记的 9082 是错的，实测口径就是这个；以后以实测为准。）
**本轮博物馆层另加 2814 行 / 4 个文件**（`museum-tex.js` 341 + `museum3d.js` 1170 +
`museum.js` 731 + `css/museum.css` 572），不计入上面那行旧口径。

**模式契约**：`App.modes.register({id,name,tagline,desc,icon,accent,tags,minPlayers,maxPlayers,status,layout,data,settings,mount,unmount})`
`layout:'wide'` → 壳层给 `.app-shell` 加 `.layout-wide`。**`register()` 只复制列出的字段**，漏掉的键读不到。

**存储**：`App.store`，前缀 `ziqu.`，全包 try/catch。
`ziqu.wangyi` `{done:{分区:[字]}}` · `ziqu.bossraid` `{cleared:[],perfect:[]}` · `ziqu.bonebuild` `{done:[字]}` · `ziqu.achieved` `[]` · `ziqu.museum` `{seen:{字:时间戳}, v:1}`（观展记录，只增不减）

---

## 7.5 本次会话做完的与没做的（诚实交代）

**做了**：撤回绿金版（存成 tag）→ 生成骨材质 → 页底三层背景 → 刻辞加深 →
图鉴 153 张改拓片集 → `.sheet` 改骨版残边 → 兆纹分区线 → 全套验证 + 桌面/手机截图。

**验证结果**：语法、引用（18）、八个页面、壳层、构字、王邑、讨伐、手机端（390 无横向溢出）、
四个 CSS 花括号配平——**全绿**。对比度只剩基线那 1 对（`--edge` on `--bone`，非文字，
数值由 1.53 提到 2.02，是**有意的**：原来那个描边几乎看不见，骨面上的刻线本就该读得出来）。

**没做 / 不确定**：
- 第 4、6 条设计（钻凿、卜辞体制）没动。
- **图鉴详情浮层**、说明页、设置页仍是原来的浅色纸面，没跟着走拓片语言。
- **首页首屏大图**（`hero`）被 `sheetWrap(wrap, hero)` 排除在骨版外，仍是满幅——这是有意的。
- `.ac-rub` 那行"朱笔今字"是**新增元素**，用户还没看过，可能要说不要。
- `dev/_probe_point.py` 目前不可靠（页面常停在 394px），别依赖它。
- 未推送（等用户说"推"）。**← 后已推送，见 §7.10 推送记录。**

---

## 7.6 接手会话的记录（核对时新增）

**修掉一个一直假绿的检查脚本**：`dev/_verify_deploy.js` 把 `?v=` 版本串
当成路径的一部分去 `readdirSync`，于是 `js/core/util.js?v=20261012-2`
永远命中不了。这个假 404 **从校验脚本诞生的那一版就在**（同一个提交里
`index.html` 已经带 `?v=`），所以之前记的「引用 18 个全绿」是错的，
实际是 **16 真通过 + 2 假 404**。已在脚本里剥掉 `?`/`#` 再校验，
现在真的是「全部 18 个引用可精确命中」。**版本串本身仍是 20261012-2**，
而 util.js / boss-raid.js 在 `5e652e2` 之后又改过 —— 要不要一起刷版本号，待定。

**浏览器类验证在本会话被沙箱挡住**：Edge 在受限沙箱下**启动即崩**，
两条现象都实测过（不是猜）：

- `--dump-dom` 路线：输出空 DOM，进程以 `0x80000003`（STATUS_BREAKPOINT）结束；
  报错为 `ERROR:mojo\public\cpp\platform\platform_channel.cc:187 Check failed:
  . : 拒绝访问。 (0x5)` 与 `crashpad_client_win.cc:456 OpenProcess: 拒绝访问`。
- CDP 路线（`_route_shot.py`）：`http://127.0.0.1:9722/json/list` 始终没有
  page target，脚本在 `page = [...] [0]` 处 `IndexError`。

即**程序间管道（named pipe）在受限沙箱里被挡**，而 Chromium 的多进程架构
离不开它。所以凡是走 Edge 的检查（「五」里的 `_run_shell` / `_run_drive` /
`_run_wy` / `_run_bo` / `_mobile` / `_lv_test` / `_motion_test` / `_bb_audit` /
`_scroll_shot`，以及 `_route_shot`）**都需要在完全访问权限下才能跑**。
纯 Node/Python 的检查（`_syntax_probe` / `_verify_deploy` / `_contrast`）
和 `_final_check.py`（八个页面 DOM 全 OK）在受限沙箱里能过。

**本次实测到的**：语法 10 个文件 OK · 引用 18 个全命中（修脚本后）·
对比度只剩基线那 1 对（`--edge` on `--bone`，1.56，非文字）·
`_final_check.py` 八个页面全部正常。

---

## 7.7 第二关「殷商王邑」本轮重做（**坐标空间已统一，1.5 节要一起改读**）

### 一句话

第二关从「灰图点亮 + 拼笔画」改成需求要的形态：
**大地图当唯一入口（五区任意顺序）→ 进分区插画 → 点实物 → 学习卡 → 拼笔画记下**。

### ★ 坐标空间：不再有两套（**这一条最重要**）

原来是两套：`levels.json` 的 objects 在旧王邑图 **1800×1010**，
分区插画在 **2624×1472**。现在**只有一套：2624×1472**，大地图与五张小地图共用。

- `map.viewBox = "0 0 2624 1472"`、`map.worldImage = "assets/level2-world.jpg"`
- `zones[].world = {x, y, r}` 是**大地图上的区域入口**（同一空间）
- `zones[].objects[].x/y/r` 是**该区插画上的热点**（同一空间）
- **热点命中与图片显示永远用同一套换算**，不会再"越往右下偏得越多"。
- 所以「1.5 两套坐标空间」那一节记的坑，**在本轮之后不再适用**；
  旧王邑底图 `assets/wangyi-map.jpg` 已不再被页面引用（文件留着，没删）。

### 唯一真源与重建流程（改坐标只走这一条）

```
dev/_l2_calibrate.py   ← 61 字的 (x, y, r, meaning, form) 全在这里
      ↓  python dev/_l2_calibrate.py
js/core/levels.json    ← 写入 art / world / objects / viewBox / worldPins
      ↓  脚本内部自动调 dev/_build_leveldata.py（并先备份 _data.js）
js/core/_data.js       ← 运行时真正读的那份
```

**不要直接改 `_data.js`**（它由脚本生成）。`_l2_calibrate.py` 有两道闸：
字表与现有数据**逐字一致**才允许写（防凭空增删），坐标越界直接拒绝写。

### 成果与验证

| 项 | 结果 |
|---|---|
| 61 字热点 | **全部校准完成，越界 0** |
| 同区"抢点击"（圆心距 < 0.6×(r₁+r₂)） | 山川 1 对（石/水，71px）、人居器物 4 对（卜/糸、糸/戈、刀/斧、人/口）——都靠"最近者优先"+局部放大处理 |
| 手机上最小可点直径 | **44px**（33 个里 0 个低于 44） |
| 桌面端到端走查 | 61 字全部学完，MISS 0，控制台错误 0 |
| 手机端到端走查 | 61 字全部学完，MISS 0，控制台错误 0 |
| 五区自由顺序 | 实测按 人居器物→天象→草木→山川→禽兽虫鱼 进入，进度 20→40→60→80→100% |

### 本轮新加的工具（都在 `dev/`）

| 脚本 | 作用 |
|---|---|
| `_l2_calibrate.py` | **坐标与字表唯一真源**，写 levels.json 并按流程重建 _data.js |
| `_l2_grid.py` | 在最新图上出**带像素刻度**的整图 + 3×3 放大块（用来读准坐标，不靠目测） |
| `_l2_overlay_new.py` | 在**最新六张图**上叠热点出校验图 → `out/level2-maps/_calib/*-calib.png` |
| `_wy2_walkthrough.py` | 第二关端到端走查（桌面/手机），逐字：点实物→放大→学习卡→拼笔画，带 JSONL 日志 |
| `_wy2_shots.py` | 交付截图（5 张：大地图/小地图/标出可点处/放大/学习卡） |
| `_wy2_touchsize.py` | 量手机上每个热点的**真实可点直径** |
| `_wy2_vp_probe.py` / `_wy2_vp_init.py` | 量小地图视口几何（高度、是否被固定顶栏压住） |
| `_patch_viewport_h.py` | 一次性补丁（改 `.wy2-viewport` 高度口径） |

### 本轮踩到的两个真坑（都修了）

1. **缩回全景后滚动位置是脏的**：`setZoom` 先 `redrawZone()` 再用闭包里的
   `viewport` 落滚动 —— 那个节点已脱离文档，量到 0 宽高，于是
   `scrollTop=84` 却无处可滚。改成 `applyZoom` 每次从 DOM **现取视口**，
   先定尺寸再落滚动。
2. **热点会被固定顶栏吃掉**：小地图视口高度原来按 `100vh-300px` 算，
   页面一滚，图上沿就跑到 58px 的 sticky 顶栏底下，那一带的热点
   永远点不到（实测「宀」滚到 y=54 时，点击落到顶栏导航上）。
   现按"扣掉顶栏"给高度，并在视口上留 `scroll-margin-top`。

### 旧脚本已过时（**别再拿它的红字当回归**）

- `dev/_run_wy.py` + `dev/_wy_pin_test.py`：写的是**旧类名与旧玩法**
  （`.wy-bg-dim` / `.wy-spot` / `mask` 白圆 / 顺序解锁 / 一键点亮），
  本轮重做后必然全红。**替代品是本轮新加的 `_wy2_walkthrough.py`。**
- `dev/shell-drive.js` 里 `.lv-center` 那条检查也过时了（那个类已不在
  shell.js 里产出），但它只是打印，不影响判定。

### 已知未决 / 手机上仍不够清楚的对象

- **目 耳 口 止 又 足**（r=60~62，直径 44~45px）：正好卡在触控下限，
  且 目/口 圆心距只有 38px。所以这 6 个字**点击后强制放大到 3.4×**，
  并在视口里给出焦点环；但"不重叠"只能保证到"最近者优先"的程度。
- **刀 斧**（圆心距 62px、直径 52px）：靠 3.0× 放大分开，
  总览时两环会互相压住，属**勉强可辨**。
- **衣**：仍是全图最弱的关联（落在人物腰间），这一条上一轮就记着未决。
- 手机上只要放大到 3× 以上，单件物体（鼎、舟、戈）非常清楚；
  真正吃力的是上面这些"小且近"的组合。

## 7.8 讨伐名录 88 尊接入（图鉴新开一档 + 形象参与战斗）

### 一句话

用户在 docx 那次之后给的口径是两条：**用这份字表、十二生肖不用**；
**「你不只要生成，还要后续和战斗互动注意」**。
所以这一轮不只是出图，而是把 88 尊**接进游戏**：图鉴新开「讨伐名录」一档，
并且让形象本身成为战斗里挨打的那个躯体。

### 数据与资产（都可重跑）

```
_boss_table.txt                     ← _parse_tables.py 从 docx 四表导出的纯文本
      ↓ python _codex.py
docx-boss-codex.json                ← 88 字：form / parts{n,a} / play / alt / playable
      ↓ python _split_cut.py        ← 22 张 2×2 联图 → 88 张 assets/boss/NN-py.png
      ↓ python dev/_build_bosscodex.py   （并入 levels.json 的 bossCodex 段）
      ↓ python dev/_build_leveldata.py   （重新内联 _data.js）
js/core/_data.js                    ← 运行时真读的那份
```

去掉十二生肖后是 **88 字**（象形字补充 22 / 会意字 33 / 假借字 33）。
**分类结果：可斩笔画 16 · 可拆构件 30 · 仅名录 42。**
后 42 个字在 73 字库里既没有整字甲骨形、也拆不出构件 —— **按约束 4 绝不臆造**，
它们在名录里就停在"形象 + 破解玩法"这一层，游戏里不冒充可拆的字形。

### 形象怎么参与战斗（本轮的重点）

`js/modes/boss-raid.js` 里新增 `figureStage()`：把「怪像」的崩坏度**由已经打出来的
进度算**（阶段一的已拆块数 / 阶段三的已斩段数），不另存一份状态 —— 这样怪像、
左侧拆解条、右侧完整度条说的永远是同一件事。五度：

| 度 | 触发 | 观感 |
|---|---|---|
| 0 | 开场 | 骨白剪影 + 发光刻痕 |
| 1 | 拆掉 ≥ 半 | 暗一档、褪一点暖 |
| 2 | 阶段二 | 剪影左右各拖一道**暖/冷错位影**（「构件混同、对不上号」） |
| 3 | 阶段三过半 | **反相**：骨胎沉进暗场，只剩刻痕亮着（「剥落到只剩纹路」） |
| 4 | 全断 / 结算 | 更淡的虚影 |

另加：每打中一次整尊**抖一下**（`.is-hit`），并在它身上**飘出这一手的名字**
（消水属性 / 封走位 / 斩断一段）。抖动只动 `transform` —— 形象的 `filter` 是
**分度数的**，在关键帧里重写 `filter` 会把当前那一度抹掉。

**深色战场上墨线会消失（实测）**：褐墨 ~`#4a3320` 与战场底色 `#30271f→#1d1916`
几乎同明度，线描多的那几尊（涉的水波、雷的闪电）只剩一团白。解法是叠一层同图
`<img>`，`invert(1) sepia() saturate()` + `mix-blend-mode:screen` —— 骨白的身在
screen 下不变，褐墨的线被抬成暖光。**别用 CSS 变量传 `url()`**（见「四」的坑表）。

### 名录进图鉴（第 5 档）

- `js/core/atlas.js` 加 `codex` 种类；`js/core/shell.js` 加名录卡片与详情浮层。
- 卡片走**浅骨胎** `#f7efe1` —— 这个值**必须与 PNG 内填色一字不差**，差一点
  剪影外圈就会露出一圈方框。它与上面四档的**墨底拓片**互为反色，
  一眼分得清"哪块是形象、哪块是字形"。
- 详情：形象 + 今字 + 拼音 + （字库里有的话）甲骨字形对照 + 破绽 + 破解玩法 +
  出处 + 「去讨伐它」入口。
- 讨伐榜上**指针悬停/键盘聚焦某关 → 左边那尊换成这一关自己要打的**（仅已解锁），
  88 张形象从选关页就能一张张看过去。
- 结算页新增「讨伐名录」面板。**只能打完给** —— 「先断枝、再斩根」本身就是整套解，
  开打前给等于报答案（约束 5 的同一条精神）。

### 本轮新加的工具

```powershell
$py dev\_codex_shot.py <路由> <宽> <高> <png> [滚动到|-1=滚到名录] [点开的字]
      # 图鉴名录专项：量 .ac-ob / .ac-art 的真实 rect、骨胎 computed 色、
      # 88 张图是否真画出来、详情浮层的左栏与形象
$py dev\_raid_shot.py <关卡序号,0基> <构件,逗号分隔> <宽> <高> <输出目录>
      # 走完整战斗链：进关→逐块拆→阶段二→笔画终局→结算，每步截图；
      # 带 Runtime.exceptionThrown 捕获（只靠"某块没渲染"倒推是猜谜）
$py dev\_pool_test.py [重复轮数] [宽] [高]
      # 构件池收窄 + "改用笔画"入口位置。反复进关核对池子大小恒定、
      # 正确项一次不漏；量入口按钮的 rect / 视口高 / elementFromPoint
      # 命中测试（区分"在视口里"和"真没被挡住"），并出四张局部截图
```

### 验证结论（本轮实测）

- 88 张资产零缺失、**大小写严格命中**、无孤儿文件（88/88 全被引用）。
- 图鉴 241 卡 / 5 组；名录 88 张**全部真画出**，0 走 `no-art` 兜底。
- 桌面 1440 与窄屏 430 均**无横向溢出**；窄屏名录 3 列、卡片统一 52×52。
- 形象五态、命中飘字、讨伐榜悬停换怪、结算名录面板 —— 逐项实拍并读数确认。
- `_syntax_probe.js`（10 文件 + 18 引用）、`_verify_deploy.js`（18/18）、
  `_bo_stage_test.py`（龟宝情绪 / 三阶段 / 构件池）全绿。
- `index.html` 给改过的 css/js 加了 `?v=20261015-1`（旧的 util.js 仍是 20261012-2）。
  **注意 `css/modes.css` 当时根本没有版本号**，见 7.9 —— 那一档是 7.9 补的。

**这一档与 7.9 已一起推送**（`e71a527f12`，见 §7.10）。
旧素材（方形结构元那版）备份在 `_bak/boss-square-strel`。

### 还没做的

- **21 关里只有 9 关能取到专属形象**（涉 鸣 逐 安 家 木 象 龜 車）。
  其余 12 个（焚 山 人 日 月 水 龍 鳥 鼓 馬 舞 虎）**不在这份 docx 的四表里**，
  仍用本档的三张通用图；其中 龍 馬 虎 属十二生肖（用户明确不做）。
  要不要为这 12 个另出形象，**得用户拍板**。
- 名录里 42 个「仅名录」的字，能不能补上可玩层（比如给它们造构件拆解），未定。

---

## 7.9 第三关反馈修两处（构件池收窄 + 改用笔画入口搬位）

用户原话：「你看第三关 是不是可以在构件攻击完后把那个用笔画攻击的位置改一下
现在这样不太好发现 另外把构件攻击时选择范围缩小下 不用全部构件」

两条都改在 `js/modes/boss-raid.js` 与 `css/modes.css`。

### ① 构件池：37 → 12（定宽）

原实现是「把 `BOSS.palette` **全部 37 个**构件铺出来」（代码注释还专门写了
"设计上必须给全部，只给正确项等于报答案"）。但正确项只有 2 个，玩家要在
37 个长得极像的甲骨构件里扫。

现在 `buildPool()` 按关取 **`POOL_SIZE = 12`**：正确项一个不少，其余从池子里
随机补满，再洗一遍。三条不可动摇的性质：

1. **定宽** —— 池子大小恒定（永远 12）。若让大小随正确项个数变，
   玩家看池子就能反推答案有几个。
2. **一场之内冻住** —— `S.pool` 在 `enter()` 时抽一次。`render()` 每打一下
   就重绘一次，若每次重抽，池子会在玩家指头底下跳。
3. **重开重抽** —— 重打时池子会换，靠记位置蒙答案不成立。

`POOL_SIZE` 只对 6 个合体关（涉 鸣 焚 逐 安 家，`comps` 各 2 块）有意义；
其余 15 关 `comps` 为空，本来就没有池子。

顺带：`.bd-poolgrid` 轨道下限 56 → **86**。56 在 1240px 宽下排出约 21 条轨道，
12 块只占半行、右边空一大片；86 正好排出 12 条，12 块均分一整行。

### ② 「改用笔画」入口：从页面最底部搬到提示卡正文下面

**根因**（实拍确认）：阶段二那一刻，页面上还摊着一整片点不动的构件池，
而按钮挂在 `.bd-actions`——池子**下面**。1440×1000 里按钮完全在首屏之外。

改法：

- 按钮长进 `.bd-field-guide`（龟宝那张提示卡）的正文下面，`.bd-guide-cta`。
  卡片在战场正中，是玩家此刻正在读的东西，不用滚。
- **构件池在阶段二/三收成一条细栏** `.bd-pool.is-dead`：不再铺残池
  （它只干两件事——占掉大半屏、把按钮顶出视口）。细栏右边留一个
  `.bd-pool-cta` 小按钮，玩家万一滚到下面也不会没路走。
- `.bd-actions` 里那个阶段二按钮**撤掉**（`dev/_raid_shot.py` 的点击位置同步改）。
- 窄屏（≤760px）还要再收一点：`.bd-field` 上内边距与行距、`.bd-hero-portrait`
  高度、`.bd-guide-cta` 间距。不改的话按钮底边差 13px 出屏（实测）。

### 实测数字（`dev/_pool_test.py`）

| 项 | 结果 |
|---|---|
| 反复进关 6 轮 × 6 关 = 36 次 | 池子大小**只有 12 这一个值**；漏掉正确项 **0** 次；池内重复 0 次 |
| 每关候选组合 | 各出现 **6 种不同组合**（重抽生效） |
| 阶段一池子（桌面 1440） | 12 块，每块 93×64，**1 行**，池框高 145px |
| 阶段二入口（桌面，视口 861） | 按钮 top=585 / bottom=625 → **首屏完整可见**；`elementFromPoint` 命中按钮本身 |
| 阶段二入口（窄屏 430，视口 761） | 按钮 top=720 / bottom=760 → **首屏完整可见**（改前是 774，出屏） |
| 阶段二池子 | `.bd-pool.is-dead`=True，残余 `.bd-chip` **0** 个，`.bd-pool-cta`=True |
| `.bd-actions` | 内容只剩「重来本关」，不含笔画按钮 |
| 点下去 | 阶段 → 笔画终局，10 段可斩，池子仍为细栏 |
| 控制台 | 无异常 |

回归：`_syntax_probe.js`（10 文件 + 18 引用）、`_verify_deploy.js`（18/18）、
`_bo_stage_test.py`（12 个可点构件、误选走 `mood-gentle`）、
`_raid_shot.py`（走完整链，五段崩坏 / 飘字 / 结算名录面板全对）全绿。

`index.html`：`css/modes.css` 补上 `?v=20261015-3`（**它原先没有版本号**，
改动可能被浏览器缓存吃掉），`js/modes/boss-raid.js` → `?v=20261015-2`。

### 这一轮踩到的坑（已补进 §4 表）

- `App.store` 的键**自带 `ziqu.` 前缀**：探针写 `ziqu.bossraid` → 存成
  `ziqu.ziqu.bossraid`，症状是"只有第 1 关进得去，其余全 locked"。
- CDP 脚本的字符串会被 **Node 先解析一次**：`/[ \n\r\t]+/g` 里的 `\n`
  被吃成真换行 → `Invalid regular expression: missing /`。
- 有顶层 await 的 CDP 脚本**不能 `require()`**，要用 `import`。
- 新开的 headless 浏览器停在 `about:blank`，**必须显式 `Page.navigate`**；
  就绪要轮询真实数据，别睡固定时长。
- `ev()` 只取 `exceptionDetails.text` 会得到没有信息量的 `Uncaught`，
  真正的消息在 `exception.description` 里。

### 推送记录

`726f6ac553` → **`e71a527f12`**（106 个文件，10.8 MB：新增 96 / 修改 10）

推了两轮工作：名录 88 尊形象接入（§7.8）与第三关两处反馈修改（§7.9）。

**推送通道**：这份解包副本**没有 `.git`**，`git push` 走不通（代理对 git 返回 502），
所以走 GitHub REST API 的 git 数据接口（blob → tree → commit → 更新 ref）。
令牌从本机凭据管理器取，不落盘：

```bash
GH_TOKEN=$(printf "protocol=https\nhost=github.com\n\n" | GIT_TERMINAL_PROMPT=0 \
  git credential fill 2>/dev/null | sed -n 's/^password=//p')
GH_TOKEN="$GH_TOKEN" python push_bosscodex.py --dry   # 先看清单
GH_TOKEN="$GH_TOKEN" python push_bosscodex.py         # 再真推
```

**"要不要推"用 git blob sha 判定**（`sha1("blob <len>\0" + content)`），和 git
自身的对象标识一致，所以"内容相同"就是真的相同，不受解包时间戳影响。
比对脚本 `_gh_diff.py`，只读不写，推送前先跑它。

刻意**没推**的两个文件：

| 文件 | 原因 |
|---|---|
| `deploy.ps1` | 与远端**只差行尾符**（远端 LF、本地 CRLF 是 Windows 解包带进来的）。推上去等于把整个文件重写一遍，提交里全是无意义噪音。归一化行尾后逐字节相同，已核。 |
| `_cdp_pool.js` | 验证时留下的临时探针产物，不属于仓库内容。 |

**线上核验**（`_gh_live.py` + `_live_shot.py` + `_live_net.py`）：

- 9 个改动文件逐个比线上内容，全部含本轮特有字符串（`POOL_SIZE`、`bd-guide-cta`、
  `bossCodex`、`讨伐名录`、`is-codex`、`bd-pool-cta`、`as-left-codex`、
  `modes.css?v=20261015-3`），尺寸与本地逐字节一致。
- 真浏览器打开**公开地址**：241 张卡片 / 5 组、88 张名录形象全部 `naturalWidth>0`、
  退化成「无形象」0 张、骨胎底 `rgb(247,239,225)`、`.ac-ob` 111×111、
  选关榜 21 颗珠子、无横向溢出、控制台无异常。
- 网络层：88 个图片请求**全是 200**，零 `loadingFailed`、零控制台错误。

### 一个必须知道的线上特性：名录首屏冷加载要约 36 秒

`assets/boss/` 88 张 PNG 合计约 10.5 MB。冷缓存打开图鉴滚到名录，全部画出来
实测 **36 秒**（每秒采样曲线 `0,0,2,5,12,…,85,88,88`，单调上升、没有卡住）。

**这不是 bug**，88 个请求全是 200。但会误导验证：中途截图会得到"只画出来
39 张"的画面，看着像坏了。所以实拍脚本必须**等到 88 张全画出来**再截图，
不能睡固定时长（`_live_shot.py` 里等满 180 秒，`_live_net.py` 里画加载曲线）。

真要提速的话方向是**给图鉴单独出一套小尺寸缩略图**：名录卡片显示区只有
96px，而现在加载的是 477px 宽的整图（那是给战斗页大尺寸显示用的）。
缩到 120px 左右能把这一页的传输量砍掉约一个数量级。**尚未做，需要先定口径。**

---

## 7.10 3D 数字博物馆（`#/museum`；**现在是站点主体**，见 §7.11）

### 一句话

原本是"在现有站点上**加一层**"：新增 `js/museum/` + `css/museum.css` + `vendor/three.min.js`，
对上只动 `index.html` 几行脚本一行 CSS、`js/core/shell.js` 两处（导航项 + 路由分支）。
**删掉这些引用，站点仍能退回没有展馆的样子**（2D 首页还在 `sceneHome`，只是默认不再指向它）。

> 后续用户明确要求「直接把 3D 作为内容，原来的不需要了」，于是入口反过来：
> **打开网站即进馆**。那次改动记在 §7.11，读这一节时要知道入口已不是首页。

### 场景是真的 3D，不是贴图假装

- **七间屋子**：大厅 / 甲骨文展厅 / 造字区 / 考古区 / BOSS 区 / 文明序厅 / 我的典藏区。
  都是同一台 renderer 里的 `Group`，进门只切 `visible` + 移相机（附区每间隔 150 单位），
  不重建渲染器，也不做跨屋的阻尼飞行（那等于穿墙）。
- **大厅**：石质抛光地面（`stoneTex()` 现画）+ 两道铜环 + 中心台座 +
  `卜` 字骨版（Blender 模型，落座按包围盒对齐台面）+ 六道门洞（门楣灯带 / 门柱 / 门槛 /
  底部加色雾 veil / 地面 spill / 竖排石牌 / 字形徽章）+ 12 根柱 + 顶棚灯槽 +
  正后方入口门廊（`entrance-arch.glb` + 门洞暖光 + 地面光斑）。
- **甲骨文展厅**：12 件展品一字排开，每件独立台座（`pedestal.glb`）+ 骨版 + 展签；
  半空悬一块四列竖行的表谱骨版（吊索 + 细框），另有一个玻璃展柜（`display-case.glb`）。
- **骨版几何**：程序化那份走 p-范数圆角矩形轮廓 + 崩口 + 残断，用 `lineTo` 连（**不能用
  `splineThru`** —— 样条会把直边拉成弧，26 个点一插值就成了鸭蛋，这是踩过的坑）；
  Blender 那份是同一套轮廓思路的正式版。
- **刻辞是真的字形**：`museum-tex.js` 用 `Path2D` 描 `App.glyphs.parts[字].pieces[].d`
  的真实笔画路径，三道工序（暗槽 + 字身 + 亮边，末道 `globalCompositeOperation='lighter'`）
  画进 canvas，同时出 `map` 和 `bump`。**所以骨上的字和你图鉴里的是同一份数据**，不是另画的图。

### 交互（桌面 + 触屏同一套）

| 操作 | 行为 |
|---|---|
| 拖拽 | **没选中展品时**转相机；**选中后**转这件展品（这是刻意的，看骨片要看背面） |
| 滚轮 / 双指捏合 | 缩放（半径夹在 3.2–34） |
| 点击 | 射线拾取 `pickables` → 开详情面板；`ctrl.moved < 7` 才算点击，防拖拽误触 |
| 七区 chip | `setArea` 进厅/进展厅，七个区都是真的屋子 |
| 顶栏按钮 | 聚光开关 / 声音 / 重置视角 / 返回大厅（**没有「退出 3D」**，馆就是首页） |
| Esc | 关展签（不再等于"退出"） |

相机**按画幅给两套预设**（`viewFor`），并做 FOV 自适应：
`fov = aspect >= 1.2 ? 42 : min(57, 42 + (1.2-aspect)*19)`。竖屏手机因此不会被挤成一条缝。

### 与其他功能的接法（P1）

- 展品数据来自 `data/levels.json` 的 `zones` 对象（日 月 雨 山 川 泉 木 林 牛 鱼 门 鼎 12 件），
  释义走 `BUILTIN_POOL`，字形 SVG 走 `App.glyphSvg`，笔画数等走 `App.glyphs`。
- 详情面板底部两个出口：**去造字**（`#/play/bone-build`）、**去考古**（`#/play/wangyi-map`），
  另加一条 `#/atlas`。构件行明确标注「组合示意，非整字原形」。
- 观展记录存 `localStorage['ziqu.museum']`（`{seen:{字:ts}, v:1}`），「我的典藏区」显示
  「已观展 N/12」，并与 `App.atlas.stats()` 的 `learned / percent` 并列。
- 龟宝用**原有图片** `assets/guibao-front.png`，没重画。

### 性能与降级

- `three.min.js` **不在 `index.html` 里**，进 `#/museum` 才按需注入（12 秒超时兜底），
  首页仍付 0 成本。
- 实测（headless Edge + SwiftShader，1200×800）：大厅 **51–71 draw call / 16,000 三角形**
  （视取景，拉近会剔掉外墙与柱）；展厅 **78 / 25,108**；附区 **19–68**（柜里亮着几件决定）；
  竖屏手机 28–52。最大的一件模型是 `oracle-bone.glb`（11,232 面）。
- 低端判定：`hardwareConcurrency<=4 || deviceMemory<=2 || 移动端 UA` → 关掉部分光源与阴影精度。
- **WebGL 探测失败 → 2D 降级大厅**（`toFallback`，`data-fallback="1"` 隐藏 3D 专属控件：
  骨片实拍 + 中央说明牌 + 六张展区卡 + 12 个展品按钮），功能不丢。
- 离开路由（`App.on('route')` → `teardown`）遍历场景 dispose 几何/材质/贴图，
  再 `renderer.dispose()` + `forceContextLoss()` + 移除 canvas。实测
  `enter1 canvas:1 → leave1 canvas:0 → enter2 canvas:1 → leave2 canvas:0`，无泄漏报错。

### 验证结论（本轮实测）

| 项 | 命令 | 结果 |
|---|---|---|
| 引用完整性 | `node dev/_verify_deploy.js .` | 全部 60 个引用可精确命中 |
| 语法 | `node dev/_syntax_probe.js` | 全部可解析，无缺失引用 |
| 十路由回归 | `node _check/mu_regress.js` | 10 个路由全渲染，无 pageerror / console error；`canvas:0`（博物馆外） |
| 进入/退出两轮 | `node _check/_twice.js` | canvas 1→0→1→0，无错误 |
| `file://` 双击 | `node _check/_file.js` | `ready:true`，无错误（靠经典脚本注入，不用 ES module 就是为了这个） |
| 关 WebGL | `node _check/_nogl.js` | `fallback:true, hasCanvas:false`，面板可开，无错误 |
| 手机 390×844 | `node dev/_mobile.js …/#/museum` | 无横向溢出 / 无元素超出右缘 / 触控目标合格 |
| 七区走查 + 交互断言 | `node _check/areas.js` | 造字 `build-ok/done:true`、考古 3/3、BOSS 4/4、典藏 `n:1`、离馆后 `canvas:0`、`errs:[]` |
| 竖屏同一套 | `MU_MOBILE=1 node _check/areas.js` | 同上，全部通过 |
| 四个 GLB 是否真读到 | `App.museum.api().models()` | `{bone:1,plastron:1,pedestal:1,case:1,arch:1}`（1=成功，2=失败已降级） |

### 模型与素材来源（一句话：模型是自己建的，没有下载）

- **外部下载项只有 1 个**：`vendor/three.min.js`（Three.js **r149** UMD，MIT，608,081 字节，
  取自 `https://unpkg.com/three@0.149.0/build/three.min.js`）。选 UMD 而不是 ES module，
  是为了 `file://` 双击仍能跑；UMD 里**没有** OrbitControls，轨道控制器是自己写的。
  除此之外模型、贴图、音频全部自建 —— 音频是 Web Audio 现场合成，连一个 mp3 都没有。
- **5 个 GLB 模型**：由 `tools/build_models.py` 驱动 Blender 4.5.10 LTS 无头生成。
  `.blend` 源文件不入库 —— 脚本本身就是源，形状参数、材质分区、UV 都在里面，
  重跑一次就重新生成，不存在"二进制源文件与导出物对不上"的问题。
- **复用既有资产**：`assets/guibao-front.png`（龟宝，未改）、`data/levels.json`、
  `js/core/leveldata.js` 的字形与笔画数据。配色全部取 `css/theme.css` 的 token。

| 文件 | 字节 | 面数 | 用在 | 忠实 / 艺术 |
|---|---|---|---|---|
| `assets/models/oracle-bone.glb` | 256,272 | 11,232 tri / 2 材质 | 第一展厅中央那件 | 形态是艺术复原；刻辞取自真字形 |
| `assets/models/turtle-plastron.glb` | 122,460 | 5,182 | 文明序厅的龟甲架 | 艺术复原 |
| `assets/models/pedestal.glb` | 14,964 | 768 | 展厅 12 个台座 | 通用构件 |
| `assets/models/display-case.glb` | 13,488 | 196 | 展厅玻璃展柜 | 通用构件 |
| `assets/models/entrance-arch.glb` | 18,052 | 360 | 圆厅入口门廊 | 通用构件 |

源场景另存一份 `blender/models-source.blend`（1.5 MB，16 个网格对象并排摆放），
拿 Blender 打开就能逐个改；改完重跑 `tools/build_models.py` 会重导全部 GLB 并覆盖它。

**读取器是自写的** `js/museum/glb.js`（约 200 行，零依赖）。原因：`examples/js/` 下的
`GLTFLoader.js` 在 r149 之后已从 three 仓库移除，而 `examples/jsm/` 是 ESM，
会破坏 `file://` 双击。它只实现 GLB 的常用子集（JSON/BIN 双 chunk、accessor（含
interleaved stride）、node TRS/matrix、多 primitive、baseColorFactor、alphaMode=BLEND、
doubleSided），遇到 Draco 或未知扩展**明确报错**，不静默画错。

**加载失败一律可降级**：每件模型都有程序化替身，`getModel()` 成功才替换；
失败只记 `modelState[key]=2`，原样保留程序化版本。`file://` 下没有 `fetch`，
会直接走降级 —— 不报错、不白屏。

### 已知限制（诚实交代，别在汇报里含糊）

1. **展品不是真文物扫描**。骨版是 Blender 参数化建的（p-范数圆角矩形轮廓 + 崩口 +
   残断 + 边缘收薄），裂纹是程序生成的发丝裂；展签与文档里都写明「数字复原模型」。
2. **七个展区都是 3D 房间，但都很小**（14–17 米见方，一两件主体）。这是取舍：
   一间屋子塞十几件，手机就掉帧了；"大馆感"靠取景和光，不靠面积。
3. **环境音是合成的氛围垫底**，没有脚步、没有真实展厅的脉冲响应采样；
   默认关，点「声音」才响。
4. **阴影只有一张**（中心展台用的是 contact shadow 贴图，不是实时 shadow map），
   附区全部关阴影 —— 低端机下这是刻意的取舍。
5. **表谱骨版的四列是"行款形制"演示**，不是某一片出土卜辞的摹本；展签里写明了。
6. **没有碰撞检测**：相机是轨道式的（球面约束），本来就不允许走进展品之间，
   这不是第一人称漫游，也就不需要碰撞。


### 下一步（要做的话，优先级从上到下）

1. **骨面细节**：现在只有一张 1024 的 canvas 贴图，近距离看骨孔与裂口还是"平"的。
   加一张法线贴图（或 2048 的 albedo + roughness）近景会明显不一样。
2. **展签里的卜辞只有一行**：数据结构支持多行，但没排过真正的多列辞例。
3. **入口门廊只是剪影**：门后是一块加色发光面，没有真的"另一间屋子"。
   要做可以做成真能穿过去的第二进。
4. **模型可以再省**：`oracle-bone.glb` 约 6.3k 面，侧面细分偏密；
   若要照顾低端机，可再导一份 Draco 压缩版 + 一份低模，按设备选。


## 7.11 把 3D 变成站点主体（入口反过来）

### 一句话

用户一句话定的调子：**「直接把 3D 作为内容，原来的不需要了」。**
于是不再有"2D 首页 + 一个 3D 入口"，打开网站就是第一展厅；2D 页面降级成馆内的子页。

### 改了什么

| 文件 | 改动 |
|---|---|
| `js/core/shell.js` | `render()` 里把 `home` / `museum` 统一成展馆场景（`App.museum` 缺失时仍退回 `sceneHome`，不让路由卡死）；顺手把地址栏 `replaceState` 成 `#/museum`；玩法页返回按钮改成「← 回馆」，回的是出发的那个区 |
| `js/museum/museum.js` | 顶栏去掉「离馆」和「退出 3D」，左边换成不可点的馆徽（`甲`）；中间区域名跟着展区变（`setBarName`）；`syncHash()` 让地址栏跟着展区走；`_zone` 记住"从哪个区出去的"；`#/museum/<区>` 支持任意展区深链（原来只有 gallery）；`syncStack()` 量底部浮层高度写进 `--stack-h` |
| `css/museum.css` | `.mu-back` 从"返回按钮"改成馆徽（无 hover、无指针）；导览气泡改用 `--stack-h` 定位；竖屏把任务条搬到顶部、进任务区时收起气泡 |
| `_check/areas.js`、`_check/_twice.js` | 断言从"离开到 `#/home`"改成"离开到 `#/atlas`"—— `#/home` 现在也是展馆，用它验不出 canvas 释放 |

### 三个真 bug（都是这次改动暴露出来的，不是"看着不太好"）

1. **路由改写把子路径吃掉了**。`r = { name:'museum', params:{ id:'' } }` 抹掉 `params.id`，
   `#/museum/excavate` 永远落回大厅。改成保留 `id`。
2. **同一个 hash 里换子路径会造出两套实例**。`route` 事件只在"离开 museum"时 teardown，
   所以 `#/museum` → `#/museum/build` 时旧实例还活着，而 `S` 是模块级单例，两套互相覆盖
   （表现：进了区 1 秒后又自己退回大厅）。修法：`scene()` 进门先 `if (S.alive) teardown()`。
3. **`--stack-h` 被媒体查询盖掉**。基础规则改成了 `calc(var(--stack-h) + 10px)`，
   但 760px 那条还写着 `bottom: calc(102px + ...)`，竖屏照样压在任务条上。
   两处都得改，否则"桌面好了手机没好"。

### 竖屏 HUD 的取舍

手机上底部已经堆了「任务条 + 两行导览条」。把任务条留在底部，气泡再往上抬就会压住台面上
那几个**要点的构件块**——等于挡住了操作。所以 ≤760px：

- 任务条搬到顶部（顶栏下面那块是空墙，信息放这里不挡操作）
- 进造字/考古/BOSS 时收起龟宝气泡（任务条已经把"要做什么"写全了，不重复说一遍）
- 导览气泡在非任务区也放顶部

桌面不变：气泡在左下、任务条在导览条上方，两者用 `--stack-h` 保证不打架。

### 验证

| 项目 | 结果 |
|---|---|
| 打开根路径 / `#/home` / `#/` | 都进 `#/museum`，`scene-museum` 生效、2D 顶栏隐藏、canvas 1 |
| 顶栏按钮 | 只有 聚光 / 声音 / 重置视角 / 返回大厅；馆徽是 `DIV` |
| `#/museum/excavate` 深链 | `area: excavate`、顶栏「考古任务区」 |
| 区 → 去正式关卡 → 回馆 | 落回 `#/museum/excavate`、`area: excavate`、canvas 1 |
| 2D 子页（`#/atlas`）点站名 | 回馆，canvas 1 |
| 气泡 vs 任务条 / 导览条 | 桌面竖屏均不重叠（矩形求交验证） |
| 七区走查（桌面 + `MU_MOBILE=1`） | 造字 `build-ok/done:true`、考古 3/3、BOSS 4/4、典藏 `n:1`、`errs:[]` |
| 进→出→再进 | canvas 1→0→1→0 |
| 关 WebGL | `fallback:true`，平面展厅，不白屏 |
| `_verify_deploy` / `_syntax_probe` | 60/60、全通过 |

### 没做的

- **2D 首页没有物理删除**。`sceneHome` 还在，只是默认路由不再指向它——万一展馆脚本出问题，
  退回 2D 首页这条路还留着。真要删，说一声。
- **2D 子页的站名还是「字有骨气」**，而站点标题与展馆是「甲骨奇谭」。这是早前改名留下的
  半截（`_backup_20261029_rename`），改字要改 4 处文案 + 品牌艺术字，属于内容决定，没擅自动。
- 玩法页「回馆」只认"从区里出去"这一条路；直接开 `#/play/xxx` 再点回馆，落在第一展厅（没有出发地）。


## 7.12 3D 王邑：实体甲骨文字 · 龟宝重制 · 三关解锁（本轮，P0 完成）

> 用户原话要点：「**不要把甲骨文字做成漂在地图上的普通标签**」「**每个甲骨文字都要成为实体物件**」
> 「**先重做地图和实体文字，再推进前三关**」「第三关可以自由安排，不用遵循原来的顺序」。
> 三条验收最要紧：**地图是可操作三维场景**、**甲骨文字是真实三维物件**、**三关有清晰顺序与解锁关系**。

### 一句话

`#/world` 从"倾斜平面配图"变成可跑、可碰、可拾取的三维场景；38 个字从平面卡片变成
**有厚度、会投影、能多角度观察的实体**（骨片刻字 / 龟甲刻痕 / 立石 / 陶片 / 青铜 / 构字装置）；
龟宝按官方三视图重建；前三关有了顺序、门阙与解锁。

### 改了什么（本轮四个 world 文件共 3786 行）

| 文件 | 行数 | 职责 |
|---|---|---|
| `js/world/world-glyph.js` | **753** | **新文件**。实体字工厂：真字形 → 折线 → 多边形 → 挤出成实体笔划，六个载体 + 构字装置 |
| `js/world/world-build.js` | 869 | 聚落几何、地形、字区布局、**五座关卡门阙**、第三关祭坛与冂门、远山洹水 |
| `js/world/world3d.js` | 1219 | 渲染器 / 相机 / 碰撞 / 拾取 / 焦点机位 / **龟宝模型** |
| `js/world/world.js` | 945 | HUD、目标条、三关数据、构字交互、祭坛入口、`bossWon` 回写 |
| `css/world.css` | 新增 | 世界 HUD（目标条、关卡面板、锁定态） |
| `index.html` | 改 | 注册 `world-glyph.js`；world 四个文件统一版本戳 **`20261029-56`** |

### 实体字是怎么来的（不画图、不建模、不下载）

真字形来自 `js/core/glyph-parts.json` —— **73 字 / 498 构件**，每字由若干条 `M/L` 折线组成，
带 `strokeWidth` 与 `transform`（实测全表只用 `translate,scale` 两种，解析可靠）。

```
折线 → Douglas–Peucker 抽稀 → 两侧偏移半个笔宽 → 闭合多边形
     → ExtrudeGeometry 挤出（带倒角）→ 合并几何 → 统一 scale(size)
```

所以**笔划有厚度、有侧面、会投影**，是真三维物件，不是贴图也不是 Extrude 出来的纸片。

**六种载体**（`App.worldGlyph.styles`），按字的性质与玩法选，不是一张脸桶出水：
`plastron` 龟腹甲 / `bone` 骨片 / `scapula` 牛肩胛骨 / `stele` 立石 / `pot` 陶片或青铜牌 / `assembly` 构字装置。

**构字装置**（第二关的核心）：用 `clusterPieces(ch, k)` 把笔划按空间方差主轴分组，
得到"这个字由哪几个部件组成"（如「林」的 10 笔自然分成左右两棵树）。每个部件一个独立 mesh，
散在环外，**点一个就沿空间真飞回去**（每帧插值，不是播动画）；点错次序就把它往上顶一下再落回。
`林` 2 件、`泉` 3 件、`谷` 2 件。

### 三关与解锁

| 关 | 名称 | 开放区 | 通关条件 |
|---|---|---|---|
| 1 | 发现文字 | `sky` | 天象区 `日 月 雨 火` 四字全认完 |
| 2 | 构字探索 | `land` `plant` | `林 泉 谷` 三座构字装置全部拼成 |
| 3 | BOSS 讨伐 | `beast` `life` | 走过祭坛冂门打 BOSS（**尚未实现**） |

每区入口一座**石阙 + 骨封牌**：未通关时封牌沉在门洞里并注册进 `colliders`（走不过去），
通关时升进门楣（实测升起 2.51~2.55 m）且 `blocked()` 跳过该门的碰撞。

存档：`App.store` 的 `wangyi` 里新增 `stages: { cur, cleared:[], asm:{}, boss:{} }`。

### ★ 本轮踩到的坑（都修了，别重蹈）

| 坑 | 症状 | 正解 |
|---|---|---|
| **存档静默丢档**（本轮最严重） | 认完四字**永远不通关** | `App.store.get` 每次 `JSON.parse` 出**新对象**，三处"改 `stage()` 再 `commit(progress())`"写回去的是旧快照。新增 **`stageMut(fn)`**——同一对象改完即写 |
| **挤出深度双重缩放** | 字侧看像贴纸 | `depth` 里乘了 `size`，外面又 `scale(size)`，实际厚度只剩 0.014 m。改为 **归一化单位挤一次，最后统一 `scale(size)`** |
| **挤出后正面不在 z=0** | 甲缝/字薄薄埋进载体 | 挤出 + 倒角后正面平板实际落在 **`depth + bevelThickness`**。龟腹甲 `TOPZ = 0.075 + 0.022` |
| **闭合笔划加圆帽** | 日/口/目/山外廓接头鼓出圆头 | 首尾距离 `< hw*1.4` 判为闭合，**左右各走一圈首尾对接**，不加圆帽 |
| **笔宽过细** | 40 cm 实物上只有 4 mm 的线 | 归一化后 **`hw = max(hwRaw*k + 0.006, 0.032)`** |
| **`hipRoofGeo` 法线全反** | 房子没屋顶 | 材质是 `DoubleSide` 所以没被剔除，但光照按反面算。逐面交换 `v1/v2`（见上一节） |
| **`var fires` 在后面声明** | 构建报错 `Cannot read properties of undefined` | 门阙与祭坛都要往里加，把声明提到 `glyphItems` 处 |
| **`api.zone` 字段漏了** | `focusItem` 全部返回 false | `itemOfChar(ch, zone)` 匹配不上。api 必须有 `char/style/zone/marker/solved` |
| **E2E 点击被浮层吞** | 点第四个字时面板显示第三个 | 认字面板 `.wd-p-x`、奖励卡 `.rw-mask` 都盖在画布上。**每次点击前必须先清浮层** |
| **看不了图** | 七张特写截图无法视觉确认 | 本机 `ViewImage` 对当前模型不可用（返回"不支持图片"）。本轮**全部靠几何量测 + 数值断言**验收 |

### 龟宝（按官方三视图重建，第二轮结构升级）

参考 `中原使者——龟宝.pdf` 三视图。第一轮换了配色/㎡纹等表层，用户说"太粗糙"，
第二轮把拼装件全换成真结构：

- **壳**：压扁球 → **LatheGeometry 穹顶**（缘口外翻 + 椭圆剖面）+ 16 枚金/深金缘盾 + 金环压边；
  新增 `shellZ(x,y)` 求壳面，所有挂饰按面摆放（这是"挂在壳上"而不是"插在壳里"的关键）
- **眼**：眼窝环(socket) + 眼球 + 棕虹膜(iris) + 双高光，四层；补下颌球，不再是"球插棍"
- **四肢**：圆柱 → **CapsuleGeometry 胶囊** + 圆掌 + 三枚爪锥
- **围巾**：圆环 → **闭合 CatmullRom 管**；飘带是沿壳背垂下的开放管
- **背包**：球 → **Lathe 软囊**（腰鼓颈收 + 翻边口）+ 束口绳 + 竹简 + 带尖毛笔
- **背带**：整圈 torus（侧面像呼啦圈）→ "包口→肩→左腰"的斜挎皮绳管

**一条坐标规则**：头面半径 0.254，**所有面部件的 z 必须 ≥ 0.24**，否则埋进头里看不见。
以前就是这么丢掉眼/额纹/腮红的。

### 验证（都不是"看着还行"，是实测数字）

```
_check/_verify.js  →  104 pass / 0 fail, errs: []
```

- 场景量级：`meshes 321 / tris 68672 / colliders 83 / spots 52 / items 43 / pickables 194 / gates 5`
- 地形高差 **−3.51 ~ 5.22 m**（不是平地）
- 七个字的实体量测（宽 / 高 / **厚** / 笔划数），厚全部 ≥ 0.046 m：
  `木 0.215/0.436/0.046/3` `豕 0.253/0.438/0.046/10` `鹿 0.316/0.461/0.049/17`
  `鼎 0.441/0.461/0.049/11` `邑 0.160/0.437/0.046/6` `谷 0.358/0.568/0.067/6（2 个构件）`
- **锁关生效**：一关未过时点第二关的「山」→ 不入识字簿；通关后点 → 正常入簿
- **解锁生效**：四字认完 → `progress {done:4,total:4,ok:true}`、`cleared=true`、`cur=2`、
  `gates {sky:true, land:true, plant:true, beast:false, life:false}`；三座封牌升起 2.51~2.55 m，另两座仍为 0
- 语法：`dev/_syntax_probe.js` 全 OK；引用：`dev/_verify_deploy.js` **65 个引用全部精确命中**

**线上实测**（GitHub Pages，`_check/_online.js`，`waitUntil:'domcontentloaded'` +
` waitForFunction ready`）：

```
ready = true
scene = {"meshes":321,"tris":68672,"colliders":83,"spots":52,"items":43,"pickables":194,"gates":5}
gates = {"sky":true,"land":false,"plant":false,"beast":false,"life":false}
4xx/失败请求 = 无        页面错误 = 无          线上 PASS
```

线上各项数字与本地**完全一致**（含 wd-boot 遮罩的 8 秒文案切换 `365 → 35622 → 35622` 字节）。

> **测线上必须绕代理**（见下面那条），且别在 Pages 重建窗口里测——推送后约 90 秒内可能慢到
> `Navigation timeout`。等两三分钟再测，或先用 `curl` 探一下首页是否 <1 s 再跑无头。

### ★ 一个会挡住发布的坑（务必先看）

**推 GitHub 必须绕过本机代理。** 本机 `http_proxy=https_proxy=127.0.0.1:13893`（Steam++ 本地转发），
`git push` 一律 `CONNECT tunnel failed, response 502`；托管发布则 `UND_ERR_SOCKET other side closed`。
实测**直连反而更快**（0.115 s vs 0.704 s）：

```bash
cd C:\DSH\字趣
unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY ALL_PROXY all_proxy
export GIT_TERMINAL_PROMPT=0
git push origin main
```

另外远端已迁移到**小写**路径 `https://github.com/elaijw/jiagugouciji.git`
（旧写法 `Elaijw38` 每次推送都被提示 `This repository moved`），`deploy.ps1` 里的地址已同步改掉。

### ★ 又一个坑：`three.min.js` 594 KB，GitHub Pages 上必定超时（本轮已修）

**现象**：线上 `#/world` 与 `#/museum` 打不开，报 `3D 引擎加载超时`，而所有资源都是 200。

**根因**：`vendor/three.min.js` 实际 **594 KB**（不是 early 估计的 64 KB）。GitHub Pages 在国内
实测同一份文件：**10.7 s / 15.1 s / 60 s 超时未完**（`du -sm vendor` 也只有 1 MB 的量级，容易被
误判成"几十 KB 的小文件"，于是超时阈值定成了 15 s —— 等于线上必挂）。

**修法**（`world3d.js` 与 `museum.js` 两处同样的 `loadThree`）：

- 单轮超时 **12/15 s → 45 s**；失败**重试 2 次**（共约 135 s 窗口）
- 重试时给 URL 加 `?retry=<时间戳>`，**绕开浏览器对那次失败响应的缓存**（不加的话第二次请求
  根本不发，直接复用坏结果，重试形同虚设）
- `world.js` 里加载遮罩本来就有（`wd-boot`："殷商王邑 / 正在夯土筑城…"），
  新增：**超过 8 秒把文案换成"3D 引擎较大，正在下载…"** —— 别让玩家以为夯土真要夯一分钟

**教训**：判断"文件多大"要用 `du`/`stat` 看真实字节，不要凭印象；给外部资源定超时，
要按**最差网络**估，不是本机。

### ★ 另一个坑：仓库根目录堆了 4 GB 调试产物（本轮已清）

发布托管时失败：`ERR_FS_FILE_TOO_LARGE File size (2588468917) is greater than 2 GiB`。
根因是根目录堆了大量本机调试产物，而这些**本来就在 `.gitignore` 里**（不是站点资产）：

| 目录 | 体积 | 是什么 |
|---|---|---|
| `_check/` | **3042 MB** | 自查脚本 + **puppeteer 的 Edge profile 缓存**（欧洲裏一个 crx 缓存就有 156 MB） |
| `_shots/` | 1032 MB | 历史截图（同样混着 Edge profile） |
| `out/`、`_probe2/3/`、`_backup_*/` | ~150 MB | 备份与中间产物 |

**已整体移到项目外的 `C:\DSH\字趣-debug\`（移动，不是删除）**，根目录从 ~4 GB 降到 **99 MB**
（站点本体约 33 MB + `.git` 66 MB）。

**对下一任的影响**：`_check/_verify.js` 现在在 **`C:\DSH\字趣-debug\_check\_verify.js`**
（`node_modules` 跟着目录一起走了，可直接跑）。`dev/` 里的验证脚本仍留在项目内。
**发布前务必确认根目录只有站点本体**，别把 profile 缓存又堆回来。

### 还没做的（P1 / P2，按优先级）

1. **第二关端到端**：三座构字装置"按序点构件归位 → 拼成 → 三关开启"还没跑过完整流程
   （单个字 notified 已通，脚本在 `_check/_verify.js` 之外还没写）
2. **第三关独立 3D 战斗场景 + BOSS 真三维模型**（用户最想要，当前完全空白）：
   - `js/modes/boss-raid.js`（1384 行）现在还是**横版 2D**，不含 3D
   - 可沿用 `assets/boss/*.png` **17 张既有设定图**（01-gui / 02-yu / 03-feng …）
   - Blender 4.5 已装：`D:/DSH-tools/Blender4.5/Blender Foundation/Blender 4.5/blender.exe`（无头验证过）
   - `world.js` 已留好 `bossWon(words)` 回写接口 + 祭坛冂门入口 `openAltar()`
3. **P2**：BOSS 待机/攻击/受击动作、通关演出、更多实体字

### 已知没验到的

- 实体字的**实际观感**（比例是否好看、有无穿模）没有视觉确认——本轮看图工具不可用。
  若换到一个能看图的会话，**先看 `_shots/guibao/` 下的龟宝三视角**（`gb-front/side/back.png`），
  再把 `_check/_guibao.js` 改成本回哥十七个字各出一张特写核对。
- 走门测试曾发现 `(0,0)` 广场有个大碰撞体挡路，传送测试点要放在碰撞体外（取 `k=0.72` 格）。



**先读「1.5 两套坐标空间」**——那是这个项目最容易出错、代价最大的一条
（我曾把热区坐标按错的空间重写，61 个点位全偏，靠备份回滚）。

然后**先把成果给人看**，别急着改：

```powershell
cd C:\DSH\字趣
python -m http.server 8099
#   #/world            ← **站点主体**：3D 殷商王邑（见 §7.12，实体字 + 龟宝 + 三关）
#   #/museum           ← 3D 数字博物馆（见 §7.10）
#   #/play/wangyi-map  ← 第二关：大地图选图入口 + 五个据点 + 分区插画
#   #/play/bone-build  ← 第一关：龟宝入门课
#   #/atlas            ← 拓片集
```

> **跑 3D 相关的自查要绕代理**，否则无头浏览器连本地服务都会挂：
> `unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY ALL_PROXY all_proxy`（见 §7.12）。

```powershell
# 出图给人看
$py='C:\Users\32058\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe'
$node='C:\Users\32058\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe'
& $py dev\_route_shot.py play/wangyi-map 1440 1000 _check\wy.png 0
& $node dev\_mobile.js "http://127.0.0.1:8099/index.html#/play/wangyi-map" 390 900 _check\wy_m.png
```

**第二关已知未决**（接着做就从这两条挑）：
1. 人居器物那张的「衣」不够明确（其余 32 项都有对应物）；
2. 大地图「天象」区偏弱，总览时认不出。

**一条工作方式上的教训**（用户明确提过）：
我曾在长上下文里丢掉关键前提，于是拿错的基准改数据、连续盲改图。
**对策**：把状态与教训即时落进本文件，别留在会膨胀的对话里；
动手前先重读相关小节，改完必跑「五」的全套。

**别一次改十个地方。改完跑「五」的全套，截图给人看。**

---

## 9. 与人协作的注意

- 用户会**贴 PPT / 图片**给参考。**先看清它到底在教什么**（这次教的是"要有密度、要大胆"），
  **不要照抄它的外形**——那会被直接指出"你就只会抄吗"。
- 汇报里要写：**改了什么文件、怎么预览、测了什么、哪些没测**。用户要证据，不要形容词。
- 不确定就问，但**别问能自己查出来的事**。

---

## 7.13 第二关 3D 化 + 龟宝 3D 角色（本轮）

### 一句话
`#/play/wangyi-map` 不再进平面大地图，改走 `App.world`（`#/world` 那套 three 场景）；
二维地图的 61 个学习点、分区、进度、存档逻辑全部沿用，只换了呈现层。

### 路由（改在这里，只有一处）
`js/core/shell.js`：
```js
else if (r.name === 'play' && r.params.id === 'wangyi-map' && App.world) scene = App.world.scene();
else if (r.name === 'play') scene = scenePlay(r.params.id);
```

### 新增文件
| 文件 | 职责 |
|---|---|
| `js/world/guibao.js` | 龟宝 3D 角色（Lathe 壳 + 腹甲、程序化贴图、关节动画）。`App.guibao.build(T)` |
| `js/world/world-zones.js` | 五区地貌差异（地皮贴图 / 地标 / 地表散件 / 出生台地 / 广场）。`App.worldZones.decorate(ctx)` |

`guibao.js` 的坐标约定：`root` 原点 = 脚底 y=0，`hips.position.y` 静止为 0，
所有子件写**世界高度**（早期版本 hips 抬 0.245、子件又写绝对高度 → 整体悬空 0.29 米）。

### 本轮最值钱的五条经验（都踩过）
1. **相机高度决定"平不平"**：`pitch 1.12 / dist 18` 是航拍模型视角，画面前 40% 全是脚下的土、
   一条水平边都看不见。改成 `1.26 / 9` 后地平线进画，近/中/远景才成立。
2. **地形要有高差**：广场是平地时，无论怎么打光都像沙盘。`terrainH()` 里加了一块
   位于 `(0, 27)` 的出生台地（3.2 米），玩家从高处俯看广场 —— 这一条比任何贴图都管用。
3. **`map` 会和 `color` 相乘**：`color:0x8f7f66` 乘土黄贴图 = 一条深褐色沟。
   带贴图的材质，`color` 要给亮色（当"曝光补偿"用）。
4. **`MeshBasicMaterial` 默认参与色调映射**：火苗给 `0xffb066` 会被 ACES 压成奶白圆锥。
   要不被压，得显式 `toneMapped:false`。
5. **贴地层的抬升要统一基准**：地形是 1.389 米格子插值的，格心 `terrainH` 真值可比三角面低十几厘米。
   分区地皮用 `cellTop()`（格子四角最高）+0.05，路面用"邻域最高"+0.16。
   两者不共用基准，就会互相切成碎片（现象：路面被浅色楔形盖掉一半）。

### 本轮新加的工具（都在 `dev/`）
- `_world_shot.py <x> <z> <pitch> <dist> <yaw> <out.png> [hud] [等秒] [fov] [PREJS]`
  机位截图。`PREJS` 是拍之前跑的一段 JS（例：`App.world.focusItem('木','plant')` 推镜头）。
- `_world_eval.py "<表达式>" [等秒]` 在 `#/world` 里跑 JS 回传 JSON（射线、包围盒、DOM 断言）。
- `_world_flow.py [前缀]` 一次跑完「探索 → 走近 → 点开面板 → 关掉继续」并逐帧截图，
  同时打印断言 JSON（`near` / `panel.text` / `goal` 里的 `认字 N/4`）。
  **这是唯一能证明流程没断的脚本**，改交互必跑。

### 已知未决（接着做从这几条挑）
1. 龟宝侧视：壳的进深仍偏浅（HH 0.30 / sz 1.16），45° 与正面读得清，正侧仍偏"背了个包"。
2. 各区的字碑只集中在**一处台地**（`clusters===1` 时压在区心），所以一个区里只有一组字，
   走位路线偏单一；理想是按"几组台地"散布到 20~40 米环上。
3. 树、灌木仍是"叠锥 / 双球"体块，近景能看出是程序生成的；要更真只能上模型资产。
4. 帧率未实机测（`tris` 约 134 K / 419 mesh）；低配与 WebGL 不可用的降级只有"球体替身"这一层。

---

## 7.14 第二关「浮空骨片」+ 第三关「守字之骨」原型（本轮）

### 一句话
同一套 3D 舞台里做出两个新关卡：`bone-space`（骨片空间 → 三个世界）与 `boss-3d`（三阶段 Boss）。
两关共用 `stage3d` 的渲染/拾取/相机，数据仍走原有字形表（`App.glyphs.parts` 73 字 / `App.worldGlyph`）。

### 新增文件
| 文件 | 行数 | 职责 |
|---|---|---|
| `js/world/stage3d.js` | ~470 | 舞台工厂。`App.stage3d.create(host, opt, cb)` → `{ renderer, scene, camera, root, lights, flyTo, orbit, orbitTo, onPick, raycast, dispose }`；另有 `boneTex / bonePlateGeo / makeGuibao / canvas / tex / rnd / ease` |
| `js/world/bonespace.js` | ~950 | 第二关。三个场景构建器 `buildSpace / buildNature / buildBronze`，各返回 `{ name, update, dispose }`；`goScene(name)` 做过场切换 |
| `js/world/boss3d.js` | ~1010 | 第三关。`makeBoss / startPhase1 / startPhase2 / startPhase3 / win / restart`，`App.boss3d._S` 可断言 |

### 关卡顺序 = 注册顺序（`index.html` 脚本顺序）
`modes.playable()` 就是 `registry` 的注册顺序，**没有 sort**。
`bonespace.js` / `boss3d.js` 一度写在 `bone-build.js` 前面，结果第一关变成 03 卡、
导语还说"第 02 关沿王邑实物找字"。现在固定为：
```html
<script src="js/modes/bone-build.js">
<script src="js/world/bonespace.js">
<script src="js/world/boss3d.js">
```
另外 `LV_SPEC`（`js/core/shell.js`）按 id 给卡片配展台字形，**漏了 id 就是一块空骨版**：
`bone-space`（char `龜`）、`boss-3d`（char `泉`）已补上；`isBoss` 也要同时认 `boss-3d`。

### 本轮最值钱的六条经验（都踩过）

1. **`position:fixed` 会被祖先的 `transform` 变成"相对祖先定位"**。
   `.scene` 一脉有 motion 加的 transform，`fixed; inset:0` 只拿到半屏，下半露出首页页脚。
   → 关卡的 root 一律 `document.body.appendChild()`，并给 body 加 `xxx-lock{overflow:hidden}`。

2. **各场景往 `scene` 直接加的灯不会随 `root` 一起清掉**。
   只清 `st.root` 的话，从骨片空间进草木川泽，上一场那三盏 12/9/7 的点光还亮着，
   草地和树被多打一遍光 —— 看起来像"过曝 / 磨砂塑料"，其实是灯没走。
   → `clearScene()` 除 `root` 外，还要按白名单保留 `hemi/sun/fill`，其余 scene 子节点全清。
   （天穹、远山、星点、青铜射灯都挂 scene，一起清。）

3. **构造参数被每帧的"呼吸"函数覆盖**。
   `spot = new SpotLight(..., 13, ...)` 之后 `spotlightPulse()` 每帧写回 `38 + sin`，
   于是怎么调构造值都没反应（台座永远烧成白板）。
   → 呼吸函数的基准值必须与构造值同源，改一处要同时改另一处。

4. **`metalness` 高的材质在没有 `envMap` 的场景里等于黑色**。
   青铜鼎原来 `metalness 0.78`，渲出来是一团黑剪影，只看得见被射灯打亮的白边。
   → 原型不引入 HDR：`metalness 0.36 / roughness 0.52`，让漫反射把绿锈色说出来；
   再补一盏很弱的正面冷光（2.2）给腹部轮廓。

5. **天穹渐变要按"机位能看到哪一段 uv"来排点**。
   平视机位只覆盖球面 uv 0.42~0.52，三色渐变（0 / 0.5 / 1）的中段整条都是灰，
   怎么改颜色都不像黄昏。→ `skyDome()` 支持传 `[[pos,color],...]` 自己排点，
   把"深蓝 → 落日"压进这 0.1 的范围里。

6. **低多边形场景不要硬上投影**。
   阴影相机默认 ±14 米，林线在 13~40 米：圈内几棵树投下又长又硬的影子、圈外一棵没有，
   草地上一道长黑条（截图左下角那块"黑斑"就是它）。放大阴影相机只是把黑条铺得更满。
   → 草木川泽 `sun.castShadow = false`，回骨片空间再开回来。

### 验证（`dev/_bsp_probe.py`，CDP 真视口）
```
python dev/_bsp_probe.py "<js>" <out.png> [wait] [W] [H] [route]
```
注入 `__sleep / __stage / __clickWorld / __panel`。本轮实测断言：
- 第二关：`plates = ['龜->undefined','木->nature','鼎->bronze','日->wangyi']`；
  点「木」→ 面板 `骨片 · 自然场景 木 / 草木川泽 / 象木之形…` → 「进入场景」→ nature。
- 点「日」→ 面板「进入王邑」→ `location.hash = '#/world'`，王邑 HUD 正常，`bsp-root` 归零。
- 卸载重进：`body.class` 在 `bd3-lock / bsp-lock` 间正确切换，`canvas` 始终 1 个，无重复 root。
- 「再来一次」：面板关、`hp 100 / wrong 0 / phase 1`、Boss 重新入场。
- 青铜鼎：拖拽 `yaw 0.42 → -0.70`、`pitch 0.20 → 0.32`；滚轮 `radius 6.40 → 5.12`。

### 已知未做 / 已知不足
1. 骨片空间里「日」片直接跳 `#/world`（王邑是独立路由），从王邑回来要走浏览器后退；
   王邑左上角「回馆」仍回 `#/museum`（第一关的旧行为，未改）。
2. 草木川泽的草叶还是"盒子叶片"、溪水是一层半透明带，近景像插画而不像实景。
3. `boss-3d` 不做失败态：血条见底会回弹到 55，避免演示时卡死。
4. 阶段二目前 3 段笔画（「木」），没有做"任意顺序"以外的提示系统。

---

## 7.15 废弃旧玩法，只复用旧数据（本轮，**这是当前的真实状态**）

> 用户明确指令：**数据可以继承，玩法不能继承。**
> 只保留：甲骨文字数据、今字对应、释义、构件、笔画/结构、有据可查的文献、字体纹理模型素材、龟宝形象。
> 必须废弃：原地图玩法、王邑设定、旧地图探索逻辑、区域导航、旧关卡交互、旧玩法流程。

### 7.15.1 现在的三个关卡（模式列表顺序 = `index.html` 脚本注册顺序）

| # | mode id | 名字 | 玩法 | 文件 |
|---|---------|------|------|------|
| 01 | `bone-build` | 甲骨构字 | 构件拼字（**未改动**） | `js/modes/bone-build.js` |
| 02 | `bone-float` | 骨片浮空 | 六片骨漂浮 → 点开 → 放大 → 字呈现 → 实物显现 → 收回 | `js/world/bone-float.js` |
| 03 | `boss-3d` | 守字之骨 | 三阶段 Boss：构件 / 笔画 / 古句 | `js/world/boss3d.js` |

已撤下（`status:'hidden'`，文件仍加载但不进列表、不参与玩法）：
`wangyi-world`、`wangyi-map`、`boss-raid`。
`bonespace.js`（旧的"切场景版"第二关）**不再被 index.html 加载**，只留作历史，
文件在 `js/world/bonespace.js`，备份在 `_backup/bonespace_v1_scene-switch.js`。

### 7.15.2 新第二关的六个字（`PLATES`，只做分类，不对应任何旧区域）

`山 / 水 / 木 / 日 / 目 / 鼎`，每片有 `now`（今字）、`gloss`（释义）、
`link`（字形与实物怎么对上）、`make`（景物生成器）。
`日`、`目` 带 `fade` 字段：这两片的景物发光太强，骨片要退到 0.30 / 0.62 才不会和太阳、
眼睛糊成一块米黄。

状态机 `idle → focus → unveil → show → close → idle`，看门狗 `GUARD = {focus:6, unveil:6, show:Infinity, close:6}`。
对外 `App.bonefloat = { _S, PLATES, focusAt(i), dismiss(), reset() }`。

### 7.15.3 本轮踩到的坑（每条都花了一轮以上）

1. **`status` 只认 `'ready'`。** 写成 `'playable'` 会被壳层打成「筹备中」，卡片点不进去。
2. **`LV_SPEC`（`js/core/shell.js`）按 mode id 配展台字形。** 漏配 = 卡片中间一块空骨板。
3. **暗场里 `metalness > 0` = 一条消不掉的假高光。** 场景没有 envMap，金属反射只剩点光/平行光，
   表现成物体侧面一条贯穿上下的白亮线。排查走过的弯路：改几何、改 z-fighting、染色、flatShading、
   关掉物件自己的点光 —— 全都不动。最后用 `gl.readPixels` 逐像素测亮度 + 逐个隐藏物体才定位：
   关掉**场景所有灯**换纯环境光，白条立刻消失；`metalness 0.16→0`、`roughness →1`，
   亮度从 211 掉到 177（腹面 172）。**结论：暗场里金属度归零，青铜色靠漫反射 + 一点自发光说。**
4. **`CylinderGeometry(r, r, h, 4, 1)` 不是方柱。** 它是四段圆弧拼的，法线沿圆周插值，
   每个平面被渲成一段微曲面。真方鼎就是箱子，用 `BoxGeometry` 才对。
5. **口沿不能是一整块实心 Box。** 顶面和下面那块"口内"压暗面共面 → 一圈锯齿阶梯，
   而且实心板把口内面完全包住，等于白做。拆成四条窄板围一圈，口才是通的。
6. **半透明水带靠"加自发光"是救不回来的。** 自发光 0.80 + 几乎全透 = 自带背光，
   灯光照不出任何明暗，渲出来是一张青纸。正解是程序化贴图：横向中间实、两侧透明（水才有边），
   纵向十几道流线（才有流动感），上下两端擦淡（才不像矩形色块），自发光压到 0.22。
7. **侧流平面是负担。** 在主流两侧各挂一条 0.22 宽的半透明面，出来是两根淡蓝的"棍"。
   水要靠主流自己的宽度渐变（上窄下宽）和纹理说话，硬加平面只会多两块纸板。
8. **`HOWTO`（玩法说明页）按 mode id 配步骤。** 新关不补 = 说明页该关下面是空白。
9. **「后续玩法」一节原来按 `status !== 'ready'` 过滤**，会把已撤下的旧玩法（王邑图卷、构件讨伐）
   当"即将上线"列出来。改成 `status !== 'ready' && status !== 'hidden'`。
10. **两关出口要对齐。** `boss-3d` 的「← 回馆」原来写死 `#/modes`，`bone-float` 回的是 `#/museum`；
    从第三关出来会落到一张关卡列表上。现在两关都回 `#/museum`。

### 7.15.4 实测（CDP 真视口探针 `dev/_bsp_probe.py`，全部走真实 DOM 点击，不走直连 URL）

```
起点 #/museum chips=6
点「骨片浮空」入口 -> #/play/bone-float | bsp-lock=true | mode=idle
点第一片骨 -> show | 知识卡「山 / 今字 山 / 自然 / 三座山峰并立…」
点「收回」-> idle | prop 已清
点「← 回馆」-> #/museum
六片逐片验证（严格轮询，不连点）：山 / 水 / 木 / 日 / 目 / 鼎 全部进入 show，
  「收回」后全部回到 idle 且 prop 引用清空（鼎的 root 下有 19 个子物体，其余景物
   都收在 root > inner 里，所以按 root.children 数个数没有意义）
点「守字之骨」入口 -> #/play/boss-3d | phase=1 | canvas=1
阶段一 拆「石」「水」-> phase 2
阶段二 断 3 段 -> phase 3
阶段三 填「说」「知」「师」-> phase 9（胜利面板：27s / 0 失误 / S 评级）
胜利面板「回馆」-> #/museum
玩法说明页：三关各 5 步，后续玩法为空，无王邑/图卷/点位字样
```

### 7.15.5 还没做的

1. `山`/`木`/`日`/`目` 四个景物还没有做和「水」「鼎」同等的质感打磨
   （山是三片纸板三角 + 深绿侧面，木是三冠球，日/目没细看）。
2. 阶段三只有 3 句《论语》，没有错题回顾；失败态仍不做（血条见底回弹）。
3. 第二关六片骨的「全部看完」没有通关结算，只是回到 `idle`。
4. `bonespace.js` / `wangyi-map.js` / `boss-raid.js` 三个旧文件还在仓库里当历史，
   没有物理删除（按用户要求"旧代码可留在旧文件中作历史"）。

---

## 7.16 龟宝换成 2D 立牌（本轮）

> 用户原话：「把你那个啥子龟宝改成2d形象」。

### 7.16.1 问题

第一关和博物馆里的龟宝一直是 `assets/guibao-front.png` 这张手绘立绘（`<img>`，2D）。
但第二、三关的 3D 场景里，`App.stage3d.makeGuibao()` 调的是 `App.guibao.build()`
——用几何现搭的一只立体龟（`js/world/guibao.js`，651 行）。

那东西在暗场里没有任何材质细节：远看一团白，眼睛、围巾、背包、胸前的骨片吊坠
全糊成一片，跟首页那张立绘完全不像同一只龟。全站出现「首页一只、关卡里另一只」。

### 7.16.2 做法

`js/world/stage3d.js` 的 `makeGuibao()` 改成返回**2D 立牌**，贴的就是同一张立绘：

| 点 | 处理 |
|----|------|
| 朝向 | `PlaneGeometry` + 每帧 `onBeforeRender` 里只绕 **Y 轴**转向相机（standing billboard）。<br>**不用 `THREE.Sprite`**：Sprite 是全轴朝向，相机俯拍时立牌会跟着往后仰，像一张飘在空中的贴纸 |
| 父级旋转补偿 | 相机位置先用 `parent.matrixWorld` 求逆转到局部空间再算 `atan2`，这样 `gb.root.rotation.y = 0.42` 之类不会把立牌带歪 |
| 材质 | `MeshBasicMaterial`（不受灯光染色，立绘颜色才准）+ `toneMapped:false` |
| 乘色 | `0xf2eef8`（可被 `opt.tint` 覆盖）。压到 `0xcfc9dd` 那档绿龟会变灰龟 |
| 裁图 | 立绘 555×626，**内容只到第 600 行**，最底 26px 是原图自带的一圈白色笔触。<br>在白底页面上看不见，放到深色石台上就是一圈白烟。加载后用 canvas 裁掉 |
| 接地 | 锚点在底边中心，`position` 就是脚底那一点。再加一层椭圆软影（程序化径向渐变），否则立牌会浮起来 |
| 降级 | 贴图加载失败 → 退回原来的 `App.guibao.build()` 立体龟，绝不让龟宝凭空消失 |
| 接口 | `{ root, card, shadow, is2D, update, setMode, clearMode, metrics }`，与原 3D 版兼容（调用方只用 `root` 的 position/rotation/userData 和 `update()`） |

`update()` 只动 `card`，**绝不动 `root.position.y`** —— `boss3d` 的胜利动画自己掌控
`root.position.y` 做跳跃，碰了就打架。

### 7.16.3 连带修的三处

1. **第二关龟宝沉进石台**：`bone-float.js` 原来把龟宝摆在 `y = -2.24`，
   而踏石顶面实测在 `-2.094`（射线打出来的）。立体龟只是小腿埋进去看不出来，
   2D 立牌就是整截脚被切掉。改到 `-2.094`。
2. **龟宝太小**：`scale 0.92` 是给立体龟定的（那模型只有 0.909 高）。
   2D 立绘轮廓窄，同样高度在满屏骨片里只有五十来像素，认不出是只龟。放到 `1.18`。
3. **台词气泡压在龟宝身上**：`.bsp-hint` 原来是屏幕底部居中固定的一条
   ——那时立体龟才四十来像素、缩在左下角，压不着。龟宝长大后就糊在身上了。
   改成把龟宝头顶的世界坐标投影到屏幕，气泡跟着它走；
   `say()` 时量一次实际宽度、`card(true)` 时量一次知识卡右边缘，气泡据此左右夹取让位
   （都是切换时读一次布局，不进每帧）。

### 7.16.4 实测

```
从 #/museum 点「骨片浮空」→ mode=idle｜guibao.is2D=true
六片逐片：山/水/木/日/目/鼎 全部 show → 收回 → cardRight 归 0
点「← 回馆」→ #/museum
点「守字之骨」→ phase=1｜guibao.is2D=true
三阶段 → phase=9｜胜利面板
全路由（museum/modes/home/atlas/archive/howto/settings/三关）0 报错
窄屏 1024×680：龟宝完整可见，气泡挂在头顶不压人
```

### 7.16.5 状态

- `js/world/guibao.js`（651 行立体龟）**仍保留**，只剩 `makeGuibao` 的加载失败兜底
  和已撤下的 `js/world/world3d.js` 还在引用它。它不是玩家可达路径。
- 改造前的 `stage3d.js` 备份在 `_backup/stage3d_before_guibao2d.js`。
- 2D 立牌没有逐帧动画（眨眼/说话），因为只有一张静态立绘。情绪靠整体变换表达：
  `cheer` 跳一下、`think` 微侧头、`talk` 缩放抖动、走动时上下颠 + 左右微摆。

---

## 7.17 甲骨文知识厅改成"甲骨学的陈列"（本轮，**当前状态**）

### 7.17.1 问题

环上那十二件骨版，原本是十二个常用字：日 月 雨 山 川 泉 木 林 牛 鱼 门 鼎，
`EXHIBITS` 里跟着王邑地图的五个景物分区（天象/山川/草木/禽兽虫鱼/人居器物）走，
展签只写「一轮圆日」这类释义。

这是**识字**的线，不是**甲骨学**的线：走完一圈认了十二个字，仍然不知道
甲骨从哪来、怎么卜、问什么、谁认出来的、怎么断代。一个甲骨科普展不该是这样。

### 7.17.2 现在的结构

新增数据文件 **`js/museum/oracle-hall.js`**（纯数据，无 DOM、无 THREE），
十二件骨版 = 十二个知识条目，按四段连续排开：

| 段 | 件 | 器物（环外 1.5m） | 主题 |
|---|---|---|---|
| 卜材 | 牛骨 · 灼兆 | 龟甲（285°） | 材料与整治、钻凿灼兆 |
| 卜辞 | 祭祀 · 征伐 · 农事 · 田猎 · 气象 | 青铜鼎（45°） | 商人问什么 |
| 文字 | 象形 · 会意 · 异体 | 刻刀（135°） | 字怎么造、怎么写 |
| 发现 | 龙骨 · 殷墟 | 卜辞拓片（225°） | 1899–1936 的研究史 |

- 每件骨版刻的字是**这条知识最自然的"字眼"**：「卜」本身就是兆纹，
  「車」的异体正好讲一字多形，「龍」通着"龙骨"这个旧名，「土」落在殷墟这片土上。
- 四件器物的角位从原来的 315/45/135/225（一个 X）改成按段归位，
  每段都是"两件骨版夹一件器物"（见 `museum3d.js` `PROP_R` 段的注释）。
- 台座名签右侧从分区名换成**两字短题**（卜骨/灼兆/祭祀/征伐/农事/田猎/气象/
  象形/会意/异体/龙骨/殷墟），不点开也知道这件讲什么。
- 墙上的段名从五组（天象…人居器物）改成四组（卜材/卜辞/文字/发现），
  起止**从展品数据现算**，不写死下标。
- 展签改写：主题 → 导语 → 中文序号分条 → **卜辞原辞**（朱砂竖线引文块，
  `.mu-b-quote`）→ 小注 → 字形数据出处。没有对应条目的字仍走旧的字卡。
- 导览清单的筛选键 = 四段（`ZONE_ORDER` 改成读数据文件），第二行是"段名 · 主题"。
- 拓片陈设上的四列字、标题墙副标题、2D 兜底展厅的十二格、龟宝的导览语，
  全部改成读同一份数据 —— 环上换陈列，这几处不会再各说各话。

### 7.17.3 坑（这几条都是这一轮踩的）

1. **字形必须是 `js/core/glyph-parts.json` 里有的字**。骨版上的字由
   `makeSlab(ch)` → `paintGlyph` 现画，数据集里没有的字会**静默**刻不出来。
   现有 73 字（日月雨水火山田木人大女子目耳口又止牛羊犬豕隹鱼禾屮宀门酉斤戈矢
   糸力贝舟卜土石川泉丘谷林竹米虎鹿虫足刀斧弓衣皿鼎缶玉井邑郭車舞龜馬龍鼓鳥爵彝尊絲象囗）。
2. **数据集里是繁体键**：`車`、`龍` 能取到字形，`车`、`龙` 取不到。
   所以条目带一个 `now` 字段（简体）给抬头用，`ch` 仍是繁体键给字形用 ——
   `panelHead(p, ch, sub, nowCh)` 为此加了第四个参数。
3. **数据文件漏加载会静默空掉整厅**：`EXHIBITS` 里留了旧的一份兜底，
   宁可少讲，也不要让厅里只剩台座。
4. **`#muSum` 的 `[hidden]` 被 `display:flex` 盖掉**：那个"今日所得"HUD 隐藏之后
   仍留下一个空的小方框，浮在展厅地面正中（截图里那颗黑方块）。
   补 `.mu-sum[hidden]{display:none}` 才真正收掉。

### 7.17.4 实测（CDP 真视口 `dev/_bsp_probe.py`）

- 1440×900 / 390×844 两档进厅截图，四个段名、十二块名签、器物都在位；
- 十二张展签逐个打开：标题、四条分条、卜辞引文、小注、字形编号全部有值；
- **真指针点击**（在画布上派发 pointerdown/up，先扫一遍 `cursor:pointer` 的可点区）：
  点 龍 →「龙骨：1899 年药铺里的甲骨」，点 林 →「会意：两棵树就是一片林」，
  点中庭石板 →「数字说甲骨」。拾取链路没断。

---

## 7.18 本轮（**当前状态**）：中央骨版换字 · 构件立起来 · 馆内古筝

### 7.18.1 序厅中央那块骨版改成"换着刻"

原来它一辈子刻着「卜」，一个展厅的中心只有一件东西，却永远同一个字 ——
第二次进来就没有可看的了。现在按 `HERO_CYCLE` 轮着刻十二个字，
铜牌跟着换一句话，点开就是**当前这个字**的展签。

`js/museum/museum3d.js`：

| 做法 | 为什么 |
|---|---|
| `HERO_CYCLE` 只收 `glyph-parts.json` 里有的 73 字（用 `.filter` + `glyphRec` 剔） | 骨面上的字是现画的，数据集里没有的字会**静默**刻不出来，宁可少轮几个 |
| `heroBase = App.museumTex.slabBase(...)` 只画一次骨面 | 换字只重刻字。骨面是 14 块色斑 + 几万个噪声点 + 裂纹，1024 上重画一次几十毫秒，切换时一眼看得见卡顿 |
| 骨面材质 `onBeforeCompile` 里挂 `uMapB` + `uMix`，把 `map_fragment` 的采样改成两张混合 | 同一块几何、只换刻辞，混起来就是"旧字化开、新字凝住"，没有硬切 |
| 每 6.4s 换一次，过渡 0.62s；换完 0.7s 后提前画下一张 | 过渡那一帧不抢时间；同时只留两张贴图，旧的 `dispose()` 掉 |
| 铜牌在**刻完**那一刻才换字 | 先换牌后刻字，中间半秒就是"牌上写日、骨上是卜" |
| 转台改成 `sin(t*0.18)*0.42` 的小幅摇摆 | 原来 0.05 rad/s 转一圈两分钟，大半时间骨版侧着，刻辞根本看不见 |
| `pickAt` 送 `{type:'hero', char}`；`museum.js` 用它开对应展签 | 点哪块骨就开哪个字，不再硬写 '卜' |

⚠ 换 three 版本时 `'vec4 sampledDiffuseColor = texture2D( map, vUv );'` 这段
（r149 的 `map_fragment`）可能匹配不到 —— 匹配不到会**退化成硬切**（字照样换），不会崩。

### 7.18.2 造字区：四块备选构件立起来

原来是平放的立方体，字贴在**顶面**。站在工作台前是偏低的角度，顶面几乎看不见，
四块挤在一起更认不出哪个是「日」哪个是「月」。

- `blockGeo`：`BoxGeometry(0.50, 0.66, 0.10)`，字在 **+z**（`BLK_FACE = 4`，BoxGeometry 的材质顺序是 +x -x +y -y +z -z）
- `compMtl`：画布按牌面比例 `256×338`；字先画在 128×128 小画布上再 `drawImage` 贴过去
  （`paintGlyph` 是按画布宽度百分比定位的，直接画在竖长画布上会偏到上半截）
- 台座 `PED_H = 0.72`、牌心 `BLK_Y = 0.72 + 0.66/2 = 1.05`
- 横屏一横排：`x = (i-1.5)*0.92`、`z = -0.60 - |i-1.5|*0.10`
  ⚠ **别再按 2.05 的半径绕工作台排**：台沿在 z≈-0.9，那样排出来的两侧会退到圆台后面，
  下半截连同台座都被台子吃掉（这一版就是这么踩到的）
- 竖屏 2×2 错开摆：前排 `x ±0.31, z -0.75`，后排 `x ±0.66, z -1.45` 且抬 0.08（正好坐在台面上）
  ⚠ 两排正对着摆（x 相同）时，前排那块立牌把后排整个挡住 —— 手机上只看得到两块
- 选中：抬起 0.20 + 正面材质 `emissive 0x4a3410`

### 7.18.3 选一个构件，正前方那块骨上立刻刻出来

`buildTap` → `work.recarve(cols, {boost: 1.45})`。三处配套：

1. `colLayout(cols, W, H, {boost})` 新增放大系数（造字区只有两三个字，按"成篇刻辞"的疏密排太小）
2. `bState.cut = 1` → tick 里让骨面 `emissive` 亮一下再退（0.5s），"刻在这儿了"
3. 与"拼成了"的 `bState.flash` 分两支，互不打架

### 7.18.4 馆里有古筝了

`js/museum/museum-audio.js` 原来只有现算的环境音垫（进馆时还会把 site 的 BGM `suspend` 掉），
走一圈像在机房。现在把站点那首 `assets/bgm-guzheng.mp3` 接进来：

- `<audio>` → `MediaElementSource` → `gain` → **同一个 master**（+ 一点混响）
  —— 开关、duck、dispose 都不用各写一份，也不会"关了声音还有曲子"
- `setOn(true)` → `bgmUp()`（2.4s 淡入，`BGM_VOL = 0.62`）；`setOn(false)` → `bgmDown()`
- 打 Boss 时 `duck()` 把曲子压到三成（战斗音乐有自己的旋律）
- `dispose()` 停曲子、`removeAttribute('src')` + `load()`，`ctx.close()` 后下次进馆重建
- 环境音垫顺手压一档：`padBase 0.30 → 0.24`、`noiseBase 0.05 → 0.045`
- **默认值改成跟随站点总开关**（读存档里的 `sound`，不是 `App.sound.on()`）
  ⚠ 进馆时 site 的 BGM 已经被 `suspend`，那一刻 `on()` 恒为 false，拿它当默认值等于"馆里永远默认静音"

实测：`bgmDur 85.1s / bgmReady 4`（文件读得进来）；
`ctx.state` 在无手势的自动化里恒为 `suspended`（浏览器策略），真机上第一次点击即起。

### 7.18.5 实测

- 序厅 1440×900 / 390×844：`hero()` 依次 卜→日→月→雨…，`mapId` 每次都变，铜牌与骨面一致
- 点骨版：`panelTitle` = 当前字，副题「中央展品 · 骨版上的一个字」，0 报错
- 造字区 1440×900：点「日」→ 骨上刻出放大后的日、立牌抬起发亮、HUD 1/2、龟宝说话；
  点第二块「月」→ 成字「明」、集章 1/5、讲解卡弹出
- 造字区 390×844：四块立牌全部在屏内、四个字都看得清
- `dev/_syntax_probe.js` / `dev/_verify_deploy.js` 全绿（75 个引用可命中）

---

## 7.19 本轮（**当前状态**）：馆内古筝终于出声 · 打散小怪后点不到字

### 7.19.1 古筝没声：接错了路由（本轮最重要的坑）

`museum-audio.js` 第一版把古筝接成
`<audio>` → `createMediaElementSource` → `gain` → `master` → destination。
表现是：`ctx.state = running`、`readyState 4`、`bgmGain 0.62`、文件时长 85.1s，
**一个音都没有，也不报错**。

原因 `js/core/audio.js` 顶部第 10–16 行早就写死了：这站要能在 `file://` 下双击就跑，
那时 origin 是 opaque，媒体被判跨源 tainted，**一旦 `createMediaElementSource`
接进 AudioContext，输出恒为 0**。站点自己的 BGM 为此才一直只用 `el.volume`。

改法（`js/museum/museum-audio.js`）：

| 项 | 现在的做法 |
|---|---|
| 路由 | 古筝**不接 Web Audio**，只有 `<audio>` 一个元素；音量用 `el.volume` |
| 淡入淡出 | `el.volume` 没有 ramp，`bgmFadeTo()` 每 30ms 插值一步（2.4s 淡入 / 0.6s 淡出后 pause） |
| 音量 | `BGM_VOL = 0.17`（文件 RMS 0.103 ≈ -35dBFS，关卡那档是 0.13） |
| 起播兜底 | `kickBgm()`：只要"该响却没响"（`A.bgmWant && el.paused`）就每 0.7s 再 `play()`，最多 20 次 |
| duck | 打 Boss 时 `el.volume → 0.17 × 0.28`（古筝不归 master，得单独压） |
| dispose | 淡出 → pause → `removeAttribute('src') + load()` |
| 存档键 | `museumaudio` → **`museumaudio2`**：上一代把它关过的人存档里是 false，而那一代根本没声，换键让他们重新跟上站点开关 |

⚠ **"接进 Web Audio 才有混响/能过压缩器"这个念头不要再有**。这条站点的硬约束优先级更高：
宁可没有混响，也不能没声。要混响只能在能起 `AudioContext` 且媒体不跨源时另说。

实测（headless + `--autoplay-policy=no-user-gesture-required`）：
`bgm: playing`、`bgmVol 0.17`、`bgmT 2.72 → 4.41`（在推进）、`ctx running`。
默认 headless 下会 `bgmBlocked: true`（浏览器策略），这是环境问题，不是代码问题。

### 7.19.2 打散守阵兽之后，中间点不到字

`summonPhase()` 给每只守阵兽配了一个**隐形点击球**
（`SphereGeometry(1.1)`、`opacity 0`、`pickable = true`，局部 `(0, 0.55, 0.06)`，
法阵在 `z = 5.55` —— 比四片构件骨 `z = 4.2` 还靠近相机）。
守阵兽被打散后代码只写了 `S.guardHit.visible = false`。

**three 的 `Raycaster` 不看 `visible`**（`intersectObject` 只测 layers）。
于是那只球仍在射线里、仍在最前面、仍带 `pickable`：`stage3d.onUp` 把它交给
`boss3d.onPick`，它没有 `tag` / `strokeIndex`，所有分支都不匹配 →
**静默什么都不做**。表现就是"打完小怪，中间那一片点不动"。

三处一起改：

1. `stage3d.js` 的 `raycast()` 自己筛：`visibleChain()` 检查物体自身与全部祖先，
   有 `visible === false` 的一律剔出命中表（治根，任何"藏起来的遮挡物"都不会再吃点击）。
2. `stage3d.js` 的 `onUp()` 把命中链上**所有** pickable 收成 `alts`（由近到远）交给 `pickFn`，
   `obj` 仍是最前面那个（向后兼容）。只给第一个的话，玩法层根本不知道后面还压着东西。
3. `boss3d.js`：`killGuard()` 里把球从场景**摘掉**（`parent.remove`），
   `onPick()` 改成在 `alts` 里从近到远找"本阶段真正该点的那个"（跳过 `userData.guard`）。

实测：进关 → 点三下打散骨甲虫（`hp 3→0`、`hitBall: removed`）→ 点「水」
（`need = 水石`）→ `phaseData.got` 0 → 1，HUD 走 1/2。修复前这一步是死点。

### 7.19.3 顺手

- `dev/_bsp_probe.py` 加 `PROBE_AUTOPLAY=1` 环境变量（只在验音频时放开自动播放策略），
  默认行为不变。
- 版本号：`stage3d / boss3d / museum-audio` → `20261101-11`。
