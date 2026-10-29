import 'server-only'
import Anthropic from '@anthropic-ai/sdk'

// Lecture d'un message laissé au SAV (transcription automatique du répondeur) par Haiku :
// qui appelle, pour quel équipement, quel problème, et que faut-il faire (tri).

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MODEL = 'claude-haiku-5-5'

export const PRODUCTS = ['PAC', 'CLIM', 'CET', 'PV', 'BATTERIE', 'AUTRE', 'INCONNU'] as const
export type Product = (typeof PRODUCTS)[number]
export const CATEGORIES = ['SELF_HELP', 'INTERVENTION', 'ADMIN', 'OTHER_PRODUCT', 'UNCLEAR'] as const
export type Category = (typeof CATEGORIES)[number]

export interface MessageAnalysis {
  customerName: string
  city: string
  postalCode: string
  address: string
  product: Product
  equipment: string
  summary: string
  problemForEmail: string
  clientQuestion: string
  errorCode: string
  noHeating: boolean
  category: Category
  urgent: boolean
  urgentReason: string
  /** Urgence de 1 à 5 */
  urgency: number
  mentionsPreviousCalls: boolean
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['customerName', 'city', 'postalCode', 'address', 'product', 'equipment', 'summary', 'problemForEmail',
    'clientQuestion', 'errorCode', 'noHeating', 'category', 'urgent', 'urgentReason', 'urgency', 'mentionsPreviousCalls'],
  properties: {
    customerName: { type: 'string', description: 'Nom tel que compris, avec Madame/Monsieur si indiqué (ex. « Madame Martin ») ; chaîne vide si inconnu' },
    city: { type: 'string', description: 'Commune, orthographe corrigée si évidente ; vide si inconnue' },
    postalCode: { type: 'string', description: 'Code postal à 5 chiffres si dit (« 30 100 » → « 30100 ») ; vide sinon' },
    address: { type: 'string', description: 'Adresse (numéro et voie) si dite ; vide sinon' },
    product: { type: 'string', enum: PRODUCTS },
    equipment: { type: 'string', description: 'Équipement tel que décrit (marque, gamme, ancienneté), ex. « PAC air-eau Hitachi installée en décembre 2025 » ; vide si rien' },
    summary: { type: 'string', description: 'Pour l\'équipe : 1 à 2 phrases factuelles, 3e personne, avec ce qui a déjà été tenté' },
    problemForEmail: { type: 'string', description: 'Groupe nominal pour « concernant … » dans l\'email au client, ex. « l\'erreur 83 sur votre pompe à chaleur », « l\'arrêt de votre pompe à chaleur », « le renouvellement de votre contrat d\'entretien »' },
    clientQuestion: { type: 'string', description: 'Le problème seul, dit par le client à la 1re personne, pour démarrer la conversation avec l\'assistant : sans nom, sans politesse, sans demande de rappel ni de technicien. Ex. « Ma pompe à chaleur Hitachi affiche l\'erreur 83 et je n\'ai plus de chauffage. »' },
    errorCode: { type: 'string', description: 'Code erreur cité, tel quel (ex. « 83 », « G11 ») ; vide sinon' },
    noHeating: { type: 'boolean', description: 'Plus de chauffage ou plus d\'eau chaude' },
    category: { type: 'string', enum: CATEGORIES },
    urgent: { type: 'boolean' },
    urgency: { type: 'integer', enum: [1, 2, 3, 4, 5], description: 'Urgence de 1 à 5 (voir le barème)' },
    urgentReason: { type: 'string', description: 'Raison courte si urgent (ex. « personne âgée sans chauffage », « fuite d\'eau »), vide sinon' },
    mentionsPreviousCalls: { type: 'boolean', description: 'Le client dit avoir DÉJÀ appelé ou laissé un message pour CE problème et attendre toujours une réponse (relance). Faux si le client évoque seulement une aide reçue une autre fois ou une procédure donnée auparavant.' },
  },
} as const

