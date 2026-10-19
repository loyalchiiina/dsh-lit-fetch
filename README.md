# dsh-lit-fetch

DSH literature fetcher — search academic papers, download PDFs by DOI (Sci-Hub mirrors with Open Access fallback), and generate a batch-access HTML manifest.

DSH 文献获取插件 — 快捷搜索学术文献、通过 DOI 批量下载 PDF（Sci-Hub 镜像 + 开放获取兜底）、生成批量获取清单 HTML。

> **这不是网页正文抓取工具。** 插件不解析网页正文、不做 readability/HTML 转文本，只做三件事：
> 检索文献元数据、下载 PDF 文件、生成可点击的获取清单。
> **This is not a web-page text extractor.** No readability/HTML-to-text; only metadata search, PDF download, and manifest generation.

## 功能总览 · At a glance（中英对照 / Bilingual）

### 检索 / Search

| 中文 | English |
|---|---|
| `search_papers`：按 DOI 精确查询（Crossref `works/{doi}`） | `search_papers`: exact DOI lookup via Crossref |
| 按标题/关键词检索（OpenAlex `works?search=`，默认 5 条、最多 20 条） | Title/keyword search via OpenAlex (default 5, max 20) |
| 返回标题、作者、期刊、年份、DOI、官方链接 | Returns title, authors, journal, year, DOI and canonical link |
| DOI 判定规则：形如 `10.xxxx/...`（正则 `^\d+\.\d+\//`）才走 Crossref，否则走 OpenAlex | DOI detection: matches `^\d+\.\d+\//`, otherwise OpenAlex |
| 单次请求超时 15 秒；Crossref 失败自动降级为 OpenAlex 关键词检索 | 15 s per-request timeout; Crossref miss falls through to OpenAlex |

### 下载 / Download

| 中文 | English |
|---|---|
| `download_papers`：按 DOI 批量下载 PDF | `download_papers`: batch PDF download by DOI |
| Sci-Hub 优先：遍历 8 个镜像域名，用正则解析页面里的 iframe/embed 取 PDF 直链 | Sci-Hub first: walks 8 mirrors, resolves the PDF link from iframe/embed |
| 开放获取兜底：Unpaywall 查 OA 免费版本 | OA fallback: Unpaywall lookup for a free version |
| PDF 魔数校验（前 5 字节必须是 `%PDF-`）+ 最小体积校验（<3000 字节拒收） | Magic-byte check (first 5 bytes `%PDF-`) and minimum size (reject <3000 bytes) |
| 并发下载（默认 4，上限 8，下限 1） | Concurrent downloads (default 4, clamped to 1–8) |
| 落盘方式：**全量读入内存 → 先写 `<文件名>.pdf.part` → `rename` 原子改名**（非流式） | Write path: **buffer the whole response in memory → write `<name>.pdf.part` → `rename`** (not streaming) |
| 文件名：`<两位序号>_<清洗后标题>.pdf`，标题去除 `\ / : * ? " < > |` 与换行制表符，截断至 120 字符 | Filename: `<2-digit idx>_<cleaned title>.pdf`, strips `\ / : * ? " < > |` and CR/LF/tab, capped at 120 chars |
| 每篇返回状态：`ok` / `scihub-fail` / `oa-fail` / `closed-access` / `no-doi` | Per-paper status: `ok` / `scihub-fail` / `oa-fail` / `closed-access` / `no-doi` |
| 结果写入输出目录的 `_lit_fetch_report.json`（内容是结果数组，不是汇总对象） | Writes `_lit_fetch_report.json` (a results array, not a summary object) |
| ⚠️ Sci-Hub 失败但 OA 成功时，同一篇会**留下两条记录**（`scihub-fail` + `ok`），故 `results.length` 可能大于论文篇数，`summary.failed` 按记录条数算而非按篇数算 | ⚠️ When Sci-Hub fails but the OA fallback succeeds, **two records** are pushed per paper (`scihub-fail` + `ok`); `results.length` can exceed the paper count and `summary.failed` counts records, not papers |

### 清单 / Manifest

| 中文 | English |
|---|---|
| `generate_manifest`：把拿不到的文献生成可点击清单 | `generate_manifest`: clickable list of papers that could not be fetched |
| 输出 `批量获取入口.html`（文件名可改），页面语言固定为中文 | Emits `批量获取入口.html` (filename overridable); page is Chinese-only |
| 每行含序号、标题（链到 `https://doi.org/<DOI>`）、第一作者、年份、期刊、状态徽章、`下载PDF` 按钮 | Each row: index, title (linked to `https://doi.org/<DOI>`), first author, year, journal, status badge, download button |
| 提供「顺序打开全部」按钮，逐条间隔 800 ms 打开 | An "open all in order" button opens each link 800 ms apart |

### 宿主路由 / Host route

| 中文 | English |
|---|---|
| 注册 `/lit-fetch` 前缀路由，返回 `{status, plugin, version}` JSON | Registers a `/lit-fetch` prefix route returning `{status, plugin, version}` JSON |
| `version` 直接读 `package.json`（`PKG_VERSION`），不会与包版本漂移 | `version` is read from `package.json` at load (`PKG_VERSION`), so it never drifts |

