import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import type { VideoInfo } from './youtube'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
// Tri sur titre + description : Haiku 5.5, par lots, effort bas
const MODEL = 'claude-haiku-5-5'
const BATCH = 25

export interface VideoVerdict {
  videoId: string
  relevant: boolean
  topic: string
  reason: string
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['videos'],
  properties: {
    videos: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['videoId', 'relevant', 'topic', 'reason'],
        properties: {
          videoId: { type: 'string' },
          relevant: { type: 'boolean' },
          topic: { type: 'string', description: 'dépannage, code erreur, entretien, réglage, utilisation, installation, commercial, événement, autre' },
          reason: { type: 'string', description: 'Quelques mots' },
        },
      },
    },
  },
} as const

/** Garde uniquement les vidéos qui aident à dépanner, entretenir ou utiliser un équipement. */
export async function triageVideos(channelName: string, videos: VideoInfo[]): Promise<VideoVerdict[]> {
  const verdicts: VideoVerdict[] = []
  for (let i = 0; i < videos.length; i += BATCH) {
    const batch = videos.slice(i, i + BATCH)
    const list = batch
      .map((v) => `- ${v.videoId} | ${v.title} | ${v.description.replace(/\s+/g, ' ').slice(0, 300)}`)
      .join('\n')
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 8000,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{
        role: 'user',
        content: `Vidéos de la chaîne YouTube « ${channelName} » (identifiant | titre | début de description).
Le Roi Solaire installe et entretient des pompes à chaleur, climatisations, chauffe-eau thermodynamiques et panneaux solaires. Il ne garde que les vidéos qui AIDENT À DÉPANNER, ENTRETENIR, RÉGLER OU UTILISER un équipement : résoudre un code erreur ou une alarme, réinitialiser, appairer une application ou un thermostat, nettoyer un filtre, régler la température, comprendre un voyant, mode secours, mise en service et paramétrage.
Écarte : publicités, lancements et présentations de gamme, salons et événements, vœux, interviews, témoignages, références de chantier, vidéos de recrutement.
Pour chaque vidéo : relevant (true si elle est à garder), topic, reason (quelques mots).

${list}`,
      }],
    })
    const text = message.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('')
    const parsed = JSON.parse(text) as { videos: VideoVerdict[] }
    const byId = new Map(parsed.videos.map((v) => [v.videoId, v]))
    for (const v of batch) {
      verdicts.push(byId.get(v.videoId) ?? { videoId: v.videoId, relevant: false, topic: 'autre', reason: 'non évaluée' })
    }
  }
  return verdicts
}
