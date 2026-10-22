# 任务状态板

> 每完成一块改一行。状态：`待做` / `进行中` / `待验收` / `通过` / `打回`

| # | 任务 | 归属 | 交付物 | 状态 |
|---|---|---|---|---|
| 0 | 视觉方向定稿（A 为主 / B 穿插） | WorkBuddy | `01-design/direction.md` | **通过**（见 04-verify/report-20261022.md） |
| 1 | 设计 token 定稿 | WorkBuddy | `01-design/tokens-20261022.css` + `landing-report-20261022.md` | **待验收**：已在新基线落地（30 处，`_merge_tokens --check` 22 项 PASS，对比度 0 处不足 3） |
| 2 | 按钮/卡片/弹层统一 | GPT6luna（接手） | `css/ui.css` 改动 + 说明 | 待验收：WorkBuddy 已复核并补丁，见 `01-design/wb3-review-20261022.md`（骨架达标；`danger` 语义错位、四文件重复定义已收权、刻痕皮肤下筛选片漏网已补）|
| 3 | 首页纵深改造 | GPT6luna（接手） | `sceneHome` 当前结构 + `css/slab.css` + `01-design/home-structure-20261022.md` | 待验收：源码已对齐 A 方向；待 390px / 1280px 目视截图 |
| 4 | 三关展览式入口 | GPT6luna（接手） | `css/slab-modes.css` + `01-design/mode-exhibition-20261022.md` | 待验收：第二关对比与主次已修；待多视口目视检查 |
| 5 | 三关叙事文案 | GPT6luna | `02-copy/chapters.json` | **通过** |
| 6 | 龟宝三阶段台词 | GPT6luna | `02-copy/guibao.json` | **通过** |
| 7 | 首页文案 | GPT6luna | `02-copy/home.json` | **通过** |
| 8 | 视觉规范 + 素材清单 | GPT6luna | `02-copy/*.md` | **通过** |
| 9 | P0 收尾（阶段/斩笔） | DSH | `js/modes/boss-raid.js` | **通过**（代码挂载，未逐帧截图） |
| 10 | P1 刻字/裂纹 | DSH | `js/modes/bone-build.js` | **通过**（crack=1 / dasharray=999px） |
| 11 | P2 王邑薄雾/点灯 | DSH | `js/modes/wangyi-map.js` | **通过**（5 full → 2 off） |
| 12 | 进关过渡 | DSH | `js/core/motion.js` | 未做（远端已有 life.js 过渡） |
| 13 | 三方合并验收 | DSH | `04-verify/report-20261022-final.md` | **通过** |

| 14 | 文案接入页面（首页/三关/龟宝） | DSH | `js/core/shell.js` 等 | **通过** |
| 15 | 全站字体与 UI 风格 | WorkBuddy | `css/type.css`（重写）+ `css/theme.css` 墨族 + `01-design/system-20261022.md` | 待验收：四把嗓子（**楷题头** / 宋分区 / 黑正文 / 楷引文）、标题字重统一 400、小字下限 12px、默认皮肤改回纸面、手机首屏加纸遮罩。楷题头为用户 10-22 晚定案（"字再柔和点"） |

## 变更记录

| 日期 | 事项 | 说明 |
|---|---|---|
| 2026-10-22 | **默认皮肤从骨面改回纸面** | `direction.md` 2026-10-22 的定案是「整页是纸，深墨只用于弹层/拓片/结算」；`carved.css` 是之后加的整页骨面皮肤，默认开着时首屏被包成一块半透明面板、卡片正文 11px 压在骨纹上。现改为 `?carved=1` 才启用，`?carved=0` 仍回纸面（老链接不受影响）。骨面皮肤本身保留，等它自己那一轮清理（27 处 `!important`、49 处硬编码色）|
| 2026-10-22 | 字体层改为**最后加载** | `type.css` 从第 31 行移到样式表末尾。排版是最后一道工序，否则任何组件的 `font-size` 都能盖掉它——"改了字体没反应"就是这么来的 |

## 打回记录

| 日期 | 任务 | 原因 | 谁改 |
|---|---|---|---|
| 2026-10-22 | WB-2 令牌 | 未落地：theme.css 未替换、两处 data-theme 覆盖块仍在、field-notebook 221 处硬编码 | WorkBuddy |
| ↳ 处理 | WB-2 令牌 | **已结**：合并后重落（`_merge_tokens.py`）。field-notebook 整文件已下线（硬编码随之消失）；`theme.css` 的 data-theme 块已删，只剩 1 个 `:root`；色板 32 项 = tokens。详见 `01-design/landing-report-20261022.md` | WorkBuddy |

## 协作约定（避免互相覆盖）

1. **`index.html` 的 `?v=` 各改各的行**：DSH 只改 `juice.css` / `juice.js` / `audio.js` / 三个 mode 的行；
   WorkBuddy 只改 `theme.css` / `field-notebook.css` / `ui.css` / `modes.css` 的行。
   任何一方若需整文件重写，先在本文件记一行。
2. **变量名以 tokens 为准**：他人只 `var()` 引用，不新增同名变量；需要新变量先提在 `03-feedback/`。
3. **验收口径唯一**：只有 `04-verify/` 里带日期的报告算“通过”；
   脚本自检（如 `_land_tokens.py --check`）作为证据附在报告里，不单独下结论。
4. **未定义变量的排查结论**见 `03-feedback/var-audit.md`，不要重复查。
5. **`js/modes/*` 归 DSH**；如需改玩法逻辑，先在 STATUS 提，不直接动。
6. **皮肤层（`carved.css` 这类变体）不许用 `!important`**。
   变体一律加作用域前缀（`body.carved .x`，权重 0,2,0）就足够压过组件层（0,1,0）。
   一旦用 `!important`，后来的人再修 `.btn` 会**静默失效**——改了没反应、也查不出原因，
   这已经是本项目反复踩过的坑（见 `01-design/wb3-review-20261022.md` 第三节）。
7. **别人说"合了"要先验**：`git log --graph` 有 merge commit + `git merge-base --is-ancestor <提交> HEAD`。
   本仓库出现过用 `reset --hard` 代替合并、把对方落地提交吞掉的情况（只在 reflog 里）。
