# 令牌落地报告（合并后重做）· 2026-10-22 12:5x

> 关的是 `STATUS.md` 里那条打回记录。
> 前一份 `landing-20261022.md` 是**合并前**写的执行单，其中「整段替换 `:root`」的做法已被本次推翻，以本文件为准。

## 一、为什么重做

12:38 的 `reset --hard merge/base` 把令牌落地 `2d2b4ff` 丢在 reflog 里了，`main` 上 `css/theme.css` 回到合并基线版（94 个变量）。同时合并基线已经被 DSH 改成「物件厚度」：

- 圆角从全 0 改为 `6 / 10 / 14 / 20 / 28`
- 新增 `--lip-hi / --lip-lo / --lip-hi-d / --lip-lo-d`（顶边受光 + 底边压暗）
- `--sh-1 / --sh-2` 从 `none` 改成真实两档投影

所以原来那套「把 tokens 的 `:root` 整段粘过去」会**连带把这五项抹掉**，画面立刻退回"网页表格"。本次改成外科式合并。

## 二、合并规则（一条红线）

| 类别 | 以谁为准 | 理由 |
|---|---|---|
| 色板：墨 / 骨 / 朱砂 / 青铜 / 铜绿 / 描边 / 深色面 | **tokens（01-design）** | 对比度是逐项算过的，tokens 是主人 |
| 几何与效果：`--r-*` `--sh-*` `--shadow` `--sh-overlay` `--lip-*` | **合并基线（DSH 侧）** | 已上线、已和骨片材质配平，数值比 tokens 更沉，换掉会掉物件感 |
| `--lift-1/2/3` | tokens 的名字，基线数值 | 做成 `var(--sh-1/2/3)` 别名，不另立第二把尺子 |
| `--sheet*` / `--glyph-rub` | 基线 | `--sheet*` 由 `--bone-*` 派生（别拍成死值才跟着走）；`--glyph-rub` 只在 `ui.css` 一处，留给 #2 一起改 |

## 三、实际改了 30 处

**色板 28 个值**（全部等于 `tokens-20261022.css`）：

```
--ink #29231e→#273a35        --ink-2 #6b6153→#5e7167     --ink-soft #6e6455→#7b8c81
--ink-deep #29231e→#243b35   --ink-deep-2 #352f28→#31544b --ink-deep-line #4a4238→#668177
--on-dark #f2e8d5→#fffaf0    --on-dark-2 / -3 提亮        --bone #f2e8d5→#f3f1e8
--bone-hi #faf5e9→#fffdf6    --bone-lo #e7dcc3→#e8e4d7    --bone-white #fffdf9→#fffefa
--cinnabar #a63e2f→#cc523b   --cinnabar-hi #bd4d38→#e3684b --cinnabar-tint #9b3324→#ae4936
--bronze #8c8066→#a58147     --bronze-hi #a79a7d→#c39c5f  --bronze-tint #6f6450→#80683f
--blue #3f5872→#527d91       --blue-tint #3f5872→#426c80  --glyph-line #524834→#4b5a4c
--bone1 #f4eee3→#eee9d9      --bone2 #e5ddcd→#ddd4bb      --edge #c2bcae→#d8d6c9
--edge-in #e4ded1→#ebe8dc    --green → var(--patina)      --green-tint → var(--patina-tint)
```

**语义搬家 1 处**：`--patina` 由「骨上褐斑 #b9a480」改指「铜绿 #337663」，褐斑改名 `--speck / --speck-2`。这条与 `atmos.css:501` 那处 `color-mix` 的修法对上了（那处已改成 `var(--speck, #b9a480)`，现在真值能取到）。

**新增 11 个**：`--patina / --patina-hi / --patina-tint`、`--speck / --speck-2`、`--solid / --solid-hi`、`--danger / --danger-hi / --danger-tint`、`--veil`、`--focus`、`--lift-1/2/3`。

**结构 1 处**：删除 `html[data-theme="bone"]` 块 —— 它是「`:root` 改了但画面纹丝不动」的源头（0,1,1 压 0,1,0）。现在 `theme.css` 只剩 1 个 `:root`。

## 四、证据

1. `dev/_merge_tokens.py --check`：**22 项全 PASS**（1 个 `:root` / 无 data-theme 块 / 32 个色值等于 tokens / 15 个新变量在位 / `--lip-*` 与 `--r-xl` 保留 / 所有 `var()` 有定义 / `?v=` 已升）
2. `dev/_contrast.py`：14 组配对，**0 处不足 3**。正文 10.65、次要 4.60、朱砂文字 4.88、铜绿文字 5.56、危险 7.29、白字压主操作 5.52、白字压危险 8.24（含 alpha 合成，不含则虚高）
3. 逐像素回归（改前 / 改后同视口同滚动高）：
   - 首页 1280×3587：**高度一模一样**，差异像素 46.45%，最大通道差 44（差异全在底色与朱砂，不是布局）
   - 讨伐 1280×1500：高度一致，差异 68.68%，最大通道差 44
   - 首页 390×6290：高度一致，差异 47.82%
4. 七个路由控制台 **ERRS []**：`/home` `/modes` `/atlas` `/settings` `/play/bone-build` `/play/boss-raid` `/play/wangyi-map`
5. 截图存 `_backup_20261022_merge/`（before/after/cmp-*）

## 五、观感结论

底色从暖米（`#f2e8d5`）走到中性骨白（`#f3f1e8`），R−B 差从 41 降到 11。骨材质（`--fiber`）仍在，暖意由材质承担、不由底色承担，所以不显冷；卡片与纸底的分离度反而更清楚（正文/卡面 11.84 比正文/纸底 10.65 高）。朱砂提亮一档后，主按钮从"砖红"变"朱"。

## 六、留给 #2（按钮/卡片/弹层统一）的活

1. `--solid` / `--danger` / `--focus` / `--veil` 目前**引用 0 处** —— 变量已就位，业务 CSS 还没接。危险按钮现在仍是 `color-mix(cinnabar 82%, #000)`，与主按钮亮度比 1.39，必须改。
2. `--ink-soft` 语义已降级为"仅装饰"，现存引用要逐个判：承载信息的换成 `--ink-2`。
3. `--lift-*` 与 `--sh-*` 同值两名，业务侧统一用 `--lift-*`（语义名），`--sh-*` 只留兼容。
4. `--glyph-rub` 仍是基线的浅值 `#e8dcc2`（`ui.css:523` 唯一一处），随组件改。
