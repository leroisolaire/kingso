import 'server-only'
import { randomUUID } from 'node:crypto'
import type { DocumentStatus } from '@prisma/client'
import { db } from '@/lib/db/client'
import { generateEmbeddings, embeddingToSql, EmbeddingRateLimitError } from '@/lib/ai/embed'
import { getAdminStorageClient, ensurePrivateBucket } from '@/lib/storage/admin'
import { chunkPages } from './chunk'
import { extractDocument } from './extract'

// Pipeline d'un document : fichier (bucket privé) → texte par page → passages → indexation.
// Reprenable : chaque appel avance autant que possible dans le temps imparti, l'appelant
// relance tant que le statut est PROCESSING (gros PDF, limite de débit Voyage…).

export const DOCUMENT_FILES_BUCKET = 'document-files'
const MAX_FILE_SIZE = '50MB'
/** Taille max d'un lot envoyé à Voyage (~8 000 tokens, compatible avec le compte gratuit) */
const BATCH_CHARS = 30_000
/** Une lecture de fichier « en cours » depuis plus longtemps est considérée comme interrompue */
const STALE_EXTRACTION_MS = 5 * 60_000
const READING_MESSAGE = 'Lecture du fichier…'

export interface ProcessResult {
  status: DocumentStatus
  message: string | null
  /** Secondes à attendre avant de relancer (limite de débit) */
  retryAfter?: number
}

function requireStorage() {
  const supabase = getAdminStorageClient()
  if (!supabase) throw new Error('Stockage indisponible : SUPABASE_SERVICE_ROLE_KEY manquante.')
  return supabase
}

/** URL d'envoi direct navigateur → stockage (contourne la limite de 4,5 Mo des requêtes Vercel). */
export async function createUploadTarget(fileName: string) {
  const supabase = requireStorage()
  await ensurePrivateBucket(supabase, DOCUMENT_FILES_BUCKET, MAX_FILE_SIZE)
  const safeName = fileName.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120)
  const path = `${new Date().toISOString().slice(0, 7)}/${randomUUID()}-${safeName}`
  const { data, error } = await supabase.storage.from(DOCUMENT_FILES_BUCKET).createSignedUploadUrl(path)
  if (error || !data) throw new Error(`Stockage : ${error?.message ?? 'URL d\'envoi indisponible'}`)
  return { bucket: DOCUMENT_FILES_BUCKET, path: data.path, token: data.token }
}

export async function getDocumentFileUrl(storagePath: string, expiresIn = 3600): Promise<string | null> {
  const supabase = getAdminStorageClient()
  if (!supabase) return null
  const { data } = await supabase.storage.from(DOCUMENT_FILES_BUCKET).createSignedUrl(storagePath, expiresIn)
  return data?.signedUrl ?? null
}

export async function deleteDocumentFile(storagePath: string) {
  const supabase = getAdminStorageClient()
  if (!supabase) return
  await supabase.storage.from(DOCUMENT_FILES_BUCKET).remove([storagePath])
}

/** Contenu affiché/éditable dans le back-office : pages repérées par un marqueur [Page n]. */
function pagesToContent(pages: string[], paginated: boolean): string {
  if (!paginated) return pages.join('\n\n')
  return pages
    .map((text, i) => (text ? `[Page ${i + 1}]\n${text}` : ''))
    .filter(Boolean)
    .join('\n\n')
}

/** Inverse de pagesToContent : retrouve les pages après une modification manuelle du texte. */
function contentToPages(content: string): { pages: string[]; paginated: boolean } {
  const markers = [...content.matchAll(/^\[Page (\d+)\]\s*$/gm)]
  if (markers.length === 0) return { pages: [content], paginated: false }
  const pages: string[] = []
  markers.forEach((m, i) => {
    const start = m.index! + m[0].length
    const end = i + 1 < markers.length ? markers[i + 1].index! : content.length
    pages[Number(m[1]) - 1] = content.slice(start, end).trim()
  })
  return { pages: Array.from(pages, (p) => p ?? ''), paginated: true }
}

async function setStatus(id: string, status: DocumentStatus, statusMessage: string | null) {
  await db.document.update({ where: { id }, data: { status, statusMessage } })
}

async function replaceChunks(documentId: string, pages: string[], paginated: boolean) {
  const chunks = chunkPages(pages, paginated)
  await db.$transaction([
    db.documentChunk.deleteMany({ where: { documentId } }),
    db.documentChunk.createMany({
      data: chunks.map((c, index) => ({ documentId, index, content: c.content, pageStart: c.pageStart, pageEnd: c.pageEnd })),
    }),
  ])
  return chunks.length
}