const PROMPT = `Tu analyses un message laissé sur le répondeur du SAV de Le Roi Solaire (installateur de pompes à chaleur, climatisations, chauffe-eau thermodynamiques, panneaux solaires et batteries). Le texte est une transcription automatique : elle peut contenir des erreurs, surtout sur les noms propres, les communes et les numéros.

Corrige les erreurs évidentes de transcription, par exemple : « R-O » ou « R.O. » = air-eau ; « Pâques » = PAC ; « Itachi » = Hitachi ; « je suis journaliste au 06… » = « je suis joignable au 06… » ; « fait mettre des panneaux » mal transcrit. Beaucoup de clients disent « chaudière » pour leur pompe à chaleur : si le contexte parle de Le Roi Solaire et de chauffage, c'est très probablement la PAC.

Catégorie :
- SELF_HELP : le client peut probablement résoudre le problème lui-même avec l'assistant Kingso, qui le guide pas à pas : pompe à chaleur qui ne démarre pas ou ne redémarre pas, remise en route du chauffage après l'été, mode été/hiver, voyant rouge, mise en sécurité, code erreur ou message affiché, pression d'eau basse, thermostat ou télécommande, « je ne sais pas mettre le chauffage », question d'utilisation. Choisis SELF_HELP même si le client demande à être rappelé ou qu'un technicien passe : la plupart des clients le demandent par habitude.
- INTERVENTION : seulement quand un technicien est vraiment nécessaire : fuite d'eau, ça disjoncte ou problème électrique, bruit ou sifflement anormal au tableau électrique, pièce cassée ou hors service identifiée (résistance, valve…), panne qui persiste alors qu'un technicien est déjà passé pour ce problème.
- ADMIN : entretien, contrat, renouvellement, rendez-vous déjà prévu, facture, question commerciale, sans panne.
- OTHER_PRODUCT : panne d'un autre produit que la pompe à chaleur air-eau (panneaux solaires, onduleur, batterie, chauffe-eau thermodynamique, climatisation) qui ne demande pas clairement une intervention.
- UNCLEAR : message trop vague pour savoir de quoi il s'agit (« rappelez-moi »).
S'il y a une panne ET une demande administrative, choisis la catégorie de la panne.

Urgent si : plus de chauffage ou d'eau chaude avec une personne fragile (âgée, malade, bébé ou jeune enfant) ; fuite d'eau importante ; risque électrique ; client qui dit avoir déjà appelé plusieurs fois sans réponse.

Urgence de 1 à 5 :
1 = peut attendre : question, entretien, contrat, facture, rien n'est arrêté.
2 = peu urgent : gêne légère (bruit inhabituel, code affiché sans perte de chauffage ni d'eau chaude, panneaux solaires qui produisent moins).
3 = à traiter rapidement : panne partielle (chauffage faible, appoint qui prend le relais, code qui revient), production solaire arrêtée.
4 = urgent : plus de chauffage ou plus d'eau chaude, fuite d'eau, client qui dit avoir déjà appelé pour ce problème.
5 = très urgent : personne fragile sans chauffage ou sans eau chaude, fuite importante, risque électrique ou odeur de brûlé.

Message :
"""
{TEXT}
"""`

export async function analyzeMessage(text: string): Promise<MessageAnalysis> {
  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 3000,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content: PROMPT.replace('{TEXT}', text.slice(0, 6000)) }],
  })
  if (message.stop_reason === 'refusal') throw new Error('Analyse refusée par le modèle.')
  const raw = message.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('')
  const a = JSON.parse(raw) as MessageAnalysis
  const clean = (s: string) => s.trim()
  return {
    ...a,
    customerName: clean(a.customerName),
    city: clean(a.city),
    postalCode: /^\d{5}$/.test(a.postalCode.replace(/\s/g, '')) ? a.postalCode.replace(/\s/g, '') : '',
    address: clean(a.address),
    equipment: clean(a.equipment),
    summary: clean(a.summary),
    problemForEmail: clean(a.problemForEmail) || 'votre installation',
    clientQuestion: clean(a.clientQuestion),
    errorCode: clean(a.errorCode),
    urgentReason: a.urgent ? clean(a.urgentReason) : '',
    urgency: Math.min(5, Math.max(1, Math.round(Number(a.urgency) || 2))),
  }
}
