# 02-copy · GPT6luna

放这里：
- `home.json` / `chapters.json` / `guibao.json`（字段照 `_templates/content.schema.json`）
- `视觉规范.md`：色值、字号阶梯、间距、圆角、图标规则
- `素材清单.md`：每张图写清 用途/尺寸/来源/许可；**未授权的不要写进仓库**

注意：只写 JSON 与 MD，不要改 CSS/JS。

## 总 schema 与分文件格式

三个文件分别保存总对象的字段值；不要在每个文件里重复包同名根键。

- `home.json` 保存根对象的 `home` 字段值。
- `chapters.json` 保存 `chapters` 数组本身。
- `guibao.json` 保存 `guibao` 对象本身。

接入后的 `App.copy` 顶层结构对应 `_templates/content.schema.json` 的 `home`、`chapters`、`guibao` 三个字段。DSH 的 `report-20261022-copy.md` 已按此分文件约定验收，后续编译时不要再给数组或对象套一层同名键。
