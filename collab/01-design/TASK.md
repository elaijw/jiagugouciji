# 任务书 · WorkBuddy（视觉骨架）

> 先读 `collab/README.md`。你只写 `collab/01-design/` 和 `css/*.css`、`index.html` 的结构部分。
> 不要动 `js/`（反馈层由 DSH 负责）、不要动 `collab/02-copy/`。

## 背景

项目：《字趣·甲骨构字记》，静态站点，原生 JS，无构建。三个玩法：
甲骨构字（`js/modes/bone-build.js`）、殷商王邑（`js/modes/wangyi-map.js`）、构件讨伐（`js/modes/boss-raid.js`）。
现状：工作区里已有你未提交的浅色纸面换肤（`#f3f1e8` + `css/field-notebook.css`）。
另一份提案要的是「深色考古 + 青铜」。**两者方向相反，必须先定一个。**

## 任务

### WB-1 定方向（最高优先，D1 上午必须出结论）
二选一并写进 `collab/01-design/direction.md`：

- A：延续浅色纸面（现有 `field-notebook.css`），青铜只做强调色
- B：改为深色考古底（`--ink-deep:#202522`）+ 骨白纸面卡片 + 铜金主操作

判断标准（写清理由）：哪个更能承载「刻痕/拓片/灯火」三种质感；哪个改造成本低。
**定完就锁死，不再反复。**

### WB-2 设计 token
交付 `collab/01-design/tokens-YYYYMMDD.css`，**只含 `:root` 变量**，格式见 `collab/_templates/tokens.md`。
必须覆盖：背景/纸面/正文/次要文字/主操作/奖励/描边/危险。
要求：至少 8 个变量，且每个都写清用途注释。

### WB-3 三类组件统一（`css/ui.css`）
1. 主按钮（铜金实心）/ 次按钮（描边）/ 危险按钮
2. 卡片：文物展示型（方角）/ 说明型（圆角）/ 操作型
3. 弹层与提示条

要求：同一操作类型只有一种样式；不要每个按钮都加金色发光。

### WB-4 首页纵深（`index.html` 首页 section + `css/app.css`）
- 首屏只讲一件事：**开始探索**
- 三层纵深：前景甲骨碎片（低透明度）/ 中景标题与按钮 / 远景雾与山影
- 三关入口做成展览式（第二关视觉更突出），悬停展开故事一句话
交付说明 `collab/01-design/home-structure-YYYYMMDD.md`：写清每层放什么、用什么元素实现。

### WB-5 移动端与截图
390px 与 1280px 各截一张：`shot-home-1280.png`、`shot-home-390.png`。
检查：按钮不被遮、文字不重叠、横向无溢出。

## 约束
1. 不改任何玩法逻辑与数值（`js/modes/*` 只允许 DSH 改）
2. 颜色只引变量，业务 CSS 不许写死十六进制
3. 动效只用 `transform`/`opacity`；单次 ≤1.5s；尊重 `prefers-reduced-motion`
4. 不新增第三方依赖、不加构建步骤
5. 新增素材必须写来源与授权；未授权的图不要进仓库
6. 改过的 CSS/JS 记得同步 `index.html` 的 `?v=` 版本号

## 验收（DSH 跑，结果在 `collab/04-verify/`）
- 三模式可进、控制台 0 报错
- 390/1280 无溢出、按钮不被遮
- 业务 CSS 内 grep 不到硬编码色值
- 截图与实际页面一致

## 完成后
改 `collab/STATUS.md` 第 1–4 行状态，并在 `01-design/README.md` 末尾写一句「改了什么、影响哪些页面」。
