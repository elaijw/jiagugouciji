# 变量审计（DSH → WorkBuddy 交接）

- 日期：2026-10-22
- 目的：避免两边重复排查 `var()` 定义缺失；结论可直接采信，也可复核。

## 一、结论

落地后，业务 CSS 里引用了 **85 个**变量；`theme.css` 的 `:root` 定义了 **102 个**。
按“是否在 `:root` 定义”粗筛，有 11 个不在 —— 但逐个查过后，**只有 1 个是真问题**。

## 二、11 个“未在 :root 定义”的变量

| 变量 | 实际定义位置 | 引用数 | 判断 |
|---|---|---|---|
| `--ink2` | `app.css` 本地 | 25 | ✅ 正常（本地作用域） |
| `--bone-texture` | `field-notebook.css` 本地 | 2 | ✅ |
| `--bone-mask` | `modes.css` 本地 | 2 | ✅ |
| `--bd-arena` | `modes.css` 本地 | 8 | ✅ |
| `--bd-arena-max` | `modes.css` 本地 | 1 | ✅ |
| `--btn-h` | `theme.css`（非 `:root` 段）+ `modes.css` | 1 | ✅ |
| `--codex-bone` | `ui.css` 本地 | 2 | ✅ |
| `--mark` | `ui.css` 本地 | 16 | ✅ |
| `--juice-shake` | `js/core/juice.js` 运行时写入 | 1 | ✅ 设计如此 |
| `--edge-strong` | 无定义，但**引用自带兜底** | 1 | ✅ 无影响 |
| **`--font-serif`** | **无定义，且 14 处引用只有 1 处带兜底** | **14** | ⚠️ **遗留问题** |

## 三、`--font-serif` 专项

- 引用分布：`modes.css` 13 处、`css/juice.css` 1 处（我的反馈层）。
- **落地前就没有定义**：`git show HEAD:css/theme.css` 与 `field-notebook.css` 都查不到该变量。
- 所以这是**历史遗留**，不是本次令牌替换造成的回归。
- 影响：这些 `font-family: var(--font-serif, …)` 多数会回落到继承字体或浏览器默认衬线；视觉上“该有书卷气的地方”可能用了系统默认字体。
- 建议（二选一）：
  1. 在 `theme.css` `:root` 补一条：`--font-serif: "Songti SC", "Noto Serif CJK SC", "SimSun", serif;`
  2. 明确接受回落，把 14 处改成显式字体栈，去掉这个悬空变量。

## 四、`--patina` 语义替换：安全

它的注释说“旧代码里 `--patina` 指骨上褐斑”。我独立统计：**全站 `var(--patina)` 引用 0 处**。
因此把语义换成 `#337663`（青铜绿）不会影响任何现有画面。褐斑如需保留，按它建议改名 `--speck`。

## 五、硬编码现状（落地后实测）

| 文件 | 十六进制数 |
|---|---|
| `field-notebook.css` | 188（落地前 221，已迁移 33 处） |
| `modes.css` | 207 |
| `theme.css` | 71 |
| `app.css` | 60 |
| `ui.css` | 58 |

> 结论：**画面短期仍主要由硬编码决定**。令牌生效的证据不能靠肉眼，要靠计算值。

## 六、验收建议（我已在 04-verify 采用）

```js
getComputedStyle(document.documentElement).getPropertyValue('--ink-2').trim()
// 落地前 '#61746b' → 落地后 '#5e7167'
```

并加两条：三模式控制台 0 报错、390/1280 截图无溢出。
