# dsh-lit-fetch

DSH 文献获取插件 — 快捷搜索学术文献、通过 DOI 批量下载 PDF（Sci-Hub 镜像 + 开放获取兜底）、生成批量获取清单 HTML。

## 功能

| 工具 | 用途 |
|---|---|
| `search_papers` | 按 DOI / 标题 / 关键词搜索文献元数据（Crossref + OpenAlex） |
| `download_papers` | 批量下载 PDF：Sci-Hub 镜像 → 开放获取（Unpaywall）兜底 → 失败记录 |
| `generate_manifest` | 生成「批量获取入口.html」，给出未下载文献的 DOI 官方链接 |

## 使用方式

在 DSH 对话中对 agent 说：

1. **搜索**：「帮我找关于 static mixer CFD 的文献」→ agent 调用 `search_papers`
2. **下载**：「把这些 DOI 下载到 C:\Users\...\papers\」→ agent 调用 `download_papers`
3. **生成清单**：「给没下载到的文献生成获取清单」→ agent 调用 `generate_manifest`

## 下载策略

1. **Sci-Hub 优先**：遍历 8 个可用域名（sci-hub.ren/ee/st/ru 等），解析 iframe/embed 提取 PDF 直链，流式下载并校验 `%PDF` 魔数。
2. **开放获取兜底**：Sci-Hub 无收录时查 Unpaywall，寻找 OA 免费版本。
3. **最终兜底**：两者均失败 → 记入清单，生成 HTML 供手动获取（向作者索取 / NSTL 文献传递）。

## 已知限制

- Sci-Hub 2021 年后基本停止收录新文献（Elsevier/Wiley/ACS 2021+ 文章大概率无收录）。
- 直连 Sci-Hub 镜像极慢（Cloudflare 限速），建议开启 VPN/代理后使用。
- OA 兜底仅查 Unpaywall；某些文献有 arXiv 预印本但 Unpaywall 未收录。

## 安装

```bash
# 从本地目录安装
cp -r dsh-lit-fetch ~/.dsh/local-plugins/
# 在 profile 的 cordis.patch.yml 中添加 bundles 条目
```

## 技术细节

- 宿主端纯 Node.js（无需 Python 依赖）
- PDF 魔数校验（`%PDF-`）+ 大小校验（≥3KB）防止假文件
- 流式下载避免大文件卡死
- 并发控制（默认 4，最大 8）
- 下载报告 JSON 自动写入输出目录

## License

MIT