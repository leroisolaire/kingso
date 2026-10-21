import { Prisma } from '@prisma/client'
import { generateEmbedding, embeddingToSql } from '@/lib/ai/embed'
import { db } from '@/lib/db/client'
import type { Document } from '@/types/document'

export interface SearchResult {
  /** Id du document (ou de la page web) d'où vient le passage */
  id: string
  title: string
  content: string
  source: 'document' | 'webpage'
  url?: string
  /** Ex. « Pompes à chaleur > Hitachi » — aide Kingso à ne pas mélanger les marques */
  categoryPath?: string
  /** Ex. « p. 12 » ou « p. 12-13 » */
  pages?: string
}

/** Pour compatibilité avec le code existant */
export type ScopedSearchResult = SearchResult

export interface SearchScope {
  types: Document['type'][]
  /** Catégories (déjà étendues à leurs descendantes) ; null = toutes ; vide = aucun document */
  categoryIds: string[] | null
  /** Sources web autorisées ; null = toutes ; vide = aucune page web */
  webSourceIds: string[] | null
}

function pageLabel(start: number | null, end: number | null): string | undefined {
  if (!start) return undefined
  return end && end !== start ? `p. ${start}-${end}` : `p. ${start}`
}

/**
 * Recherche les passages les plus proches de la question, dans les documents
 * (découpés en passages) et les pages web autorisés.
 */
export async function searchPassages(query: string, scope: SearchScope, limit = 8): Promise<SearchResult[]> {
  const searchDocs = scope.types.length > 0 && (scope.categoryIds === null || scope.categoryIds.length > 0)
  const searchPages = scope.webSourceIds === null || scope.webSourceIds.length > 0
  if (!searchDocs && !searchPages) return []

  const vec = embeddingToSql(await generateEmbedding(query, 'query'))
  // Les documents de la base priment sur les pages web
  const pageLimit = searchPages ? (searchDocs ? Math.max(1, Math.floor(limit / 4)) : limit) : 0
  const docLimit = limit - pageLimit

  const categoryFilter = scope.categoryIds === null
    ? Prisma.empty
    : Prisma.sql`AND d."categoryId" = ANY(${scope.categoryIds}::text[])`
  const sourceFilter = scope.webSourceIds === null
    ? Prisma.empty
    : Prisma.sql`AND "sourceId" = ANY(${scope.webSourceIds}::text[])`

  const [docs, pages] = await Promise.all([
    searchDocs && docLimit > 0
      ? db.$queryRaw<Array<{
          documentId: string; title: string; content: string; fileUrl: string | null
          pageStart: number | null; pageEnd: number | null; categoryPath: string | null
        }>>`
          SELECT d.id AS "documentId", d.title, ch.content, d."fileUrl", ch."pageStart", ch."pageEnd",
                 CASE WHEN p.name IS NOT NULL THEN p.name || ' > ' || c.name ELSE c.name END AS "categoryPath"
          FROM "DocumentChunk" ch
          JOIN "Document" d ON d.id = ch."documentId"
          LEFT JOIN "Category" c ON c.id = d."categoryId"
          LEFT JOIN "Category" p ON p.id = c."parentId"
          WHERE ch.embedding IS NOT NULL
            AND d.type = ANY(${scope.types}::"DocumentType"[])
            ${categoryFilter}
          ORDER BY ch.embedding <=> ${vec}::vector
          LIMIT ${docLimit}
        `
      : [],
    pageLimit > 0
      ? db.$queryRaw<Array<{ id: string; title: string; content: string; url: string }>>`
          SELECT id, title, content, url
          FROM "WebPage"
          WHERE embedding IS NOT NULL ${sourceFilter}
          ORDER BY embedding <=> ${vec}::vector
          LIMIT ${pageLimit}
        `
      : [],
  ])

  return [
    ...docs.map((d) => ({
      id: d.documentId,
      title: d.title,
      content: d.content,
      source: 'document' as const,
      // Seuls les anciens documents (bucket public) ont une URL ; les fichiers importés restent privés
      url: d.fileUrl ?? undefined,
      categoryPath: d.categoryPath ?? undefined,
      pages: pageLabel(d.pageStart, d.pageEnd),
    })),
    ...pages.map((p) => ({ id: p.id, title: p.title, content: p.content, source: 'webpage' as const, url: p.url })),
  ]
}

/** Recherche limitée au périmètre d'un chat configuré dans le back-office. */
export async function searchScoped(
  query: string,
  scope: { types: Document['type'][]; categoryIds: string[]; webSourceIds: string[] },
  limit = 8,
): Promise<SearchResult[]> {
  return searchPassages(query, scope, limit)
}

/** Recherche de l'assistant général (/chat) : toutes catégories, toutes pages web. */
export async function searchKnowledge(
  query: string,
  limit = 6,
  types: Document['type'][] = ['PUBLIC'],
): Promise<SearchResult[]> {
  return searchPassages(query, { types, categoryIds: null, webSourceIds: null }, limit)
}

/** Texte de contexte envoyé à Claude : un bloc par passage, avec sa provenance. */
export function formatContext(results: SearchResult[]): string {
  return results
    .map((r) => {
      const origin = [r.categoryPath, r.title, r.pages].filter(Boolean).join(' — ')
      const header = r.url ? `[${origin}] (URL : ${r.url})` : `[${origin}]`
      return `${header}\n${r.content}`
    })
    .join('\n\n---\n\n')
}

/** Ids distincts des documents / pages utilisés (pour l'historique). */
export function sourceIds(results: SearchResult[]): string[] {
  return [...new Set(results.map((r) => r.id))]
}
