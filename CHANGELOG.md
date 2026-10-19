# Changelog

## 1.0.5 — 2026-10-19

### 文档纠错（无功能改动 · documentation-only）

本次为**纯文档与元数据修正，`lib/*.js` 一个字节都没动**（与 1.0.4 逐字节一致）。
修的是「文档说的」与「代码做的」不一致，其中第 1 条属于**插件定性完全错误**。

| # | 位置 | 原写法 | 改成什么 | 代码取证 |
|---|---|---|---|---|
| ① | `locale/zh.json:3-4` | title「轻量抓取」/ description「抓取任意网页，把干净的正文交给模型，而不是原始 HTML。」 | title「学术文献检索与下载」/ description 明确为「学术文献检索与 PDF 下载：按 DOI 或关键词查文献（Crossref/OpenAlex），遍历 Sci-Hub 镜像下载 PDF 并以 Unpaywall 开放获取兜底，生成批量获取清单。**不是网页正文抓取工具**。」 | 插件只有 3 个工具：`search_papers`（`lib/index.js:202`）、`download_papers`（`:317`）、`generate_manifest`（`:460`）；`grep -rn "readability\|cheerio\|innerText\|textContent\|stripTags\|正文\|extractText" lib/` → **0 命中**。原描述与 `package.json` 自相矛盾。 |
| ② | `locale/en.json:3-4` | title「Lit Fetch」/ description「Fetch any web page and hand the model clean, readable text instead of raw HTML.」 | title「Literature Search & Fetch」/ description 明确为学术检索+PDF 下载，并补一句「Not a web-page text extractor.」 | 同上，0 处正文提取代码。 |
| ③ | `README-zh.md`（全文 33 行） | 空壳：6 个章节全是「本节内容详见 [English README](./README.md)」 | **重写为真正的中文 README**：三个工具逐个说明、下载流程 6 步、5 种状态枚举、文件名规则、宿主路由、已知限制、技术参数速查表 | 全部条目均从 `lib/index.js` 逐行取证（`SCIHUB_DOMAINS` 8 域名、`PAGE_TIMEOUT=25s`、`PDF_READ_TIMEOUT=180s`、`concurrency` 夹紧 1~8、`%PDF-`+3000 字节校验、`.part`→`rename`、`_lit_fetch_report.json`、Unpaywall `best_oa_location` 优先）。旧版 CHANGELOG 1.0.4 声称「新增 README-zh.md 中文说明」，实际是空壳。 |
| ④ | `README-es.md:3` / `README-pt.md:3` / `README-hi.md:3` | 同一句错误 slogan「Fetch any web page and hand the model clean, readable text instead of raw HTML.」 | 各自语言写成「学术文献检索与 PDF 下载」并明确「不是网页正文抓取工具 / 不是提取器」 | 与 ① ② 同源取证：0 处正文提取代码。 |
| ⑤ | `README.md:54` | 「解析 iframe/embed 提取 PDF 直链，**流式下载**并校验 `%PDF` 魔数。」 | 「解析出 PDF 直链后，把整个 PDF **完整下载到内存**、校验 `%PDF-` 魔数与体积，通过后写 `.part` 再原子 `rename`」 | `lib/index.js:102` 是 `const buffer = Buffer.from(await resp.arrayBuffer())` —— 全量读进内存；`:112-115` 先写 `.part` 再 `rename`。`grep -rn "ReadableStream\|createWriteStream\|pipe(\|for await" lib/` → **0 命中**，根本没有流式路径。 |
| ⑥ | `README.md:82` | 「**流式下载** + 原子落盘（`.part` → rename）/ Streaming download with atomic rename」 | 「下载先写 `.part` 临时文件，校验通过后 `rename` 成正式文件名（原子改名，避免留下半截 PDF）/ Writes a `.part` temp file, then renames it into place」 | 同 ⑤，全量 buffer，无流。 |
| ⑦ | `README.md`（新增章节） | 无 | 新增「⚠️ 状态枚举的差异（重要）」章节 | `generate_manifest` 的 `generateHtmlManifest` 只认 `'ok'`（`:159-160` → 绿色「✓已下载」）与 `'failed'`（`:161-162` → 橙色「✗需手动」），其余走 `:163` 的灰色「—」；而 `download_papers` 实际产出 `ok` / `scihub-fail`(`:424`) / `oa-fail`(`:436`) / `closed-access`(`:438`) / `no-doi`(`:412`)。把下载结果原样喂给 manifest，4 种失败态**全部落到灰色「—」而不会显示「✗需手动」**。 |
| ⑧ | `README.md` 已知限制 | 无实现层说明 | 补「PDF 全量读入内存，无流式/无断点续传/无进度」「`Content-Length` 读了但未参与任何判断」 | `:101` `const total = parseInt(resp.headers.get('Content-Length')...)` 声明后从未被读取（死变量）；`:29` `PDF_CONNECT_TIMEOUT` 是死常量（全文件仅此一处出现）。 |
| ⑨ | `package.json:27` `description` | 「DSH literature fetcher: search academic papers via DOI, download PDFs through Sci-Hub mirrors and Open Access fallback, generate batch access HTML manifests.」 | 中英双语，明确「学术文献检索与 PDF 下载」+ 关键技术事实（8 镜像、`%PDF-` 魔数、最小体积、清单），并显式声明「不是网页正文抓取工具 / Not a web-page text extractor」 | 见 ① 的取证；原描述未写错但**没写清「不是什么」**，无法阻止用户按「网页抓取」去理解。 |
| ⑩ | `package.json:3` `version` | `1.0.4` | `1.0.5` | — |
| ⑪ | `README.md`（本次核验中新发现，原文档**从未提及**） | 无任何说明，读者会以为「一篇论文 = 一条结果」 | 补「Sci-Hub 失败但 OA 成功时同一篇会留下**两条**记录（`scihub-fail` + `ok`），`results.length` 可能大于论文篇数，`summary.failed` 按记录条数算」 | `lib/index.js:424` 先 `results.push({status:'scihub-fail'})` 且**没有 continue**，随后 `:433` 兜底成功再 push 一条 `{status:'ok'}`；`:451` `const failed = results.length - downloaded` 按记录条数算，而 `:452` `summary.total` 取 `papers.length`（按篇数）——两者口径不同，`downloaded + failed` 会大于 `total`。 |

