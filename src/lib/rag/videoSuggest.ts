import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { Prisma } from '@prisma/client'
import { generateEmbedding, embeddingToSql } from '@/lib/ai/embed'
import { db } from '@/lib/db/client'
import type { Document } from '@/types/document'

// Vidéo de démonstration ajoutée APRÈS la réponse : la recherche, faite avant, part de la question
// (« 070 », « oui »), alors que la procédure donnée (ex. nettoyer le filtre) n'apparaît qu'en lisant
// la documentation. On cherche donc une fiche vidéo proche de la réponse, puis Haiku vérifie qu'elle
// montre bien la même opération sur le même appareil avant d'ajouter son lien.

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MODEL = 'claude-haiku-5-5'
const VIDEO_LINK = /https:\/\/(drive\.google\.com\/file|(www\.)?youtube\.com\/watch|youtu\.be\/)/
/** Vidéo tournée par l'équipe et déposée dans le Drive (à préférer à une vidéo YouTube). */
export const isTeamVideo = (url: string) => url.startsWith('https://drive.google.com/')

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['videos'],
  properties: {
    videos: { type: 'array', items: { type: 'integer' }, description: 'Numéros des vidéos qui conviennent (liste vide si aucune)' },
  },
} as const

export async function suggestVideo(params: {
  answer: string
  conversation: string
  scope: { types: Document['type'][]; categoryIds: string[] | null }
}): Promise<{ documentId: string; title: string; url: string } | null> {
  const { answer, conversation, scope } = params
  // Seulement pour une procédure (étapes numérotées), et si la réponse ne donne pas déjà une vidéo
  if (VIDEO_LINK.test(answer) || !/^\s*\d+\.\s/m.test(answer)) return null
  if (scope.types.length === 0 || (scope.categoryIds !== null && scope.categoryIds.length === 0)) return null

  const vec = embeddingToSql(await generateEmbedding(answer.slice(0, 3000), 'query'))
  const categoryFilter = scope.categoryIds === null
    ? Prisma.empty
    : Prisma.sql`AND d."categoryId" = ANY(${scope.categoryIds}::text[])`
  // Meilleur passage de chaque vidéo, puis les vidéos les plus proches de la réponse
  const candidates = await db.$queryRaw<Array<{ documentId: string; title: string; url: string; content: string }>>`
    SELECT * FROM (
    SELECT DISTINCT ON (t."documentId") t.* FROM (
      SELECT d.id AS "documentId", d.title, ch.content,
             substring(d.content from '(https://(www[.])?(youtube[.]com/watch[?]v=|youtu[.]be/|drive[.]google[.]com/file/d/)[^[:space:]]+)') AS url,
             ch.embedding <=> ${vec}::vector AS distance
      FROM "DocumentChunk" ch
      JOIN "Document" d ON d.id = ch."documentId"
      WHERE ch.embedding IS NOT NULL
        AND d."reviewState" IS NULL
        AND d.type = ANY(${scope.types}::"DocumentType"[])
        AND d.content ~ '(https://(www[.])?(youtube[.]com/watch[?]v=|youtu[.]be/|drive[.]google[.]com/file/d/)[^[:space:]]+)'
        ${categoryFilter}
      ORDER BY distance
      LIMIT 6
    ) t
    ORDER BY t."documentId", t.distance
    ) best
    ORDER BY best.distance
  `
  const videos = candidates.filter((c) => c.url).slice(0, 3)
  if (videos.length === 0) return null

  const list = videos.map((v, i) => `${i + 1}. ${v.title}\n${v.content.slice(0, 700)}`).join('\n\n')
  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2000,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{
      role: 'user',
      content: `Un assistant SAV vient de répondre à un client. Une de ces vidéos de démonstration montre-t-elle la MÊME opération que celle décrite dans la réponse, sur la même marque et la même gamme d'appareil ? Une vidéo sur un autre sujet, une autre opération ou une autre marque ne convient pas.

Conversation (messages du client) :
${conversation.slice(-1500)}

Réponse de l'assistant :
${answer.slice(0, 3000)}

Vidéos disponibles :
${list}

Réponds avec les numéros de toutes les vidéos qui conviennent (liste vide si aucune).`,
    }],
  })
  const text = message.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('')
  const matching = (JSON.parse(text) as { videos: number[] }).videos
    .map((n) => videos[n - 1])
    .filter((v): v is (typeof videos)[number] => Boolean(v))
  // Les vidéos de l'équipe (déposées dans le Drive) passent avant celles de YouTube
  const video = matching.find((v) => isTeamVideo(v.url)) ?? matching[0]
  return video ? { documentId: video.documentId, title: video.title, url: video.url } : null
}
