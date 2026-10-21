/**
 * Découpe en passages et indexe les documents qui n'en ont pas encore (documents créés
 * avant le passage à la recherche par passages), ou tous avec --all.
 * Usage : npm run reindex-documents [-- --all]
 */

import path from 'node:path'

try { process.loadEnvFile(path.resolve(process.cwd(), '.env.local')) } catch { /* absent en CI */ }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const { db } = await import('../src/lib/db/client')
  const { rechunkFromContent, processDocument } = await import('../src/lib/documents/process')
  const all = process.argv.includes('--all')

  const docs = await db.document.findMany({
    where: all ? {} : { chunks: { none: {} }, content: { not: '' } },
    select: { id: true, title: true, content: true },
    orderBy: { createdAt: 'asc' },
  })
  console.log(`${docs.length} document(s) à indexer`)

  for (const doc of docs) {
    await rechunkFromContent(doc.id, doc.content)
    for (;;) {
      const result = await processDocument(doc.id)
      if (result.status !== 'PROCESSING') {
        console.log(`${result.status === 'READY' ? '✓' : '✗'} ${doc.title}${result.message ? ` — ${result.message}` : ''}`)
        break
      }
      if (result.retryAfter) await sleep(result.retryAfter * 1000)
    }
  }
  await db.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