### 教训 · Lessons

- **插件定性写错，会让用户在错误的场景搜到它。** 这不是「文案不好看」的小事：`locale/*.json` 的
  `meta.title` / `meta.description` 是**插件管理器里唯一显示给用户的东西**，写成「轻量抓取 / 抓取任意网页」，
  用户想抓网页正文时会装它、装完发现根本没有这个能力，而真正需要查文献的用户**永远不会搜到它**。
  错误定性同时污染了 npm 页与 GitHub 页（同一句 slogan 被复制进 4 个 README），
  纠错成本随传播面线性放大 —— 所以「文案与能力对齐」必须当成功能缺陷来修，而不是当成美化。
- **CHANGELOG 会撒谎。** 1.0.4 写着「新增 README-zh.md 中文说明」，实际文件是 6 个「详见 English README」的空壳。
  交付类描述必须**打开文件核验**，不能凭"我建了这个文件"就写"我写了这份说明"。
- **「流式」是极易被顺手写上的词。** 一次 `arrayBuffer()` 全量读入，与流式完全相反（内存占用 = 文件大小），
  但两种实现对外表现一样（都产生了完整文件），只有读代码才分得清。性能类形容词必须落到代码行。
- **同一份数据被两个工具消费时，枚举必须对齐。** `download_papers` 产 5 种状态，
  `generate_manifest` 只认 2 种，剩下 3 种静默降级成无信息的中性灰 —— 用户看到「—」既不知道是成功还是失败。
  这类「静默降级」不会报错、不会崩，只会在用户信任里慢慢扣分。
