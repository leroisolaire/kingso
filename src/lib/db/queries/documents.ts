import { db } from '../client'
import { generateEmbedding, embeddingToSql } from '@/lib/ai/embed'
import type { Document } from '@/types/document'

function serialize(d: { createdAt: Date; updatedAt: Date; category?: { name: string; parent?: { name: string } | null } | null; [key: string]: unknown }): Document {
  const cat = d.category
  const categoryName = cat
    ? cat.parent ? `${cat.parent.name} / ${cat.name}` : cat.name
    : null
  return {
    ...d,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
    categoryName,
  } as Document
}

export async function getAllDocuments(): Promise<Document[]> {
  const docs = await db.document.findMany({
    orderBy: { createdAt: 'desc' },
    include: { category: { include: { parent: true } } },
  })
  return docs.map(serialize)
}

export async function getDocumentById(id: string): Promise<Document | null> {
  const doc = await db.document.findUnique({ where: { id }, include: { category: { include: { parent: true } } } })
  return doc ? serialize(doc) : null
}

export async function getPublicDocuments(): Promise<Document[]> {
  const docs = await db.document.findMany({ where: { type: 'PUBLIC' }, orderBy: { createdAt: 'desc' } })
  return docs.map(serialize)
}

export async function createDocument(
  data: Omit<Document, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Document> {
  const embedding = await generateEmbedding(`${data.title}\n\n${data.content}`)
  const doc = await db.$queryRaw<Document[]>`
    INSERT INTO "Document" (id, title, content, type, "categoryId", "fileUrl", embedding, "createdAt", "updatedAt")
    VALUES (gen_random_uuid()::text, ${data.title}, ${data.content}, ${data.type}::"DocumentType",
            ${data.categoryId}, ${data.fileUrl ?? null}, ${embeddingToSql(embedding)}::vector, NOW(), NOW())
    RETURNING id, title, content, type, "categoryId", "fileUrl", "createdAt", "updatedAt"
  `
  return doc[0]
}

export async function updateDocument(
  id: string,
  data: Partial<Omit<Document, 'id' | 'createdAt'>>
): Promise<Document> {
  if (data.title || data.content) {
    const current = await db.document.findUnique({ where: { id } })
    const title = data.title ?? current?.title ?? ''
    const content = data.content ?? current?.content ?? ''
    const embedding = await generateEmbedding(`${title}\n\n${content}`)
    await db.$executeRaw`
      UPDATE "Document"
      SET title = ${title}, content = ${content},
          type = ${(data.type ?? current?.type)}::"DocumentType",
          "categoryId" = ${data.categoryId ?? current?.categoryId ?? null},
          embedding = ${embeddingToSql(embedding)}::vector,
          "updatedAt" = NOW()
      WHERE id = ${id}
    `
    const updated = await db.document.findUnique({ where: { id } })
    return serialize(updated!)
  }
  const doc = await db.document.update({ where: { id }, data })
  return serialize(doc)
}

export async function deleteDocument(id: string): Promise<void> {
  await db.document.delete({ where: { id } })
}

export async function searchDocuments(query: string, limit = 5): Promise<Document[]> {
  const embedding = await generateEmbedding(query)
  const docs = await db.$queryRaw<Array<Record<string, unknown>>>`
    SELECT id, title, content, type, "categoryId", "fileUrl", "createdAt", "updatedAt"
    FROM "Document"
    ORDER BY embedding <=> ${embeddingToSql(embedding)}::vector
    LIMIT ${limit}
  `
  return docs.map((d) => ({
    id: d.id as string,
    title: d.title as string,
    content: d.content as string,
    type: d.type as Document['type'],
    categoryId: d.categoryId as string | null,
    fileUrl: d.fileUrl as string | null,
    createdAt: d.createdAt instanceof Date ? (d.createdAt as Date).toISOString() : d.createdAt as string,
    updatedAt: d.updatedAt instanceof Date ? (d.updatedAt as Date).toISOString() : d.updatedAt as string,
  }))
}
