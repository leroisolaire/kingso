/**
 * Crawl les sites web enregistrés dans WebSource et stocke les pages dans WebPage.
 * Usage : npm run crawl
 * Pour forcer un site : CRAWL_URL=https://example.com npm run crawl
 */

import * as cheerio from 'cheerio'
import path from 'node:path'

try { process.loadEnvFile(path.resolve(process.cwd(), '.env.local')) } catch { /* absent en CI */ }

const DELAY_MS = Number(process.env.DELAY_MS ?? 21000)

const SKIP_PATTERNS = [
  /\.(jpg|jpeg|png|gif|svg|webp|pdf|zip|mp4|mp3)$/i,
  /\/wp-admin/, /\/wp-login/, /\/wp-json/,
  /\/feed\/?$/, /\?/, /#/,
  /\/page\//, /\/tag\//, /\/author\//, /\/category\//,
]

const CONTENT_SELECTORS = ['main', 'article', '.entry-content', '.page-content', '#content', '.content']

function normalizeUrl(href: string, base: string, siteUrl: string): string | null {
  try {
    const parsed = new URL(href, base)
    if (parsed.hostname !== new URL(siteUrl).hostname) return null
    if (SKIP_PATTERNS.some((p) => p.test(parsed.href))) return null
    parsed.hash = ''
    return parsed.href.replace(/\/$/, '') || siteUrl
  } catch { return null }
}

function extractContent($: ReturnType<typeof cheerio.load>): { title: string; text: string } {
  const title = $('h1').first().text().trim()
    || $('title').text().replace(/[-|].*$/, '').trim()
    || 'Page web'

  $('script, style, noscript, nav, header, footer, .menu, .nav, .navigation, .sidebar, .widget, .cookie, .breadcrumb, iframe, [aria-hidden="true"]').remove()

  let text = ''
  for (const sel of CONTENT_SELECTORS) {
    const el = $(sel).first()
    if (el.length && el.text().trim().length > 200) { text = el.text(); break }
  }
  if (!text) text = $('body').text()

  return {
    title,
    text: text.replace(/\t/g, ' ').replace(/ {2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim(),
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

async function run() {
  const { db } = await import('../src/lib/db/client')
  const { generateEmbedding, embeddingToSql } = await import('../src/lib/ai/embed')

  const where = process.env.CRAWL_URL
    ? { url: process.env.CRAWL_URL, active: true }
    : { active: true }

  const sources = await db.webSource.findMany({ where })

  if (sources.length === 0) {
    console.log('Aucune source active. Ajoutez-en via /admin/sources.')
    await db.$disconnect()
    return
  }

  let totalSaved = 0

  for (const source of sources) {
    console.log(`\n--- ${source.name} (${source.url}, max ${source.maxPages} pages) ---`)

    const visited = new Set<string>()
    const queue: string[] = [source.url]
    let saved = 0
    let skipped = 0

    while (queue.length > 0 && saved < source.maxPages) {
      const url = queue.shift()!
      if (visited.has(url)) continue
      visited.add(url)

      try {
        process.stdout.write(`  [${saved + 1}] ${url} ... `)

        const res = await fetch(url, {
          headers: { 'User-Agent': 'Kingso-Bot/1.0', 'Accept': 'text/html' },
          signal: AbortSignal.timeout(10_000),
        })

        if (!res.ok) { console.log(`skip (HTTP ${res.status})`); skipped++; continue }
        if (!(res.headers.get('content-type') ?? '').includes('text/html')) { console.log('skip (non-HTML)'); skipped++; continue }

        const html = await res.text()
        const $ = cheerio.load(html)

        $('a[href]').each((_, el) => {
          const href = $(el).attr('href')
          if (!href) return
          const norm = normalizeUrl(href, url, source.url)
          if (norm && !visited.has(norm) && !queue.includes(norm)) queue.push(norm)
        })

        const { title, text } = extractContent($)
        if (text.length < 150) { console.log('skip (trop court)'); skipped++; continue }

        const embedding = await generateEmbedding(`${title}\n\n${text}`)

        // Upsert : crée ou met à jour si la page existe déjà
        await db.$executeRaw`
          INSERT INTO "WebPage" (id, url, title, content, embedding, "sourceId", "crawledAt", "updatedAt")
          VALUES (gen_random_uuid()::text, ${url}, ${title}, ${text}, ${embeddingToSql(embedding)}::vector, ${source.id}, NOW(), NOW())
          ON CONFLICT (url) DO UPDATE
            SET title = EXCLUDED.title, content = EXCLUDED.content,
                embedding = EXCLUDED.embedding, "updatedAt" = NOW()
        `

        console.log(`OK "${title}"`)
        saved++
        await sleep(DELAY_MS)
      } catch (err) {
        console.log(`erreur : ${err instanceof Error ? err.message : String(err)}`)
        skipped++
      }
    }

    await db.webSource.update({
      where: { id: source.id },
      data: { lastCrawled: new Date() },
    })

    console.log(`  => ${saved} pages sauvegardées, ${skipped} ignorées`)
    totalSaved += saved
  }

  console.log(`\nTermine - ${totalSaved} pages importées au total.`)
  await db.$disconnect()
}

run().catch((err) => { console.error(err); process.exit(1) })
