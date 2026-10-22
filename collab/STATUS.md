# 任务状态板

> 每完成一块改一行。状态：`待做` / `进行中` / `待验收` / `通过` / `打回`

| # | 任务 | 归属 | 交付物 | 状态 |
|---|---|---|---|---|
| 0 | 视觉方向定稿（A 为主 / B 穿插） | WorkBuddy | `01-design/direction.md` | **通过**（见 04-verify/report-20261022.md） |
| 1 | 设计 token 定稿 | WorkBuddy | `01-design/tokens-20261022.css` | **有条件通过**：交付合格，落地未做（去 data-theme 块 + 清 221 处硬编码） |
| 2 | 按钮/卡片/弹层统一 | WorkBuddy | `css/ui.css` 改动 + 说明 | 待做 |
| 3 | 首页纵深改造 | WorkBuddy | `js/core/shell.js`（`sceneHome` 结构，已获授权）+ `01-design/home-structure-*.md` | 待做 |
| 4 | 三关展览式入口 | WorkBuddy | `css/modes.css` + `01-design/` 说明 | 待做 |
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

## 打回记录

| 日期 | 任务 | 原因 | 谁改 |
|---|---|---|---|
| 2026-10-22 | WB-2 令牌 | 未落地：theme.css 未替换、两处 data-theme 覆盖块仍在、field-notebook 221 处硬编码 | WorkBuddy |

## 协作约定（避免互相覆盖）

1. **`index.html` 的 `?v=` 各改各的行**：DSH 只改 `juice.css` / `juice.js` / `audio.js` / 三个 mode 的行；
   WorkBuddy 只改 `theme.css` / `field-notebook.css` / `ui.css` / `modes.css` 的行。
   任何一方若需整文件重写，先在本文件记一行。
2. **变量名以 tokens 为准**：他人只 `var()` 引用，不新增同名变量；需要新变量先提在 `03-feedback/`。
3. **验收口径唯一**：只有 `04-verify/` 里带日期的报告算“通过”；
   脚本自检（如 `_land_tokens.py --check`）作为证据附在报告里，不单独下结论。
4. **未定义变量的排查结论**见 `03-feedback/var-audit.md`，不要重复查。
5. **`js/modes/*` 归 DSH**；如需改玩法逻辑，先在 STATUS 提，不直接动。
