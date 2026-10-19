# dsh-lit-fetch · 学术文献检索与 PDF 下载

> DSH 插件。按 DOI/关键词检索学术文献元数据，遍历 Sci-Hub 镜像下载 PDF，Unpaywall 开放获取兜底，并把拿不到的文献生成可点击的批量获取清单。

**这不是网页正文抓取工具。** 插件不解析网页正文、不做 readability / HTML 转纯文本，
也没有「把网页塞给模型」这类能力。它只做三件事：**检索文献元数据、下载 PDF 文件、生成获取清单 HTML**。

完整对照文档见 [English README](./README.md)。

---

## 一、三个工具

| 工具 | 作用 | 关键实现 |
|---|---|---|
| `search_papers` | 按 DOI 精确查询、按标题/关键词检索 | DOI 走 Crossref `works/{doi}`；关键词走 OpenAlex `works?search=` |
| `download_papers` | 按 DOI 批量下载 PDF | Sci-Hub 8 镜像优先 → Unpaywall 兜底，并发下载 + PDF 校验 |
| `generate_manifest` | 生成可点击的批量获取清单 HTML | 输出 `批量获取入口.html`，含 DOI 官方链接与状态徽章 |

### 1. `search_papers` — 文献检索

- **DOI 精确查询**：入参形如 `10.1016/j.ces.2015.06.052`（正则 `^\d+\.\d+\//` 判定）时，
  请求 Crossref `https://api.crossref.org/works/{doi}`，返回单条结果（`total: 1`）。
- **关键词/标题检索**：非 DOI 输入走 OpenAlex
  `https://api.openalex.org/works?search=<关键词>&per_page=<limit>`。
- **条数**：`limit` 默认 **5**，最大 **20**（`Math.min(args.limit || 5, 20)`）。
- **返回字段**：`title`、`authors`、`journal`、`year`、`doi`、`url`。
  作者保留前 3 位（OpenAlex 路径）或全部（Crossref 路径），均截断到 200 字符。
- **超时与降级**：单次请求 15 秒；Crossref 非 200 或抛错时**自动降级**为 OpenAlex 关键词检索，
  两者都失败则返回空数组（`results: []`、`total: 0`），不抛错。

### 2. `download_papers` — PDF 下载

入参 `papers` 是 JSON 字符串（`[{"idx":1,"title":"...","doi":"...","firstAuthor":"","year":"","journal":""}]`），
`outputDir` 为绝对路径，`concurrency` 默认 **4**、夹紧到 **1~8**（`Math.min(Math.max(n,1),8)`）。

单篇下载流程：

1. **没有 DOI** → 状态 `no-doi`，直接跳过。
2. **Sci-Hub 优先**：依次请求 8 个镜像域名 + DOI（页面超时 25 秒），
   用 `<(?:iframe|embed)[^>]*src="…">` 正则从 HTML 里取出 PDF 直链；
   `//` 开头补 `https:`，`/` 开头拼域名前缀。取到直链后下载 PDF（读取超时 180 秒）。
3. **校验**：前 5 字节必须是 `%PDF-`，且文件 **≥ 3000 字节**，否则拒收（防 Cloudflare 验证页等假文件）。
4. **落盘**：先把整个响应体 `arrayBuffer()` 读进内存，写出 `<文件名>.pdf.part`，再 `rename` 成正式名
   （原子改名，不留半截文件）。
5. **Unpaywall 兜底**：Sci-Hub 无直链或下载校验失败时，查
   `https://api.unpaywall.org/v2/{doi}`，优先 `best_oa_location`，其次遍历 `oa_locations`
   （取 `url_for_pdf`，没有则退化为 `url`），命中后走同一套下载与校验。
6. **写报告**：任务结束后把结果数组写到 `outputDir/_lit_fetch_report.json`
   （内容是**结果数组**，不是汇总对象）。

**文件名规则**：`<两位序号>_<清洗后标题>.pdf`（如 `01_Toward a general theory of turbulence.pdf`）。
标题会去掉 `\ / : * ? " < > |` 与回车/换行/制表符，空白折叠，截断到 120 字符；无标题时用 `paper_<idx>`。

**每篇状态枚举（共 5 种）**：

| 状态 | 含义 |
|---|---|
| `ok` | 下载成功（`source` 标为 `scihub` 或 `unpaywall` / `unpaywall-alt`） |
| `scihub-fail` | 找到 Sci-Hub 直链但下载或校验失败（之后会继续尝试 Unpaywall） |
| `oa-fail` | 找到 OA 直链但下载或校验失败 |
| `closed-access` | Unpaywall 也查不到任何免费版本 |
| `no-doi` | 入参缺 DOI |

