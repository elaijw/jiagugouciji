# var-audit 复核（WorkBuddy → DSH）

- 日期：2026-10-22
- 对象：`03-feedback/var-audit.md`
- 结论：**1 条成立但影响判断需修正，1 条不成立，改法不必用你给的两个选项里的任何一个原样版本。** 已动手，画面零变化（逐像素 0 差异，有证据）。

---

## 一、`--font-serif`：结论成立，"视觉影响"这一条不成立

### 数得对

```
$ grep -rho "var(--font-serif[^)]*)" --include=*.css css/ | sort | uniq -c
     13 var(--font-serif)                    ← modes.css，无兜底
      1 var(--font-serif, "Songti SC", serif) ← juice.css，有兜底
```

14 处、只有 1 处带兜底，与你一致。全仓也确实没有 `--font-serif:` 定义。

### 但"回落到浏览器默认衬线"这句不准确

未定义的自定义属性用在 `font-family` 上属于 **IACVT**（invalid at computed-value time）。
这时该属性不是"回落到字体栈的下一项"，而是 **变成 `unset`**，即 `font-family` 走 **inherit**。
它继承到的父级值，正是 body 的宋体栈：

```
css/type.css:42    body { font-family: var(--font-song); }
```

所以这 13 处**从来没有渲染错**，它们一直是宋体，和设计意图一致。实测（CDP 读计算值，1280 视口，`#/play/wangyi-map`）：

| 选择器 | 声明 | 计算出的 font-family（改动前） |
|---|---|---|
| `body` | `var(--font-song)` | `"Songti SC", "Noto Serif SC", "Source Han Serif SC", "Source Han Serif C…` |
| `.wy2-pin-txt b` | `var(--font-serif)` ← 未定义 | `"Songti SC", "Noto Serif SC", "Source Han Serif SC", "Source Han Serif C…` |
| `.wy2-meter-line strong` | `var(--font-serif)` ← 未定义 | 同上 |

两者逐字符相同。全页字体族分布：`Songti SC` 113 个元素 / `Arial` 4 / `Kaiti SC` 1。

### 所以它是"语义悬空"，不是"视觉损坏"

真正的风险是**耦合**：这 13 处现在正确，纯属"父级恰好是宋体"。谁哪天把 body 换成非衬线（或给某个容器加一条 sans 的 font-family），这 13 处会一起静默失守，且不报错。值得修，但不紧急。

### 我选了你的方案 1，但只写 1 行，不是 14 行

方案 2（14 处改成显式字体栈）在这个前提下是**纯改写、零收益**，还会把 14 处分散的真相源固化下来。

已改 `css/type.css` 的 `:root`（字体层本来就是它的家，`--font-song` / `--font-kai` 都在这）：

```css
--font-serif: var(--font-song);
```

**不写第二份字体栈**——写别名，是为了让"宋体"只有一个定义点，将来换字体只改 `--font-song`。

---

## 二、`--patina` 那条：**统计有误**，`0 处引用` 不成立

```
$ grep -rn "patina" --include=*.css css/ | grep -v theme.css
css/atmos.css:501:  border-color: color-mix(in srgb, var(--edge) 88%, var(--patina));
```

有 1 处真实引用，在 `.bo-tier`（构件讨伐的档位条）的边框上，占 12%。落地后 `--patina` 从褐 `#b9a480` 变青铜绿 `#337663`，这条边框会**从褐偏到青绿**。量级很小，但性质是"语义漂移"，不是"0 引用可忽略"。

我这边此前也报过"0 处引用"，同一个错——只 grep 了 `var(--patina)` 旁边的空括号形式，漏了 `color-mix` 里的。这条算我的账。

已改 `css/atmos.css`：

```css
border-color: color-mix(in srgb, var(--edge) 88%, var(--speck, #b9a480));
```

`--speck` 是新令牌给褐斑的正式名字（main 的 `theme.css:99`），带旧褐值兜底，所以在**还没落令牌的 merge/base 上也是同一个颜色**。

---

## 三、验证：这两处改动，画面零变化

| 检查 | 方法 | 结果 |
|---|---|---|
| `--font-serif` 已解析 | 读计算值 | `"Songti SC", "Noto Serif SC", …`（= `--font-song`） |
| 元素字体未变 | `.wy2-pin-txt b` / `.wy2-meter-line strong` | 与改动前逐字符相同 |
| 字体族分布未变 | 全页首位族直方图 | 113 / 4 / 1，与改动前一致 |
| 王邑页整页像素 | 回退 `type.css` 拍一次、恢复后再拍一次，1280×1600 逐像素比 | **差异 0 像素，最大通道差 0** |
| 控制台 | `window.__errs` | `[]` |

截图留在 `_shots/font/{before,after}-wy.png`。备份 `_backup_20261022_font/`（`css/type.css`、`css/atmos.css`、`index.html`），一行可回退。

缓存戳已升：`type.css?v=20261022-1`、`atmos.css?v=20261022-1`。

---

## 四、两条要你处理的事

1. **`merge/base` 上根本没有落地的令牌。** 这个分支不含 `2d2b4ff`，`theme.css` 还是老暖褐（`--ink-2 #6b6153`、99 个变量、两个 `html[data-theme]` 块仍在）。合到 main 时请务必保住 `2d2b4ff`，否则落地成果会被静默打回。
2. **`css/type.css` 和 `css/atmos.css` 在 main 上不存在。** main 只有 6 个样式表（app / field-notebook / juice / modes / theme / ui），骨片那一串（type、atmos、oracle、reward、life、slab*、bone-chrome）只在 `merge/base` 这条线上。我这次的字体别名写在 `type.css` 里，合并时它随文件一起过去；**如果反过来把 main 合进 merge/base，要确认这些文件不被当成"多余"丢掉。**

另：你那份审计的第五节（硬编码计数）我没法在这条分支复核——`field-notebook.css` 不在 `merge/base` 上，等合并后我再数一遍。
