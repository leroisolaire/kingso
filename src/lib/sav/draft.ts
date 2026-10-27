import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import type { SavCase, SavClient } from '@prisma/client'
import { expandCategoryIds } from '@/lib/db/queries/assistants'
import { db } from '@/lib/db/client'
import { formatContext, searchPassages } from '@/lib/rag/search'
import { formatParisDate } from './schedule'
import type { SavSettings } from './settings'
import { fillTemplate, type EmailTemplate } from './templates'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MODEL = 'claude-haiku-5-5'

/** Adresse publique de Kingso (liens envoyés aux clients). */
export function caseLink(token: string): string {
  return `${process.env.KINGSO_PUBLIC_URL ?? 'https://kingso.fr'}/s/${token}`
}

/**
 * « Kingso peut aider » : une ou deux phrases sur ce problème, tirées UNIQUEMENT de la documentation
 * (signification du code, réglable par le client). Vide si la documentation n'en dit rien.
 */
async function explanation(c: SavCase): Promise<string> {
  if (!c.assistantId) return ''
  const assistant = await db.assistant.findUnique({ where: { id: c.assistantId }, include: { categories: true } })
  if (!assistant) return ''
  const query = [c.equipment, c.clientQuestion ?? c.summary, c.errorCode ? `code ${c.errorCode}` : ''].filter(Boolean).join(' ')
  const passages = await searchPassages(query, {
    types: ['PUBLIC'],
    categoryIds: await expandCategoryIds(assistant.categories.map((cat) => cat.id)),
    webSourceIds: [],
  }, 6)
  if (passages.length === 0) return ''

  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1500,
    output_config: { effort: 'low' },
    messages: [{
      role: 'user',
      content: `Tu rédiges un passage d'un email du SAV de Le Roi Solaire à un client qui a laissé ce message : « ${c.clientQuestion ?? c.summary} »${c.equipment ? ` (équipement : ${c.equipment})` : ''}.

Écris une ou deux phrases simples, en vouvoyant, qui expliquent ce que signifie son problème ou son code et, si la documentation le dit, que c'est un réglage ou une vérification qu'il peut faire lui-même. Appuie-toi UNIQUEMENT sur la documentation ci-dessous : si elle ne correspond pas clairement à son problème et à sa marque, réponds exactement « VIDE ». Pas de procédure détaillée (l'assistant le guidera), pas de promesse, pas de formule de politesse, pas de markdown.

Documentation :
${formatContext(passages)}`,
    }],
  })
  const text = message.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('').trim()
  return !text || /^VIDE\b/i.test(text) ? '' : text
}

const titleCase = (w: string) => w.toLowerCase().replace(/(^|[-'])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase())

/**
 * « Bonjour M. et Mme Dupont, » à partir du fichier client (« M. et Mme DUPONT Jean ») : civilité + nom de famille
 * (les mots en majuscules, sinon le premier mot). Les noms transcrits du répondeur, peu fiables, ne sont jamais utilisés.
 */
export function salutation(client: Pick<SavClient, 'name'> | null): string {
  const m = client?.name?.trim().match(/^(M\. et Mme|Mme|M\.|Mlle|Monsieur|Madame)\s+(.+)$/i)
  if (!m) return 'Bonjour,'
  const words = m[2].split(/\s+/)
  const upper = words.filter((w) => /\p{L}{2}/u.test(w) && w === w.toUpperCase())
  const surname = (upper.length ? upper : words.slice(0, 1)).map(titleCase).join(' ')
  return `Bonjour ${m[1]} ${surname},`
}

/** Objet et texte de l'email à partir du modèle et du dossier. */
export async function buildEmail(c: SavCase, client: SavClient | null, template: EmailTemplate, settings: SavSettings) {
  const values: Record<string, string> = {
    salutation: salutation(client),
    date: formatParisDate(c.receivedAt),
    probleme: c.emailProblem || 'votre demande',
    machine: c.equipment ?? 'votre installation',
    lien: caseLink(c.accessToken),
    signature: settings.signature,
    explication: template.body.includes('{{explication}}') ? await explanation(c).catch(() => '') : '',
  }
  return { subject: fillTemplate(template.subject, values), body: fillTemplate(template.body, values) }
}
