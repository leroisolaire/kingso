// TODO: Remplacer chaque fonction par une requête Prisma
import { MOCK_FAQS } from '../fixtures'
import type { Faq } from '@/types/faq'

export async function getAllFaqs(): Promise<Faq[]> {
  // TODO: return db.faq.findMany({ orderBy: { order: 'asc' } })
  return MOCK_FAQS
}

export async function getPublishedFaqs(): Promise<Faq[]> {
  // TODO: return db.faq.findMany({ where: { published: true }, orderBy: { order: 'asc' } })
  return MOCK_FAQS.filter((f) => f.published)
}

export async function getFaqById(id: string): Promise<Faq | null> {
  // TODO: return db.faq.findUnique({ where: { id } })
  return MOCK_FAQS.find((f) => f.id === id) ?? null
}

export async function createFaq(
  data: Omit<Faq, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Faq> {
  // TODO: return db.faq.create({ data })
  throw new Error('createFaq: non implémenté (attente Prisma)')
}

export async function updateFaq(
  id: string,
  data: Partial<Omit<Faq, 'id' | 'createdAt'>>
): Promise<Faq> {
  // TODO: return db.faq.update({ where: { id }, data })
  throw new Error('updateFaq: non implémenté (attente Prisma)')
}

export async function deleteFaq(id: string): Promise<void> {
  // TODO: return db.faq.delete({ where: { id } })
  throw new Error('deleteFaq: non implémenté (attente Prisma)')
}
