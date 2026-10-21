import { db } from '../client'
import type { Prisma } from '@prisma/client'
import type { Document, DocumentInput } from '@/types/document'
import { deleteDocumentFile, processDocument, rechunkFromContent } from '@/lib/documents/process'

const categoryInclude = { category: { include: { parent: true } } } satisfies Prisma.DocumentInclude

function serialize(d: { createdAt: Date; updatedAt: Date; category?: { name: string; parent?: { name: string } | null } | null; [key: string]: unknown }): Document {
  const { category: cat, ...rest } = d
  const categoryName = cat
    ? cat.parent ? `${cat.parent.name} / ${cat.name}` : cat.name
    : null
  return {
    ...rest,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
    categoryName,
  } as Document
}

/** Liste du back-office : sans le texte complet (un document peut faire des centaines de pages). */
export async function getAllDocuments(): Promise<Document[]> {
  const docs = await db.document.findMany({
    orderBy: { createdAt: 'desc' },
    omit: { content: true },
    include: { ...categoryInclude, _count: { select: { chunks: true } } },
  })
  return docs.map(({ _count, ...d }) => ({ ...serialize(d), content: '', chunkCount: _count.chunks }))
}

export async function getDocumentById(id: string): Promise<Document | null> {
  const doc = await db.document.findUnique({
    where: { id },
    include: { ...categoryInclude, _count: { select: { chunks: true } } },
  })
  if (!doc) return null
  const { _count, ...d } = doc
  return { ...serialize(d), chunkCount: _count.chunks }
}

export async function findDocumentByHash(contentHash: string) {
  return db.document.findFirst({ where: { contentHash }, select: { id: true, title: true, status: true } })
}

/** Création manuelle (texte saisi) : découpage + indexation immédiate. */
export async function createDocument(data: DocumentInput): Promise<Document> {
  const doc = await db.document.create({
    data: { title: data.title, content: data.content, type: data.type, categoryId: data.categoryId, status: 'PROCESSING' },
  })
  await rechunkFromContent(doc.id, data.content)
  await processDocument(doc.id, 50_000)
  return (await getDocumentById(doc.id))!
}

/** Document créé par l'import : le fichier est envoyé ensuite, puis traité par processDocument. */
export async function createUploadedDocument(data: {
  title: string
  type: Document['type']
  categoryId: string | null
  storagePath: string
  fileName: string
  mimeType: string | null
  fileSize: number
  contentHash: string
}) {
  return db.document.create({
    data: { ...data, content: '', status: 'PENDING', statusMessage: 'En attente du fichier…' },
    select: { id: true },
  })
}

export async function updateDocument(id: string, data: Partial<DocumentInput>): Promise<Document> {
  const current = await db.document.findUniqueOrThrow({ where: { id }, select: { title: true, content: true } })
  const textChanged = (data.title !== undefined && data.title !== current.title)
    || (data.content !== undefined && data.content !== current.content)

  await db.document.update({
    where: { id },
    data: {
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.content !== undefined ? { content: data.content } : {}),
      ...(data.type !== undefined ? { type: data.type } : {}),
      ...(data.categoryId !== undefined ? { categoryId: data.categoryId } : {}),
    },
  })

  // Le titre fait partie de l'indexation de chaque passage : on réindexe aussi s'il change
  if (textChanged) {
    await rechunkFromContent(id, data.content ?? current.content)
    await processDocument(id, 50_000)
  }
  return (await getDocumentById(id))!
}

/** Relance le traitement d'un document en erreur (relecture complète du fichier). */
export async function retryDocument(id: string) {
  const doc = await db.document.findUniqueOrThrow({ where: { id }, select: { storagePath: true, content: true } })
  if (doc.storagePath) {
    await db.documentChunk.deleteMany({ where: { documentId: id } })
    await db.document.update({ where: { id }, data: { status: 'PENDING', statusMessage: 'Relance…' } })
  } else {
    await rechunkFromContent(id, doc.content)
  }
}

export async function deleteDocument(id: string): Promise<void> {
  const doc = await db.document.delete({ where: { id }, select: { storagePath: true } })
  if (doc.storagePath) await deleteDocumentFile(doc.storagePath)
}
