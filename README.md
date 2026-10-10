# dsh-lit-fetch

DSH literature fetcher — search academic papers, download PDFs by DOI (Sci-Hub mirrors with Open Access fallback), and generate a batch-access HTML manifest.

DSH 文献获取插件 — 快捷搜索学术文献、通过 DOI 批量下载 PDF（Sci-Hub 镜像 + 开放获取兜底）、生成批量获取清单 HTML。

## 功能总览 · At a glance（中英对照 / Bilingual）

### 检索 / Search

| 中文 | English |
|---|---|
| `search_papers`：按 DOI 精确查询（Crossref） | `search_papers`: exact DOI lookup via Crossref |
| 按标题/关键词检索（OpenAlex，最多 20 条） | Title/keyword search via OpenAlex, up to 20 results |
| 返回标题、作者、期刊、年份、DOI、官方链接 | Returns title, authors, journal, year, DOI and canonical link |

### 下载 / Download

| 中文 | English |
|---|---|
| `download_papers`：按 DOI 批量下载 PDF | `download_papers`: batch PDF download by DOI |
| Sci-Hub 优先：遍历 8 个镜像域名，解析 iframe/embed 取直链 | Sci-Hub first: walks 8 mirrors, resolves the PDF link from iframe/embed |
| 开放获取兜底：Unpaywall 查 OA 免费版本 | OA fallback: Unpaywall lookup for a free version |
| PDF 魔数校验（`%PDF-`）+ 最小体积校验（≥3KB）拦截假文件 | Magic-byte (`%PDF-`) and minimum-size (≥3 KB) checks reject bogus files |
| 并发下载（默认 4，上限 8），先写 `.part` 再原子重命名 | Concurrent downloads (default 4, max 8), `.part` then atomic rename |
| 每篇返回状态：`ok` / `scihub-fail` / `oa-fail` / `closed-access` / `no-doi` | Per-paper status: `ok` / `scihub-fail` / `oa-fail` / `closed-access` / `no-doi` |
| 结果写入 `_lit_fetch_report.json` | Writes `_lit_fetch_report.json` into the output directory |

### 清单 / Manifest

| 中文 | English |
|---|---|
| `generate_manifest`：把拿不到的文献生成可点击清单 | `generate_manifest`: clickable list of papers that could not be fetched |
| 输出「批量获取入口.html」，含 DOI 官方链接与状态徽章 | Emits `批量获取入口.html` with DOI links and status badges |
| 提供「顺序打开全部」按钮，逐条间隔 800ms 打开 | A "open all in order" button opens each link 800 ms apart |

### 宿主路由 / Host route

| 中文 | English |
|---|---|
| 注册 `/lit-fetch` 前缀路由，返回插件存活与版本信息 | Registers a `/lit-fetch` prefix route reporting liveness and version |

## 使用方式 · Usage

在 DSH 对话中对 agent 说 / Talk to the agent in a DSH session：

1. **搜索 · Search**：「帮我找关于 static mixer CFD 的文献」→ agent 调用 `search_papers`
2. **下载 · Download**：「把这些 DOI 下载到 `D:\papers\`」→ agent 调用 `download_papers`
3. **生成清单 · Manifest**：「给没下载到的文献生成获取清单」→ agent 调用 `generate_manifest`

## 下载策略 · Download strategy

1. **Sci-Hub 优先**：遍历 8 个域名（sci-hub.ren / ee / st / ru / se / wf / hk、tesble.com），
   解析 iframe/embed 提取 PDF 直链，流式下载并校验 `%PDF` 魔数。
2. **开放获取兜底**：Sci-Hub 无收录时查 Unpaywall，寻找 OA 免费版本（`best_oa_location` 优先，
   其次遍历 `oa_locations`）。
3. **最终兜底**：两者均失败 → 记入清单，生成 HTML 供手动获取（向作者索取 / NSTL 文献传递）。

> Sci-Hub first — walks the 8 mirrors, resolves the direct PDF link from iframe/embed.
> OA fallback — Unpaywall when Sci-Hub has nothing. Final fallback — the HTML manifest.

## 已知限制 · Known limitations

- Sci-Hub 2021 年后基本停止收录新文献（Elsevier/Wiley/ACS 2021+ 文章大概率无收录）。
- 直连 Sci-Hub 镜像较慢（Cloudflare 限速），建议开启 VPN/代理后使用。
- OA 兜底仅查 Unpaywall；某些文献有 arXiv 预印本但 Unpaywall 未收录。
- Sci-Hub stopped indexing new papers after 2021, and mirror throughput is often throttled.
  The OA fallback only consults Unpaywall.

## 安装 · Installation

```bash
dsh plugin --profile desktop add dsh-lit-fetch
# 或从本地目录 link
# cp -r dsh-lit-fetch ~/.dsh/local-plugins/
```

## 技术细节 · Technical notes

- 宿主端纯 Node.js，无 Python 依赖 / Host-side pure Node.js, no Python dependency
- PDF 魔数校验 + 体积校验 / Magic-byte and size validation
- 流式下载 + 原子落盘（`.part` → rename）/ Streaming download with atomic rename
- 并发控制（默认 4，最大 8）/ Bounded concurrency
- 下载报告 JSON 自动落盘 / Automatic JSON report

## License

MIT
