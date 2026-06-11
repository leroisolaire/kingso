// TODO: Brancher pgvector pour la recherche sémantique :
//   SELECT id, title, 1 - (embedding <=> $1) AS similarity
//   FROM documents WHERE type IN ($types)
//   ORDER BY similarity DESC LIMIT $k
// TODO: Filtrer selon le type de document (PUBLIC / INTERNAL / FRANCHISE)
//   en fonction du rôle de l'utilisateur connecté.

import { MOCK_DOCUMENTS } from '../db/fixtures'
import type { Document } from '@/types/document'

export interface SearchResult {
  document: Document
  score: number
}

export async function searchDocuments(
  query: string,
  topK: number = 3,
  types: Document['type'][] = ['PUBLIC']
): Promise<SearchResult[]> {
  // TODO: Générer l'embedding de `query` puis faire une recherche vectorielle
  // const queryEmbedding = await generateEmbedding(query)
  // return vectorSearch(queryEmbedding, topK, types)

  // Mock : retourne les N premiers documents du bon type
  const filtered = MOCK_DOCUMENTS.filter((d) => types.includes(d.type))
  return filtered.slice(0, topK).map((doc, i) => ({
    document: doc,
    score: 0.95 - i * 0.1,
  }))
}
