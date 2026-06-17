export interface Category {
  id: string
  name: string
  description: string | null
  parentId: string | null
  createdAt: string
}