/** Redécoupe à partir du texte (création manuelle ou texte modifié dans le back-office). */
export async function rechunkFromContent(documentId: string, content: string) {
  const { pages, paginated } = contentToPages(content)
  const count = await replaceChunks(documentId, pages, paginated)
  await setStatus(documentId, count > 0 ? 'PROCESSING' : 'ERROR', count > 0 ? 'Indexation…' : 'Document vide.')
}

/** Lit le fichier original et crée les passages. */
async function extractFromFile(doc: { id: string; storagePath: string; fileName: string | null }) {
  await setStatus(doc.id, 'PROCESSING', READING_MESSAGE)
  const supabase = requireStorage()
  const { data, error } = await supabase.storage.from(DOCUMENT_FILES_BUCKET).download(doc.storagePath)
  if (error || !data) throw new Error('Fichier introuvable dans le stockage. Réimportez-le.')

  const buffer = Buffer.from(await data.arrayBuffer())
  const extracted = await extractDocument(buffer, doc.fileName ?? doc.storagePath)
  const content = pagesToContent(extracted.pages, extracted.paginated)
  if (!content.replace(/\[Page \d+\]/g, '').trim()) throw new Error('Aucun texte lisible dans ce fichier.')

  await db.document.update({
    where: { id: doc.id },
    data: { content, pageCount: extracted.paginated ? extracted.pages.length : null },
  })
  await replaceChunks(doc.id, extracted.pages, extracted.paginated)
}

export async function processDocument(id: string, budgetMs = 240_000): Promise<ProcessResult> {
  const started = Date.now()
  const doc = await db.document.findUnique({
    where: { id },
    select: { id: true, title: true, status: true, statusMessage: true, storagePath: true, fileName: true, updatedAt: true },
  })
  if (!doc) throw new Error('Document introuvable.')
  if (doc.status === 'READY' || doc.status === 'ERROR') return { status: doc.status, message: doc.statusMessage }

  try {
    const chunkCount = await db.documentChunk.count({ where: { documentId: id } })
    if (chunkCount === 0) {
      if (!doc.storagePath) throw new Error('Aucun contenu à indexer.')
      // Une autre requête est déjà en train de lire ce fichier
      if (doc.statusMessage === READING_MESSAGE && Date.now() - doc.updatedAt.getTime() < STALE_EXTRACTION_MS) {
        return { status: 'PROCESSING', message: READING_MESSAGE, retryAfter: 10 }
      }
      await extractFromFile({ id, storagePath: doc.storagePath, fileName: doc.fileName })
    }

    const total = await db.documentChunk.count({ where: { documentId: id } })
    while (Date.now() - started < budgetMs) {
      const pending = await db.$queryRaw<Array<{ id: string; content: string }>>`
        SELECT id, content FROM "DocumentChunk"
        WHERE "documentId" = ${id} AND embedding IS NULL
        ORDER BY "index" LIMIT 64
      `
      if (pending.length === 0) {
        await setStatus(id, 'READY', null)
        return { status: 'READY', message: null }
      }

      const batch: typeof pending = []
      let chars = 0
      for (const chunk of pending) {
        if (batch.length > 0 && chars + chunk.content.length > BATCH_CHARS) break
        batch.push(chunk)
        chars += chunk.content.length
      }

      // Le titre du document donne le contexte du passage (marque, modèle…)
      const embeddings = await generateEmbeddings(batch.map((c) => `${doc.title}\n\n${c.content}`), 'document')
      for (const [i, chunk] of batch.entries()) {
        await db.$executeRaw`UPDATE "DocumentChunk" SET embedding = ${embeddingToSql(embeddings[i])}::vector WHERE id = ${chunk.id}`
      }

      const remaining = await db.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) AS count FROM "DocumentChunk" WHERE "documentId" = ${id} AND embedding IS NULL
      `
      await setStatus(id, 'PROCESSING', `Indexation : ${total - Number(remaining[0].count)} / ${total} passages`)
    }
    const current = await db.document.findUnique({ where: { id }, select: { statusMessage: true } })
    return { status: 'PROCESSING', message: current?.statusMessage ?? null }
  } catch (error) {
    if (error instanceof EmbeddingRateLimitError) {
      const message = 'Pause imposée par Voyage AI (compte gratuit), reprise automatique…'
      await setStatus(id, 'PROCESSING', message)
      return { status: 'PROCESSING', message, retryAfter: 25 }
    }
    const message = error instanceof Error ? error.message : String(error)
    console.error('[processDocument]', id, message)
    await setStatus(id, 'ERROR', message.slice(0, 500))
    return { status: 'ERROR', message }
  }
}
