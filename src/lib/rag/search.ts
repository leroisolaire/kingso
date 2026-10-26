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
  /** Ex. « PAC > Hitachi > Yutaki 2016 » — aide Kingso à ne pas mélanger marques et générations */
  categoryPath?: string
  /** Ex. « p. 12 » ou « p. 12-13 » */
  pages?: string
  /** Fiche tirée d'une vidéo (YouTube ou Drive) : lien de la vidéo, à donner au client */
  videoUrl?: string
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

/**
 * Provenance donnée à Kingso : le chemin dans le Drive quand il existe (plus précis que la
 * catégorie, ex. « PAC > Hitachi > Yutaki 2016 > Codes erreur »), sans le dossier de visibilité.
 */
function originLabel(drivePath: string | null, categoryPath: string | null): string | undefined {
  const folders = drivePath?.split('/').filter(Boolean).slice(1) ?? []
  if (folders.length > 0) return folders.join(' > ')
  return categoryPath ?? undefined
}

function pageLabel(start: number | null, end: number | null): string | undefined {
  if (!start) return undefined
  return end && end !== start ? `p. ${start}-${end}` : `p. ${start}`
}

/**
 * Codes cités dans la question (« 077 », « E5 », « G45 ») : la recherche par le sens les retrouve mal,
 * on cherche donc aussi les documents dont le TITRE contient le code, avec ou sans zéros initiaux.
 * Renvoie des motifs d'expression régulière Postgres.
 */
export function codePatterns(text: string): string[] {
  const patterns = new Set<string>()
  for (const m of text.matchAll(/(?<![\p{L}\d.,])([A-Za-z]{0,2})0*(\d{1,4})(?![\p{L}\d]|[.,]\d)/gu)) {
    const [whole, prefix, num] = m
    if (!prefix && num.length < 2) continue // chiffre isolé : trop vague
    if (!prefix && /^(19|20)\d{2}$/.test(whole)) continue // année (génération 2016…)
    patterns.add(`(^|[^0-9a-z])${prefix.toLowerCase()}0*${num}([^0-9]|$)`)
  }
  return [...patterns]
}

/**
 * Recherche les passages les plus proches de la question, dans les documents
 * (découpés en passages) et les pages web autorisés.
 */
export async function searchPassages(query: string, scope: SearchScope, limit = 8, codeText = query): Promise<SearchResult[]> {
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

  type DocRow = {
    chunkId: string; documentId: string; title: string; content: string; fileUrl: string | null
    pageStart: number | null; pageEnd: number | null; categoryPath: string | null; drivePath: string | null
    videoUrl: string | null
  }
  // Les plus récents d'abord (le dernier code cité compte le plus)
  const codes = searchDocs ? codePatterns(codeText).reverse().slice(0, 5) : []

  const [docs, pages, codeDocs] = await Promise.all([
    searchDocs && docLimit > 0
      ? db.$queryRaw<DocRow[]>`
          SELECT ch.id AS "chunkId", d.id AS "documentId", d.title, ch.content, d."fileUrl", ch."pageStart", ch."pageEnd", d."drivePath",
                 substring(d.content from 'Lien de la vidéo : (https://[^[:space:]]+)') AS "videoUrl",
                 CASE WHEN p.name IS NOT NULL THEN p.name || ' > ' || c.name ELSE c.name END AS "categoryPath"
          FROM "DocumentChunk" ch
          JOIN "Document" d ON d.id = ch."documentId"
          LEFT JOIN "Category" c ON c.id = d."categoryId"
          LEFT JOIN "Category" p ON p.id = c."parentId"
          WHERE ch.embedding IS NOT NULL
            AND d."reviewState" IS NULL -- à trier, confidentiel ou écarté : jamais utilisé par les chats
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
    // Documents dont le titre porte le code cité (ex. « Message 77 ou 78 » pour « 077 »)
    codes.length > 0
      ? db.$queryRaw<DocRow[]>`
          SELECT ch.id AS "chunkId", d.id AS "documentId", d.title, ch.content, d."fileUrl", ch."pageStart", ch."pageEnd", d."drivePath",
                 substring(d.content from 'Lien de la vidéo : (https://[^[:space:]]+)') AS "videoUrl",
                 CASE WHEN p.name IS NOT NULL THEN p.name || ' > ' || c.name ELSE c.name END AS "categoryPath"
          FROM "DocumentChunk" ch
          JOIN "Document" d ON d.id = ch."documentId"
          LEFT JOIN "Category" c ON c.id = d."categoryId"
          LEFT JOIN "Category" p ON p.id = c."parentId"
          WHERE ch.embedding IS NOT NULL
            AND d."reviewState" IS NULL
            AND d.type = ANY(${scope.types}::"DocumentType"[])
            AND d.title ~* ANY(${codes}::text[])
            ${categoryFilter}
          ORDER BY ch.embedding <=> ${vec}::vector
          LIMIT 4
        `
      : [],
  ])

  // Passages trouvés par le code en tête (sans doublon), puis ceux trouvés par le sens
  const seenChunks = new Set<string>()
  const merged = [...codeDocs, ...docs].filter((d) => !seenChunks.has(d.chunkId) && seenChunks.add(d.chunkId))

  return [
    ...merged.map((d) => ({
      id: d.documentId,
      title: d.title,
      content: d.content,
      source: 'document' as const,
      // Seuls les anciens documents (bucket public) ont une URL ; les fichiers importés restent privés
      url: d.fileUrl ?? undefined,
      categoryPath: originLabel(d.drivePath, d.categoryPath),
      pages: pageLabel(d.pageStart, d.pageEnd),
      videoUrl: d.videoUrl ?? undefined,
    })),
    ...pages.map((p) => ({ id: p.id, title: p.title, content: p.content, source: 'webpage' as const, url: p.url })),
  ]
}

/** Recherche limitée au périmètre d'un chat configuré dans le back-office. */
export async function searchScoped(
  query: string,
  scope: { types: Document['type'][]; categoryIds: string[]; webSourceIds: string[] },
  limit = 8,
  codeText?: string,
): Promise<SearchResult[]> {
  return searchPassages(query, scope, limit, codeText ?? query)
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
      const link = r.videoUrl ? ` (FICHE VIDÉO — lien à donner au client : ${r.videoUrl} )` : r.url ? ` (URL : ${r.url})` : ''
      const header = `[${origin}]${link}`
      return `${header}\n${r.content}`
    })
    .join('\n\n---\n\n')
}

/** Ids distincts des documents / pages utilisés (pour l'historique). */
export function sourceIds(results: SearchResult[]): string[] {
  return [...new Set(results.map((r) => r.id))]
}
