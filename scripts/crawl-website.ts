/**
 * Crawl leroisolaire.fr et importe les pages dans la base documentaire.
 * Usage : npm run crawl
 *
 * Options :
 *   MAX_PAGES   : nombre max de pages à crawler (défaut 80)
 *   DELAY_MS    : délai entre chaque page en ms (défaut 800) — respecte les rate limits Voyage AI
 */

import * as cheerio from 'cheerio'
import path from 'node:path'

// En local : charge .env.local — en CI les variables viennent de l'environnement GitHub
try {
  process.loadEnvFile(path.resolve(process.cwd(), '.env.local'))
} catch {
  // Pas de .env.local (ex. CI/CD) — les variables sont déjà dans process.env
}

// Import après loadEnvFile pour que DATABASE_URL etc. soient disponibles
const { db } = await import('../src/lib/db/client')
const { generateEmbedding, embeddingToSql } = await import('../src/lib/ai/embed')

// ─── Config ───────────────────────────────────────────────────────────────────
const BASE_URL   = 'https://www.leroisolaire.fr'
const MAX_PAGES  = Number(process.env.MAX_PAGES  ?? 80)
const DELAY_MS   = Number(process.env.DELAY_MS   ?? 800)

// Pages/sections inutiles à exclure
const SKIP_PATTERNS = [
  /\.(jpg|jpeg|png|gif|svg|webp|pdf|zip|mp4|mp3)$/i,
  /\/wp-admin/,
  /\/wp-login/,
  /\/wp-json/,
  /\/feed\/?$/,
  /\?/,          // ignore URLs avec query string
  /#/,           // ignore ancres
  /\/page\//,    // ignore pages de pagination
  /\/tag\//,
  /\/author\//,
  /\/category\//,
]

// Sélecteurs des zones de contenu utile (par ordre de priorité)
const CONTENT_SELECTORS = ['main', 'article', '.entry-content', '.page-content', '#content', '.content']

// ─── Helpers ──────────────────────────────────────────────────────────────────
function normalizeUrl(href: string, base: string): string | null {
  try {
    const parsed = new URL(href, base)
    if (parsed.hostname !== new URL(BASE_URL).hostname) return null
    if (SKIP_PATTERNS.some((p) => p.test(parsed.href))) return null
    parsed.hash = ''
    // Normalise le trailing slash
    const url = parsed.href.replace(/\/$/, '') || BASE_URL
    return url
  } catch {
    return null
  }
}

function extractContent($: cheerio.CheerioAPI): { title: string; text: string } {
  const title = $('h1').first().text().trim()
    || $('title').text().replace(/[-|].*$/, '').trim()
    || 'Page Le Roi Solaire'

  // Supprime les éléments non-contenu
  $('script, style, noscript, nav, header, footer, .menu, .nav, .navigation, .sidebar, .widget, .cookie, .breadcrumb, iframe, [aria-hidden="true"], .elementor-hidden').remove()

  let text = ''
  for (const selector of CONTENT_SELECTORS) {
    const el = $(selector).first()
    if (el.length && el.text().trim().length > 200) {
      text = el.text()
      break
    }
  }
  if (!text) text = $('body').text()

  text = text
    .replace(/\t/g, ' ')
    .replace(/ {2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return { title, text }
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ─── Main ─────────────────────────────────────────────────────────────────────
async function run() {
  console.log(`\n🌐 Crawl de ${BASE_URL} (max ${MAX_PAGES} pages)\n`)

  // Catégorie dédiée
  let category = await db.category.findFirst({ where: { name: 'Site Web Le Roi Solaire' } })
  if (!category) {
    category = await db.category.create({
      data: { name: 'Site Web Le Roi Solaire', description: 'Pages publiques du site leroisolaire.fr' },
    })
    console.log('✓ Catégorie créée : Site Web Le Roi Solaire\n')
  } else {
    console.log(`✓ Catégorie existante : ${category.id}\n`)
  }

  const visited = new Set<string>()
  const queue: string[] = [BASE_URL]
  let saved = 0
  let skipped = 0

  while (queue.length > 0 && saved < MAX_PAGES) {
    const url = queue.shift()!
    if (visited.has(url)) continue
    visited.add(url)

    try {
      process.stdout.write(`[${saved + 1}] ${url} … `)

      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Kingso-Bot/1.0 (assistant Le Roi Solaire)',
          'Accept': 'text/html',
        },
        signal: AbortSignal.timeout(10_000),
      })

      if (!res.ok) { console.log(`skip (HTTP ${res.status})`); skipped++; continue }
      const ct = res.headers.get('content-type') ?? ''
      if (!ct.includes('text/html')) { console.log('skip (non-HTML)'); skipped++; continue }

      const html = await res.text()
      const $ = cheerio.load(html)

      // Collecte les liens internes
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href')
        if (!href) return
        const norm = normalizeUrl(href, url)
        if (norm && !visited.has(norm) && !queue.includes(norm)) queue.push(norm)
      })

      const { title, text } = extractContent($)

      if (text.length < 150) { console.log('skip (trop court)'); skipped++; continue }

      // Vérifie si la page existe déjà
      const existing = await db.document.findFirst({ where: { fileUrl: url } })
      if (existing) { console.log('déjà importée'); skipped++; continue }

      // Embedding + insertion
      const embedding = await generateEmbedding(`${title}\n\n${text}`)
      await db.$executeRaw`
        INSERT INTO "Document" (id, title, content, type, "categoryId", "fileUrl", embedding, "createdAt", "updatedAt")
        VALUES (
          gen_random_uuid()::text,
          ${title},
          ${text},
          'PUBLIC'::"DocumentType",
          ${category.id},
          ${url},
          ${embeddingToSql(embedding)}::vector,
          NOW(), NOW()
        )
      `

      console.log(`✓ "${title}" (${text.length} car.)`)
      saved++

      await delay(DELAY_MS)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.log(`erreur : ${msg}`)
      skipped++
    }
  }

  console.log(`\n✅ Terminé — ${saved} pages importées, ${skipped} ignorées.`)
  await db.$disconnect()
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
