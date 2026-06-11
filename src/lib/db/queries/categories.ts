// TODO: Remplacer chaque fonction par une requête Prisma
import { MOCK_CATEGORIES } from '../fixtures'
import type { Category } from '@/types/category'

export async function getAllCategories(): Promise<Category[]> {
  // TODO: return db.category.findMany({ orderBy: { name: 'asc' } })
  return MOCK_CATEGORIES
}

export async function getCategoryById(id: string): Promise<Category | null> {
  // TODO: return db.category.findUnique({ where: { id } })
  return MOCK_CATEGORIES.find((c) => c.id === id) ?? null
}

export async function createCategory(
  data: Omit<Category, 'id' | 'createdAt'>
): Promise<Category> {
  // TODO: return db.category.create({ data })
  throw new Error('createCategory: non implémenté (attente Prisma)')
}

export async function updateCategory(
  id: string,
  data: Partial<Omit<Category, 'id' | 'createdAt'>>
): Promise<Category> {
  // TODO: return db.category.update({ where: { id }, data })
  throw new Error('updateCategory: non implémenté (attente Prisma)')
}

export async function deleteCategory(id: string): Promise<void> {
  // TODO: return db.category.delete({ where: { id } })
  throw new Error('deleteCategory: non implémenté (attente Prisma)')
}
