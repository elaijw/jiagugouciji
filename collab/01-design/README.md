# 01-design · WorkBuddy

放这里：
- `tokens-YYYYMMDD.css`：只含 `:root` 变量
- `home-structure-YYYYMMDD.md`：首页分区与纵深说明（前景/中景/远景各放什么）
- `shot-home-1280.png` / `shot-home-390.png`：改后截图

注意：与提案方向先对齐（浅色纸面 vs 深色考古），**D1 上午定稿后锁死**。

---

## 变更记录

**2026-10-22 · WB-1 + WB-2 交付**

- 新增 `direction.md`：方向定 **A 为主（浅色纸面）+ B 穿插（局部深墨块）**，已锁死。B 只用于弹层、图鉴/拓片详情、关卡结算三处，附四条红线。
- 新增 `tokens-20261022.css`：84 个 `:root` 变量，覆盖任务要求的八类。相对现状改了四条：`--ink-2` 提到 AA（4.40→4.60）、`--ink-soft` 降级为仅装饰、新增三级投影、**危险色与主操作拆开**（原来只差 18% 明度，几乎同色）。
- **影响页面**：本轮只交文件，**未落地、未改任何 `.css` / `index.html` / `js/`，站点画面零变化**。
- **未完成/受阻**：WB-3、WB-4 需要先裁决两件事——① 首页 DOM 由 `js/core/shell.js` 的 `sceneHome()` 生成，`index.html` 里没有首页 section，要动纵深刻度必须改 shell.js；② tokens 落地必须先删 `theme.css:209` 与 `field-notebook.css:5` 两个 `html[data-theme="bone"]` 块（权重压过 `:root`），而删块会让 221 处硬编码裸露，需与 DSH 排同一步做。

**2026-10-22 · 追加：落地指令 + 两处裁决结果**

- **裁决 ①（owner 12:12）**：首页 DOM 可以动。**授权范围：`js/core/shell.js` 的 `sceneHome()` 只改 DOM 结构，不碰玩法逻辑与数值。** 其余 `js/` 仍归 DSH。STATUS 第 3/4 行交付物据此更新。
- **裁决 ②**：tokens 落地**单独成一步**，不塞进 WB-3。指令见 `landing-20261022.md`，执行器 `dev/_land_tokens.py`（`--dry` / `--apply` / `--check` / `--revert`）。
- **本轮补的硬问题**：`--gold`(41 处)、`--line`(38)、`--sh-1/2`(16/11)、`--bone1/2`(4/5)、`--sh-3`(4) 共 **119 处引用**的变量只存在于 `theme.css` 主 `:root` 里，替换时若漏抄会整条失效且不报错。已在 tokens 加「兼容别名」段，`--check` 会逐条验。
- **仍未改动的文件**：`css/*`、`index.html`、`js/*` 全部零改动，本站点画面与 12:00 时完全一致。
