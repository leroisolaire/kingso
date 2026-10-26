import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import type { HomeTile } from '@/types/assistant'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
// Orientation : réponse courte et structurée, Haiku 5.5 effort bas (rapide, quasi gratuit)
const MODEL = 'claude-haiku-5-5'

export interface RouteDecision {
  /** Chat le plus adapté, ou null : la question reste dans le chat d'accueil */
  target: string | null
  /** Question ambiguë : chats possibles à proposer au visiteur */
  alternatives: string[]
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['target', 'alternatives'],
  properties: {
    target: { type: 'string', description: 'Identifiant du chat le plus adapté, ou chaîne vide' },
    alternatives: { type: 'array', items: { type: 'string' }, description: 'Si la question est ambiguë : 2 ou 3 identifiants possibles, sinon liste vide' },
  },
} as const

/** Choisit le chat spécialisé le plus adapté à la première question d'un visiteur. */
export async function routeQuestion(question: string, tiles: HomeTile[]): Promise<RouteDecision> {
  if (tiles.length === 0) return { target: null, alternatives: [] }
  const list = tiles.map((t) => `- ${t.slug} : ${t.title}${t.description ? ` — ${t.description}` : ''}`).join('\n')

  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1000,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{
      role: 'user',
      content: `Un visiteur du site de Le Roi Solaire pose cette question à l'assistant d'accueil :
« ${question.slice(0, 1000)} »

Chats spécialisés disponibles (identifiant : sujet) :
${list}

Indique le chat spécialisé qui répondra le mieux.
- target : l'identifiant du chat si la question relève clairement de l'un d'eux ; chaîne vide si elle est générale, hors sujet, ou ne correspond à aucun (le chat d'accueil y répondra).
- alternatives : uniquement si la question pourrait relever de plusieurs chats sans qu'on puisse trancher, leurs identifiants (2 ou 3) ; sinon une liste vide. Dans ce cas, target est vide.`,
    }],
  })

  const text = message.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('')
  const parsed = JSON.parse(text) as { target: string; alternatives: string[] }
  const known = new Set(tiles.map((t) => t.slug))
  const alternatives = (parsed.alternatives ?? []).filter((s) => known.has(s)).slice(0, 3)
  const target = known.has(parsed.target) && alternatives.length === 0 ? parsed.target : null
  return { target, alternatives: alternatives.length > 1 ? alternatives : [] }
}
