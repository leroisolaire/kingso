import { db } from '../client'
import type { Faq } from '@/types/faq'

function serialize(f: { createdAt: Date; updatedAt: Date; [key: string]: unknown }): Faq {
  return { ...f, createdAt: f.createdAt.toISOString(), updatedAt: f.updatedAt.toISOString() } as Faq
}

export async function getAllFaqs(): Promise<Faq[]> {
  const faqs = await db.faq.findMany({ orderBy: { order: 'asc' } })
  return faqs.map(serialize)
}

export async function getPublishedFaqs(): Promise<Faq[]> {
  const faqs = await db.faq.findMany({ where: { published: true }, orderBy: { order: 'asc' } })
  return faqs.map(serialize)
}

export async function getFaqById(id: string): Promise<Faq | null> {
  const faq = await db.faq.findUnique({ where: { id } })
  return faq ? serialize(faq) : null
}

export async function createFaq(
  data: Omit<Faq, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Faq> {
  const faq = await db.faq.create({ data })
  return serialize(faq)
}

export async function updateFaq(
  id: string,
  data: Partial<Omit<Faq, 'id' | 'createdAt'>>
): Promise<Faq> {
  const faq = await db.faq.update({ where: { id }, data })
  return serialize(faq)
}

export async function deleteFaq(id: string): Promise<void> {
  await db.faq.delete({ where: { id } })
}