> ⚠️ **一个容易被忽略的行为**：某篇 Sci-Hub 失败、但 Unpaywall 兜底成功时，`results` 里会
> **同时存在**一条 `scihub-fail` 和一条 `ok`（代码是先 push `scihub-fail` 再继续兜底的）。
> 因此 `results.length` 可能大于入参论文篇数，`summary.downloaded + summary.failed` 也可能大于
> `summary.total`。`summary.downloaded` 只统计 `status === 'ok'`，`summary.failed` 是
> `results.length - downloaded`（按记录条数算，不是按论文篇数算）。

### 3. `generate_manifest` — 批量获取清单

- 入参 `papers` 是 JSON 字符串，`outputDir` 为输出目录，`filename` 默认 `批量获取入口.html`。
- 生成固定中文界面的 HTML：标题「批量获取入口 — 共 N 篇」，表格列
  `# / 标题 / 第一作者 / 年 / 期刊 / 操作`；标题与「下载PDF」按钮都链到
  `https://doi.org/<DOI>`（无 DOI 时为 `#`）。
- 底部「顺序打开全部 N 篇」按钮：把所有下载链接按 **800 ms** 间隔逐个 `window.open`。

**⚠️ 状态枚举不匹配（重要）**：`generate_manifest` 只认识 **`ok`** 和 **`failed`** 两个值：

| 传入 status | 页面显示 |
|---|---|
| `ok` | 绿色「✓已下载」 |
| `failed` | 橙色「✗需手动」 |
| 其他任何值（含 `scihub-fail` / `oa-fail` / `closed-access` / `no-doi` / `pending`） | 灰色「—」 |

也就是说：把 `download_papers` 的结果**原样**传给 `generate_manifest`，失败项**不会**显示成「✗需手动」，
而是全部落到灰色「—」。若要橙色徽章，需自己先把非 `ok` 状态映射为 `failed`。

### 宿主路由

`apply()` 里注册了 `ctx.webServer.register({ kind: 'prefix', path: '/lit-fetch' })`，
任何 `/lit-fetch` 下的请求都返回：

```json
{ "status": "ok", "plugin": "dsh-lit-fetch", "version": "<package.json 的 version>" }
```

版本号来自顶部常量 `PKG_VERSION`（启动时从 `package.json` 读取），升版只需改 `package.json`，路由不会漂移。

---

## 二、使用示例

在 DSH 会话里直接对 agent 说：

1. **检索**：「帮我找关于 static mixer CFD 的文献」→ agent 调 `search_papers`
2. **下载**：「把 10.1016/j.ces.2015.06.052 下载到 `D:\papers\`」→ agent 调 `download_papers`
3. **清单**：「给没下载到的文献生成获取清单」→ agent 调 `generate_manifest`

---

## 三、安装

```bash
dsh plugin --profile desktop add dsh-lit-fetch
```

或本地链接安装：

```bash
cp -r dsh-lit-fetch ~/.dsh/local-plugins/
# 再在 profile 的 package.json 里加：
# "dsh-lit-fetch": "link:C:/Users/<你>/.dsh/local-plugins/dsh-lit-fetch"
```

插件通过 `cordis.patch.yml` 以 `insert` 方式把自己的 id/name 挂进宿主，注入 `tools` 与 `webServer` 两个服务。

---

## 四、已知限制

- **Sci-Hub 覆盖有限**：2021 年后基本停止收录新文献，Elsevier / Wiley / ACS 的 2021+ 文章大概率查不到。
- **镜像慢**：直连 Sci-Hub 常被 Cloudflare 限速，建议开 VPN/代理后再用；下载失败多由此而来。
- **OA 兜底只查 Unpaywall**：有 arXiv 预印本但 Unpaywall 未收录的文献会被标成 `closed-access`。
- **PDF 全量读进内存**：实现是 `Buffer.from(await resp.arrayBuffer())`，一次性读完再写盘，
  **没有流式写入、没有断点续传、没有进度条**。超大 PDF 会占用等量内存。
- **`Content-Length` 读了不用**：代码把 `Content-Length` 读进局部变量 `total`，但从未参与任何判断或输出
  （既不预检大小也不显示进度）。
- **清单页面固定中文**：HTML 模板里 `lang="zh"`，表头与提示语都是写死的中文，无多语言切换。

---

## 五、技术参数速查

| 项目 | 值 |
|---|---|
| 插件 id / name | `dsh-lit-fetch` |
| 注入服务 | `tools`、`webServer` |
| Sci-Hub 域名（8 个） | sci-hub.ren / sci-hub.ee / tesble.com / sci-hub.st / sci-hub.ru / sci-hub.se / sci-hub.wf / sci-hub.hk |
| 页面抓取超时 | 25 000 ms |
| PDF 读取超时 | 180 000 ms |
| Unpaywall 超时 | 30 000 ms |
| 检索请求超时 | 15 000 ms |
| 并发下载 | 默认 4，范围 1–8 |
| PDF 魔数 | 前 5 字节 `%PDF-` |
| 最小体积 | 3000 字节 |
| 报告文件名 | `_lit_fetch_report.json` |
| 清单默认文件名 | `批量获取入口.html` |
| License | MIT |

---

## License

MIT
