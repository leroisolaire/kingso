import { searchDocuments as vectorSearch } from '@/lib/db/queries/documents'
import type { Document } from '@/types/document'

export interface SearchResult {
  document: Document
  score: number
}

export async function searchDocuments(
  query: string,
  topK: number = 5,
  types: Document['type'][] = ['PUBLIC']
): Promise<SearchResult[]> {
  const docs = await vectorSearch(query, topK)
  return docs
    .filter((d) => types.includes(d.type))
    .map((doc, i) => ({ document: doc, score: 1 - i * 0.05 }))
}
