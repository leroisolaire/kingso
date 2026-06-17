import { db } from '../client'
import type { Category } from '@/types/category'

function serialize(c: { createdAt: Date; [key: string]: unknown }): Category {
  return { ...c, createdAt: c.createdAt.toISOString() } as Category
}

export async function getAllCategories(): Promise<Category[]> {
  const cats = await db.category.findMany({ orderBy: { name: 'asc' } })
  return cats.map(serialize)
}

export async function getCategoryById(id: string): Promise<Category | null> {
  const cat = await db.category.findUnique({ where: { id } })
  return cat ? serialize(cat) : null
}

export async function createCategory(
  data: Omit<Category, 'id' | 'createdAt'>
): Promise<Category> {
  const cat = await db.category.create({ data })
  return serialize(cat)
}

export async function updateCategory(
  id: string,
  data: Partial<Omit<Category, 'id' | 'createdAt'>>
): Promise<Category> {
  const cat = await db.category.update({ where: { id }, data })
  return serialize(cat)
}

export async function deleteCategory(id: string): Promise<void> {
  await db.category.delete({ where: { id } })
}