## ⚠️ 状态枚举的差异（重要） · Status enum mismatch (important)

两个工具的状态词汇表**不一致**，混用会让清单显示错误：

| 来源 | 状态值 |
|---|---|
| `download_papers` 实际产出 | `ok` · `scihub-fail` · `oa-fail` · `closed-access` · `no-doi` |
| `generate_manifest` 认识的状态 | `ok`（渲染为绿色「✓已下载」）· `failed`（渲染为橙色「✗需手动」） |
| 其余一切取值（含 `scihub-fail` / `oa-fail` / `closed-access` / `no-doi` / `pending`） | 渲染为灰色「—」，**既不算已下载也不算需手动** |

也就是说：把 `download_papers` 的结果数组**原样**喂给 `generate_manifest`，只有 `ok` 会显示成「✓已下载」，其余全部落到灰色「—」，
不会显示成「✗需手动」。若希望失败项显示为橙色「✗需手动」，需要先把非 `ok` 状态映射成 `failed` 再传入。

> `generate_manifest` only recognises `ok` and `failed`. Every other value — including the four
> failure statuses actually produced by `download_papers` — renders as a neutral grey dash.
> Map non-`ok` statuses to `failed` yourself if you want the "needs manual retrieval" badge.

## 使用方式 · Usage

在 DSH 对话中对 agent 说 / Talk to the agent in a DSH session：

1. **搜索 · Search**：「帮我找关于 static mixer CFD 的文献」→ agent 调用 `search_papers`
2. **下载 · Download**：「把这些 DOI 下载到 `D:\papers\`」→ agent 调用 `download_papers`
3. **生成清单 · Manifest**：「给没下载到的文献生成获取清单」→ agent 调用 `generate_manifest`

## 下载策略 · Download strategy

1. **Sci-Hub 优先**：依次遍历 8 个域名（sci-hub.ren / ee / st / ru / se / wf / hk、tesble.com），
   请求 `域名 + DOI` 页面（超时 25 秒），用 `<(?:iframe|embed)[^>]*src="...">` 正则解析出 PDF 直链
   （`//` 开头补 `https:`、`/` 开头拼域名），再把整个 PDF **完整下载到内存**、校验 `%PDF-` 魔数与体积，
   通过后写 `.part` 再原子 `rename`。任一步失败就换下一个域名继续。
2. **开放获取兜底**：Sci-Hub 全部失败（或直链下载校验不过）时查 Unpaywall，
   优先 `best_oa_location`，其次遍历 `oa_locations`（取 `url_for_pdf`，退化为 `url`），
   命中后走同一套下载与校验流程。
3. **最终兜底**：两者均失败 → 状态标为 `closed-access` / `scihub-fail` / `oa-fail`，
   用 `generate_manifest` 生成 HTML 供手动获取（DOI 官方入口 / 向作者索取 / NSTL 文献传递）。

> Sci-Hub first — walks the 8 mirrors, resolves the direct PDF link from iframe/embed.
> OA fallback — Unpaywall when Sci-Hub has nothing. Final fallback — the HTML manifest.

## 已知限制 · Known limitations

- Sci-Hub 2021 年后基本停止收录新文献（Elsevier/Wiley/ACS 2021+ 文章大概率无收录）。
- 直连 Sci-Hub 镜像较慢（Cloudflare 限速），建议开启 VPN/代理后使用。
- OA 兜底仅查 Unpaywall；某些文献有 arXiv 预印本但 Unpaywall 未收录。
- **实现说明（非功能）**：PDF 是一次性 `arrayBuffer()` 全量读入内存再落盘的，没有流式写入、没有断点续传，
  也没有下载进度；`Content-Length` 虽然被读进局部变量，但**未参与任何判断或输出**（无进度/无大小预检）。
- Sci-Hub stopped indexing new papers after 2021, and mirror throughput is often throttled.
  The OA fallback only consults Unpaywall. Downloads are fully buffered in memory — no
  streaming, no resume, no progress reporting.

## 安装 · Installation

```bash
dsh plugin --profile desktop add dsh-lit-fetch
# 或从本地目录 link
# cp -r dsh-lit-fetch ~/.dsh/local-plugins/
```

## 技术细节 · Technical notes

- 宿主端纯 Node.js，无 Python 依赖 / Host-side pure Node.js, no Python dependency
- 注入的服务：`tools`、`webServer` / Injects the `tools` and `webServer` services
- PDF 魔数（`%PDF-`，前 5 字节）+ 体积（≥3000 字节）双重校验 / Magic-byte and size validation
- 下载先写 `.part` 临时文件，校验通过后 `rename` 成正式文件名（原子改名，避免留下半截 PDF）
  / Writes a `.part` temp file, then renames it into place
- 并发控制：默认 4，`Math.min(Math.max(n,1),8)` 夹紧 / Bounded concurrency
- 下载报告 JSON 自动落盘 / Automatic JSON report
- 页面抓取超时 25 秒、PDF 读取超时 180 秒、Unpaywall 30 秒 / Timeouts: page 25 s, PDF 180 s, Unpaywall 30 s

## License

MIT
