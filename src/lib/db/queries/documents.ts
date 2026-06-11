// TODO: Remplacer chaque fonction par une requête Prisma (db.document.findMany, etc.)
import { MOCK_DOCUMENTS } from '../fixtures'
import type { Document } from '@/types/document'

export async function getAllDocuments(): Promise<Document[]> {
  // TODO: return db.document.findMany({ orderBy: { createdAt: 'desc' } })
  return MOCK_DOCUMENTS
}

export async function getDocumentById(id: string): Promise<Document | null> {
  // TODO: return db.document.findUnique({ where: { id } })
  return MOCK_DOCUMENTS.find((d) => d.id === id) ?? null
}

export async function getPublicDocuments(): Promise<Document[]> {
  // TODO: return db.document.findMany({ where: { type: 'PUBLIC' } })
  return MOCK_DOCUMENTS.filter((d) => d.type === 'PUBLIC')
}

export async function createDocument(
  data: Omit<Document, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Document> {
  // TODO: return db.document.create({ data })
  throw new Error('createDocument: non implémenté (attente Prisma)')
}

export async function updateDocument(
  id: string,
  data: Partial<Omit<Document, 'id' | 'createdAt'>>
): Promise<Document> {
  // TODO: return db.document.update({ where: { id }, data })
  throw new Error('updateDocument: non implémenté (attente Prisma)')
}

export async function deleteDocument(id: string): Promise<void> {
  // TODO: return db.document.delete({ where: { id } })
  throw new Error('deleteDocument: non implémenté (attente Prisma)')
}
