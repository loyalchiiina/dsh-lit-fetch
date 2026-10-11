# Changelog

## 1.0.3 — 2026-10-11

### Fixed · 修复

- **`/lit-fetch` 路由响应硬编码 `version: '1.0.0'`**：1.0.2 升版时漏改了这一行，
  package.json 是 1.0.2 而路由自查 1.0.0（纯展示性问题，功能不受影响）。
  修法：新增顶部常量 `PKG_VERSION`，用 `readFileSync(new URL('../package.json', import.meta.url))`
  **从 package.json 动态取值**，以后升版只改 package.json 一处，路由版本永不再漂移。
  · The `/lit-fetch` route hard-coded `version: '1.0.0'` (missed during the 1.0.2 bump).
  Now read dynamically from package.json via `PKG_VERSION`, so the route can never
  drift from the package version again.

## 1.0.2 — 2026-10-10

### Fixed · 修复

- **插件整体装载失败（致命）**：`parameters` 里可选参数写成了 `required: false`，但 DSH 的
  参数 schema 编译器只在 `required === true` 时才接受该键，`false` 直接抛
  `JsonSchemaError: unsupported JSON schema: parameters.limit.required must be true when present`。
  该异常发生在 `apply()` 内第一个 `defineTool()` 调用处，导致 **三个工具一个都没注册、
  webServer 路由也没挂上**，插件等于完全不可用。修法：可选参数直接省略 `required` 键
  （共 3 处：`search_papers.limit`、`download_papers.concurrency`、`generate_manifest.filename`）。
  · Plugin failed to load entirely: optional parameters were declared as `required: false`,
  which the DSH parameter-schema compiler rejects (it only accepts the key when it is `true`).
  The throw happened inside the first `defineTool()` call of `apply()`, so **none of the three
  tools were registered**. Fixed by omitting the `required` key on optional parameters.
- **`output.schema` 缺少 `additionalProperties`（致命）**：DSH 要求 `object` 类型的 schema
  必须显式声明 `additionalProperties: true|false`，否则抛
  `additionalProperties must be explicitly true or false`。三个工具的 output schema
  及其所有嵌套 object 已全部补成 `additionalProperties: false`
  （共 8 处：3 个根对象 + 5 个嵌套对象）。此问题在修掉上一条后才会暴露，属同一根因链。
  · `output.schema` objects now declare `additionalProperties: false` explicitly
  (8 places), as the compiler requires it on every `object` node.

### Changed · 变更

- `package.json`：`repository` 补成 `git+https://…` 规范形式，新增 `homepage` / `bugs` 字段
  —— 上游插件目录靠 `repository` 字段的**子串匹配**把 npm 包关联回 GitHub 仓库，字段不规范会让
  市场里的版本号与下载量整块空白。
  · Normalized `repository` and added `homepage` / `bugs` so the plugin directory can link
  the npm package back to this repository.
- `package.json`：声明 `@deepseek-ai/dsh-tools` 为 peer dependency（插件直接 `import { defineTool }`
  自它，此前未声明）。`files` 白名单加入 `CHANGELOG.md`。
  · Declared the previously-missing `@deepseek-ai/dsh-tools` peer dependency; added
  `CHANGELOG.md` to the `files` whitelist.
- `README.md`：补「功能总览 · At a glance」中英对照表与已知限制说明。
  · README gained a bilingual feature overview.

## 1.0.0 / 1.0.1 — 2026-10-09

- 首个版本：`search_papers`（Crossref DOI 精确查询 + OpenAlex 关键词检索）、
  `download_papers`（Sci-Hub 8 镜像 → Unpaywall 开放获取兜底，并发下载 + PDF 魔数校验）、
  `generate_manifest`（生成「批量获取入口.html」清单），以及 `/lit-fetch` 宿主路由。
- Initial release: three host-side tools plus a `/lit-fetch` web route.
