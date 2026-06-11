export type DocumentType = 'PUBLIC' | 'INTERNAL' | 'FRANCHISE'

export interface Document {
  id: string
  title: string
  content: string
  type: DocumentType
  categoryId: string | null
  createdAt: string
  updatedAt: string
}