- **「一条记录 = 一篇论文」是没写下来的假设。** Sci-Hub 失败后代码不 `continue`、而是先 push 一条失败记录再
  走兜底，兜底成功又 push 一条成功记录 —— 于是同一篇能出现两次。任何按 `results.length` 做的统计
  （`summary.failed`、`downloaded + failed === total` 的断言）都会算错。文档不写这一条，用户就会自己写出坏断言。
- 死代码（`Content-Length` 的 `total`、`PDF_CONNECT_TIMEOUT`）不影响运行，但会误导后来者以为「有大小预检」，
  文档里必须说清「这个值读了没用」，否则读文档的人会据此推断出并不存在的功能。

### English summary

Documentation- and metadata-only release; `lib/*.js` is byte-identical to 1.0.4.

- **Fixed the plugin's self-description, which was factually wrong.** `locale/zh.json` and `locale/en.json`
  described a "lightweight web page fetcher that hands the model clean body text". This plugin has exactly
  three tools — `search_papers`, `download_papers`, `generate_manifest` — and **zero** HTML-to-text code
  (`grep -rn "readability\|cheerio\|innerText\|textContent\|stripTags\|extractText" lib/` → no hits).
  Both locales now say "academic literature search & PDF download" and explicitly state it is **not** a
  web-page text extractor. The same wrong slogan was copied into `README-zh/es/pt/hi` and has been replaced.
- **Rewrote `README-zh.md`**, which was an empty shell (six sections all saying "see the English README")
  even though the 1.0.4 changelog claimed a Chinese guide had been added.
- **Removed the false "streaming download" claim** from `README.md`. The code does
  `Buffer.from(await resp.arrayBuffer())` (`lib/index.js:102`) — a full in-memory read followed by
  `.part` write + `rename` (`:112-115`). No `ReadableStream` / `createWriteStream` / `pipe` / `for await` anywhere.
- **Documented the status-enum mismatch**: `download_papers` emits `ok` / `scihub-fail` / `oa-fail` /
  `closed-access` / `no-doi`, but `generate_manifest` only recognises `ok` and `failed`; every other value
  renders as a neutral grey dash instead of the "needs manual retrieval" badge.
- `package.json` description rewritten bilingually (search + PDF download, explicitly "not a web-page text
  extractor"); version bumped to `1.0.5`.

---

## 1.0.4 — 2026-10-14

### 合规性改进（无功能改动）

本次为**纯元数据与文档改动，未触碰任何运行代码**（`lib/*.js` 与上一版逐字节一致）：

- **包元数据**：`engines.node` 对齐 DSH 运行时（`^22.19.0 || >=24.0.0`）；补 `packageManager`；`files` 白名单补上裸目录 `lib`、`locale/*.json`、`icon.svg` 与多语言 README；`exports` 补 `./locale/*.json` 与 `./icon`。
- **交付元数据**（官方插件契约要求）：新增 `locale/en.json` 与 `locale/zh.json`（含 `meta.title` / `meta.description`），新增 `icon.svg`（插件管理器显示用图标，不再显示裸 id）。
- **多语言文档**：新增 `README-zh.md` 中文说明；`README-es/pt/hi.md` 标题与主 README 对齐。

以上改动使插件通过官方 `dsh-plugin-dev check` 全部检查项（`P=12 F=0 W=0`）。

### Compliance improvements (no functional changes)

This release is **metadata and documentation only — no runtime code was touched** (`lib/*.js` is byte-identical to the previous version):

- **Package metadata**: `engines.node` aligned with the DSH runtime (`^22.19.0 || >=24.0.0`); `packageManager` added; `files` allowlist now includes the bare `lib` directory, `locale/*.json`, `icon.svg` and the multi-language READMEs; `exports` gained `./locale/*.json` and `./icon`.
- **Display metadata** (required by the official plugin contract): added `locale/en.json` and `locale/zh.json` with `meta.title` / `meta.description`, plus `icon.svg` so the plugin manager shows a real name and icon instead of a bare id.
- **Multi-language docs**: added `README-zh.md`; `README-es/pt/hi.md` headings aligned with the main README.

With these changes the packages pass every official `dsh-plugin-dev check` item (`P=12 F=0 W=0`).

---

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
