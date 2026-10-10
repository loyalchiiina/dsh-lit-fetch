// dsh-lit-fetch: Literature paper search, download (Sci-Hub + OA fallback), and manifest generation
// Host-side plugin: registers tools for the AI agent to query, download, and organize academic papers.

import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'dsh-lit-fetch'
export const inject = ['tools', 'webServer']

// ── Sci-Hub domain list (2026-10-09 tested, ordered by reliability) ──
const SCIHUB_DOMAINS = [
  'https://sci-hub.ren/',
  'https://sci-hub.ee/',
  'https://www.tesble.com/',
  'https://sci-hub.st/',
  'https://sci-hub.ru/',
  'https://sci-hub.se/',
  'https://sci-hub.wf/',
  'https://sci-hub.hk/',
]

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

const PAGE_TIMEOUT = 25_000
const PDF_CONNECT_TIMEOUT = 30_000
const PDF_READ_TIMEOUT = 180_000

// ── Helper: build fetch headers ──
function buildHeaders(referer) {
  const h = {
    'User-Agent': UA,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
  }
  if (referer) h.Referer = referer
  return h
}

// ── Helper: clean filename ──
function cleanFilename(s) {
  return (s || '')
    .replace(/[\\/:*?"<>|\r\n\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
}

// ── Helper: resolve PDF URL from a Sci-Hub page ──
async function resolvePdfUrl(doi) {
  const errors = []
  for (const domain of SCIHUB_DOMAINS) {
    try {
      const resp = await fetch(domain + doi, {
        headers: buildHeaders(),
        signal: AbortSignal.timeout(PAGE_TIMEOUT),
      })
      if (resp.status >= 400) {
        errors.push(`${domain} HTTP ${resp.status}`)
        continue
      }
      const html = await resp.text()
      // Match iframe src or embed src
      const match = html.match(/<(?:iframe|embed)[^>]*src\s*=\s*["']([^"']+)["']/i)
      if (!match) {
        errors.push(`${domain} no iframe/embed`)
        continue
      }
      let src = match[1].split('#')[0]
      if (src.startsWith('//')) src = 'https:' + src
      else if (src.startsWith('/')) src = domain.replace(/\/$/, '') + src
      if (!src.toLowerCase().startsWith('http')) {
        errors.push(`${domain} bad src=${src}`)
        continue
      }
      return { pdfUrl: src, domain }
    } catch (err) {
      errors.push(`${domain} ${err.name}: ${err.message?.slice(0, 60)}`)
    }
  }
  return { pdfUrl: null, errors }
}

// ── Helper: download PDF and verify magic bytes ──
async function downloadPdf(pdfUrl, referer, destPath) {
  const { writeFile, mkdir } = await import('node:fs/promises')
  const { dirname } = await import('node:path')

  try {
    await mkdir(dirname(destPath), { recursive: true })
    const resp = await fetch(pdfUrl, {
      headers: buildHeaders(referer),
      signal: AbortSignal.timeout(PDF_READ_TIMEOUT),
    })
    if (resp.status >= 400) return { ok: false, detail: `HTTP ${resp.status}` }

    const contentType = resp.headers.get('Content-Type') || ''
    const total = parseInt(resp.headers.get('Content-Length') || '0', 10)
    const buffer = Buffer.from(await resp.arrayBuffer())

    // Verify PDF magic bytes
    if (buffer.length < 5 || buffer.subarray(0, 5).toString() !== '%PDF-') {
      return { ok: false, detail: `not-pdf (ctype=${contentType}, first=${buffer.subarray(0, 5).toString()})` }
    }
    if (buffer.length < 3000) {
      return { ok: false, detail: `too-small (${buffer.length} bytes, ctype=${contentType})` }
    }

    const tmpPath = destPath + '.part'
    await writeFile(tmpPath, buffer)
    const { rename } = await import('node:fs/promises')
    await rename(tmpPath, destPath)

    return {
      ok: true,
      detail: `${(buffer.length / 1048576).toFixed(2)} MB (ctype=${contentType})`,
      bytes: buffer.length,
    }
  } catch (err) {
    return { ok: false, detail: `${err.name}: ${err.message?.slice(0, 80)}` }
  }
}

// ── Helper: OA fallback via Unpaywall ──
async function oaFallback(doi) {
  try {
    const resp = await fetch(
      `https://api.unpaywall.org/v2/${doi}?email=lit-fetch@example.org`,
      { headers: buildHeaders(), signal: AbortSignal.timeout(30_000) }
    )
    if (resp.status !== 200) return null
    const data = await resp.json()
    const best = data.best_oa_location
    if (best?.url_for_pdf) return { url: best.url_for_pdf, source: 'unpaywall' }
    if (best?.url) return { url: best.url, source: 'unpaywall' }
    for (const loc of data.oa_locations || []) {
      if (loc.url_for_pdf) return { url: loc.url_for_pdf, source: 'unpaywall-alt' }
      if (loc.url) return { url: loc.url, source: 'unpaywall-alt' }
    }
    return null
  } catch {
    return null
  }
}

// ── Helper: generate HTML manifest (like 批量获取入口.html) ──
function generateHtmlManifest(items) {
  const rows = items
    .map((item, i) => {
      const doiUrl = item.doi ? `https://doi.org/${item.doi}` : '#'
      const title = item.title || '(untitled)'
      const firstAuthor = item.firstAuthor || '—'
      const year = item.year || '—'
      const journal = item.journal || '—'
      const statusBadge =
        item.status === 'ok'
          ? `<span style="color:#059669">✓已下载</span>`
          : item.status === 'failed'
          ? `<span style="color:#b45309">✗需手动</span>`
          : `<span style="color:#6b7280">—</span>`
      return `<tr><td>${i + 1}</td><td><a href="${doiUrl}" target="_blank">${title}</a></td><td>${firstAuthor}</td><td>${year}</td><td>${journal}</td><td>${statusBadge} <a href="${doiUrl}" target="_blank" class="dl">下载PDF</a></td></tr>`
    })
    .join('\n')

  return `<!DOCTYPE html>
<html lang="zh">
<head><meta charset="UTF-8"><title>批量获取入口 — 共 ${items.length} 篇</title>
<style>
  body{font-family:"Microsoft YaHei",system-ui,sans-serif;max-width:1200px;margin:24px auto;padding:0 16px;color:#1f2937}
  h1{font-size:20px} .tip{background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:10px 14px;font-size:14px;line-height:1.7}
  table{border-collapse:collapse;width:100%;font-size:13px}
  th,td{border:1px solid #d1d5db;padding:6px 8px;text-align:left;vertical-align:top}
  th{background:#f3f4f6}
  a{color:#1d4ed8;text-decoration:none} a:hover{text-decoration:underline}
  .dl{display:inline-block;background:#1d4ed8;color:#fff;padding:2px 10px;border-radius:5px}
  button{background:#059669;color:#fff;border:0;border-radius:6px;padding:8px 18px;font-size:14px;cursor:pointer}
</style></head><body>
<h1>批量获取入口 — 共 ${items.length} 篇</h1>
<div class="tip"><b>使用方法：</b>点击「下载PDF」（DOI 官方入口），有权限的环境会直接出 PDF。已下载的文献标 ✓，需手动获取的标 ✗。</div>
<table><tr><th>#</th><th>标题</th><th>第一作者</th><th>年</th><th>期刊</th><th>操作</th></tr>
${rows}</table>
<button onclick="openAll()">顺序打开全部 ${items.length} 篇</button>
<script>
function openAll(){
  const urls=[...document.querySelectorAll("a.dl")].map(a=>a.href);
  urls.forEach((u,i)=>setTimeout(()=>window.open(u,"_blank"),i*800));
}
</script>
</body></html>`
}

// ── Main apply ──
export function apply(ctx) {
  ctx.logger.info('dsh-lit-fetch: started')

  // ── Tool 1: search_papers ──
  ctx.tools.register(
    defineTool({
      name: 'search_papers',
      description:
        'Search for academic papers by DOI, title, or keyword. Returns metadata (title, authors, journal, year, DOI) from Crossref/OpenAlex. Use this to find papers before downloading.',
      parameters: {
        query: {
          type: 'string',
          required: true,
          description: 'DOI (e.g. "10.1016/j.ces.2015.06.052"), paper title, or keyword',
        },
        limit: {
          type: 'number',
          description: 'Max results to return (default 5, max 20)',
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            results: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  title: { type: 'string' },
                  authors: { type: 'string' },
                  journal: { type: 'string' },
                  year: { type: 'string' },
                  doi: { type: 'string' },
                  url: { type: 'string' },
                },
              },
            },
            total: { type: 'number' },
          },
        },
        render: (_args, value) => [
          {
            type: 'text',
            text: value.results
              .map(
                (r, i) =>
                  `${i + 1}. ${r.title}\n   ${r.authors} | ${r.journal} | ${r.year}\n   DOI: ${r.doi || 'N/A'}`
              )
              .join('\n\n'),
          },
        ],
      },
      async execute(args) {
        const query = args.query
        const limit = Math.min(args.limit || 5, 20)
        const isDoi = /^\d+\.\d+\//.test(query)

        if (isDoi) {
          // Direct DOI lookup via Crossref
          try {
            const resp = await fetch(`https://api.crossref.org/works/${query}`, {
              headers: buildHeaders(),
              signal: AbortSignal.timeout(15_000),
            })
            if (resp.status === 200) {
              const data = (await resp.json()).message
              return {
                results: [
                  {
                    title: (data.title || [''])[0],
                    authors: (data.author || [])
                      .map((a) => `${a.family || ''}, ${a.given || ''}`)
                      .join('; ')
                      .slice(0, 200),
                    journal: (data['container-title'] || [''])[0],
                    year: data.issued?.['date-parts']?.[0]?.[0]?.toString() || '',
                    doi: data.DOI,
                    url: data.URL || `https://doi.org/${data.DOI}`,
                  },
                ],
                total: 1,
              }
            }
          } catch {}
        }

        // Keyword search via OpenAlex
        try {
          const resp = await fetch(
            `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per_page=${limit}&mailto=lit-fetch@example.org`,
            { headers: buildHeaders(), signal: AbortSignal.timeout(15_000) }
          )
          if (resp.status === 200) {
            const data = await resp.json()
            const results = (data.results || []).map((w) => ({
              title: w.title || w.display_name || '',
              authors: (w.authorships || [])
                .slice(0, 3)
                .map((a) => a.author?.display_name || '')
                .join('; ')
                .slice(0, 200),
              journal: w.primary_location?.source?.display_name || '',
              year: w.publication_year?.toString() || '',
              doi: w.doi || '',
              url: w.doi || w.id || '',
            }))
            return { results, total: data.meta?.count || results.length }
          }
        } catch {}

        return { results: [], total: 0 }
      },
    })
  )

  // ── Tool 2: download_papers ──
  ctx.tools.register(
    defineTool({
      name: 'download_papers',
      description:
        'Download academic paper PDFs by DOI. First tries Sci-Hub mirrors (iframe/embed resolution), then falls back to Open Access (Unpaywall). Returns per-paper status. Requires `outputDir` path.',
      parameters: {
        papers: {
          type: 'string',
          required: true,
          description:
            'JSON array of paper objects: [{"idx":1,"title":"...","doi":"10.1016/...","firstAuthor":"","year":"","journal":""}]',
        },
        outputDir: {
          type: 'string',
          required: true,
          description: 'Absolute path to directory where PDFs will be saved',
        },
        concurrency: {
          type: 'number',
          description: 'Concurrent download threads (default 4, max 8)',
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            results: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  idx: { type: 'number' },
                  title: { type: 'string' },
                  doi: { type: 'string' },
                  status: { type: 'string' },
                  detail: { type: 'string' },
                  file: { type: 'string' },
                  source: { type: 'string' },
                },
              },
            },
            summary: {
              type: 'object',
              additionalProperties: false,
              properties: {
                total: { type: 'number' },
                downloaded: { type: 'number' },
                failed: { type: 'number' },
              },
            },
          },
        },
        render: (_args, value) => [
          {
            type: 'text',
            text:
              `下载完成 ${value.summary.downloaded}/${value.summary.total} 篇\n\n` +
              value.results
                .map(
                  (r) =>
                    `[${r.idx}] ${r.status === 'ok' ? '✓' : '✗'} ${r.title?.slice(0, 60) || r.doi} — ${r.detail || r.status}`
                )
                .join('\n'),
          },
        ],
      },
      async execute(args) {
        let papers
        try {
          papers = JSON.parse(args.papers)
        } catch {
          return { results: [], summary: { total: 0, downloaded: 0, failed: 0 } }
        }

        const outputDir = args.outputDir
        const concurrency = Math.min(Math.max(args.concurrency || 4, 1), 8)
        const { mkdir, writeFile } = await import('node:fs/promises')
        const { join } = await import('node:path')
        await mkdir(outputDir, { recursive: true })

        const results = []
        const queue = [...papers]

        async function worker() {
          while (queue.length > 0) {
            const item = queue.shift()
            if (!item) break

            const idx = item.idx || 0
            const title = item.title || `paper_${idx}`
            const doi = item.doi
            const fname = `${String(idx).padStart(2, '0')}_${cleanFilename(title)}.pdf`
            const destPath = join(outputDir, fname)

            if (!doi) {
              results.push({ idx, title, doi: '', status: 'no-doi', detail: 'Missing DOI' })
              continue
            }

            // Step 1: Sci-Hub
            const resolved = await resolvePdfUrl(doi)
            if (resolved.pdfUrl) {
              const dl = await downloadPdf(resolved.pdfUrl, resolved.domain, destPath)
              if (dl.ok) {
                results.push({ idx, title, doi, status: 'ok', detail: dl.detail, file: fname, source: 'scihub' })
                continue
              }
              results.push({ idx, title, doi, status: 'scihub-fail', detail: dl.detail, source: 'scihub' })
              // Continue to OA fallback
            }

            // Step 2: OA fallback
            const oa = await oaFallback(doi)
            if (oa) {
              const dl = await downloadPdf(oa.url, null, destPath)
              if (dl.ok) {
                results.push({ idx, title, doi, status: 'ok', detail: dl.detail, file: fname, source: oa.source })
                continue
              }
              results.push({ idx, title, doi, status: 'oa-fail', detail: dl.detail, source: oa.source })
            } else {
              results.push({ idx, title, doi, status: 'closed-access', detail: 'No OA version found', source: 'none' })
            }
          }
        }

        // Run workers
        await Promise.all(Array.from({ length: concurrency }, worker))

        // Write report
        const reportPath = join(outputDir, '_lit_fetch_report.json')
        await writeFile(reportPath, JSON.stringify(results, null, 2), 'utf-8')

        const downloaded = results.filter((r) => r.status === 'ok').length
        const failed = results.length - downloaded
        return { results, summary: { total: papers.length, downloaded, failed } }
      },
    })
  )

  // ── Tool 3: generate_manifest ──
  ctx.tools.register(
    defineTool({
      name: 'generate_manifest',
      description:
        'Generate a batch-access HTML manifest (like 批量获取入口.html) from paper metadata. Useful for papers that could not be downloaded automatically — gives the user a clickable list to obtain them manually.',
      parameters: {
        papers: {
          type: 'string',
          required: true,
          description:
            'JSON array of paper objects: [{"title":"...","doi":"...","firstAuthor":"","year":"","journal":"","status":"ok|failed|pending"}]',
        },
        outputDir: {
          type: 'string',
          required: true,
          description: 'Absolute path where the HTML manifest will be written',
        },
        filename: {
          type: 'string',
          description: 'HTML filename (default: 批量获取入口.html)',
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            htmlPath: { type: 'string' },
            count: { type: 'number' },
          },
        },
        render: (_args, value) => [
          { type: 'text', text: `已生成批量获取清单：${value.htmlPath}（${value.count} 篇）` },
        ],
      },
      async execute(args) {
        let papers
        try {
          papers = JSON.parse(args.papers)
        } catch {
          return { htmlPath: '', count: 0 }
        }

        const outputDir = args.outputDir
        const filename = args.filename || '批量获取入口.html'
        const { mkdir, writeFile } = await import('node:fs/promises')
        const { join } = await import('node:path')
        await mkdir(outputDir, { recursive: true })

        const html = generateHtmlManifest(papers)
        const htmlPath = join(outputDir, filename)
        await writeFile(htmlPath, html, 'utf-8')

        return { htmlPath, count: papers.length }
      },
    })
  )

  // ── Web route: serve static assets (e.g., downloaded PDFs for preview) ──
  const disposeRoute = ctx.webServer.register({
    kind: 'prefix',
    path: '/lit-fetch',
    handler: async (req, res) => {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ status: 'ok', plugin: 'dsh-lit-fetch', version: '1.0.0' }))
    },
  })
  ctx.effect(() => () => disposeRoute(), 'dsh-lit-fetch: routes')

  ctx.logger.info('dsh-lit-fetch: tools registered (search_papers, download_papers, generate_manifest)')
}
