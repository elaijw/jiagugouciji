# 协作区（collab）

三个执行者共用这个目录交付成果。**代码在仓库根目录，成果与说明放这里。**

## 目录与归属

| 目录 | 谁写 | 放什么 |
|---|---|---|
| `01-design/` | WorkBuddy | 色板 token、组件样式、首页结构说明、桌面/移动截图 |
| `02-copy/` | GPT6luna | 文案 JSON、视觉规范、素材清单、验收话术 |
| `03-feedback/` | DSH | 反馈层接口说明、动效参数、变更记录 |
| `04-verify/` | DSH（所有人可读） | 每次验收的报告与截图，**以这里为准** |
| `_templates/` | 任何人只读 | schema 样例、报告模板 |

## 四条硬规矩

1. **一个文件只有一个主人**。不要改别人目录里的文件；要改，先在自己的 STATUS 里写一句，让对方改。
2. **颜色只引用变量**（`--ink-deep` / `--bone` / `--bronze` / `--patina`），不许在业务 CSS 里写死十六进制。
3. **文案只放 JSON**（`02-copy/*.json`），JS 里不许出现大段中文文案常量。
4. **每交付一块，在 `STATUS.md` 里改一行**（状态：待做 / 进行中 / 待验收 / 通过 / 打回）。

## 命名规范

```
01-design/tokens-YYYYMMDD.css        色板片段（只含 :root 变量）
01-design/home-structure-YYYYMMDD.md 首页结构说明
01-design/shot-home-1280.png         截图：shot-页面-宽度.png
02-copy/home.json                    首页文案
02-copy/chapters.json                三关文案
02-copy/guibao.json                  龟宝台词
03-feedback/api-YYYYMMDD.md          接口说明
04-verify/report-YYYYMMDD.md         验收报告
04-verify/shot-模式-宽度.png          验收截图
```

## 验收口径

- 只有 `04-verify/` 里的报告算“通过”；
- 报告必须含：控制台报错数、三模式能否进入、390px/1280px 截图、减动效与静音检查；
- 未通过项写进 `STATUS.md` 的“打回原因”，不口头传。
