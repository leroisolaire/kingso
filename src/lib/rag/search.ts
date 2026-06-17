import { generateEmbedding, embeddingToSql } from '@/lib/ai/embed'
import { db } from '@/lib/db/client'
import type { Document } from '@/types/document'

export interface SearchResult {
  id: string
  title: string
  content: string
  source: 'document' | 'webpage'
  url?: string
}

export async function searchKnowledge(query: string, limit = 5): Promise<SearchResult[]> {
  const embedding = await generateEmbedding(query)
  const vec = embeddingToSql(embedding)
  const half = Math.ceil(limit / 2)

  // Recherche dans les documents
  const docs = await db.$queryRaw<Array<{ id: string; title: string; content: string; fileUrl: string | null }>>`
    SELECT id, title, content, "fileUrl"
    FROM "Document"
    WHERE embedding IS NOT NULL
    ORDER BY embedding <=> ${vec}::vector
    LIMIT ${half}
  `

  // Recherche dans les pages web
  const pages = await db.$queryRaw<Array<{ id: string; title: string; content: string; url: string }>>`
    SELECT id, title, content, url
    FROM "WebPage"
    WHERE embedding IS NOT NULL
    ORDER BY embedding <=> ${vec}::vector
    LIMIT ${half}
  `

  return [
    ...docs.map((d) => ({ id: d.id, title: d.title, content: d.content, source: 'document' as const, url: d.fileUrl ?? undefined })),
    ...pages.map((p) => ({ id: p.id, title: p.title, content: p.content, source: 'webpage' as const, url: p.url })),
  ]
}

// Compat — utilisé par l'ancien code
export async function searchDocuments(
  query: string,
  topK = 5,
  _types: Document['type'][] = ['PUBLIC'],
) {
  const results = await searchKnowledge(query, topK)
  return results.map((r, i) => ({
    document: {
      id: r.id, title: r.title, content: r.content,
      type: 'PUBLIC' as Document['type'],
      categoryId: null, fileUrl: r.url ?? null,
      createdAt: '', updatedAt: '',
    },
    score: 1 - i * 0.05,
  }))
}
