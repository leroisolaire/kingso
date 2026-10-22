import 'server-only'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MODEL = 'claude-haiku-5-5'

export interface FamilyOption {
  /** Nom du dossier dans le Drive (ex. « PAC ») */
  folder: string
  /** Nom de la catégorie Kingso (ex. « Pompe à Chaleur (PAC) ») */
  category: string
  /** Marques déjà présentes (sous-dossiers) */
  brands: string[]
}

export interface Classification {
  family: string
  brand: string
  title: string
  confidential: boolean
  reasons: string[]
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['family', 'brand', 'title', 'confidential', 'reasons'],
  properties: {
    family: { type: 'string', description: 'Nom du dossier de famille (existant de préférence, sinon nouveau nom court)' },
    brand: { type: 'string', description: 'Marque du fabricant, ou chaîne vide si le document est général' },
    title: { type: 'string', description: 'Titre clair du document, sans extension' },
    confidential: { type: 'boolean' },
    reasons: { type: 'array', items: { type: 'string' }, description: 'Raisons courtes si confidentiel, sinon liste vide' },
  },
} as const

function buildPrompt(params: { fileName: string; visibility: 'PUBLIC' | 'INTERNAL'; families: FamilyOption[]; content: string }) {
  const families = params.families.length
    ? params.families.map((f) => `- « ${f.folder} » (catégorie « ${f.category} »)${f.brands.length ? ` — marques : ${f.brands.join(', ')}` : ''}`).join('\n')
    : '(aucune pour l\'instant)'

  return `Tu ranges les documents de la base documentaire de Le Roi Solaire (installateur de panneaux solaires, pompes à chaleur, etc.).

Document déposé : « ${params.fileName} », dans l'espace ${params.visibility === 'PUBLIC' ? 'PUBLIC (destiné aux clients)' : 'INTERNE (réservé à l\'équipe)'}.

Familles existantes (dossiers du Drive) :
${families}

Réponds avec :
1. family : la famille de produits du document. Reprends EXACTEMENT le nom d'une famille existante si elle convient. Sinon, propose un nouveau nom court et clair (1 à 3 mots, ex. « Climatisation », « Chauffe-eau thermodynamique »).
2. brand : la marque du fabricant si le document concerne une marque précise (reprends l'orthographe d'une marque existante si c'est la même), sinon une chaîne vide (document général).
3. title : un titre clair en français, sur le modèle « Marque Gamme/Modèle - Type de document (précision, année) ». Ajoute « (professionnel) » si le document s'adresse aux installateurs ou techniciens. Pas d'extension de fichier.
4. confidential : ${params.visibility === 'PUBLIC'
    ? `true si le document NE DOIT PAS être montré à un client : tarifs, prix d'achat ou de vente, remises, marges ; données personnelles de clients (noms avec adresse, téléphone ou email, devis, factures, contrats nominatifs) ; notes ou procédures internes de l'entreprise ; mention « confidentiel » ou « usage interne ». Une notice ou fiche technique de fabricant, même destinée aux professionnels, n'est PAS confidentielle.`
    : 'toujours false (document interne).'}
5. reasons : si confidential est true, les raisons en quelques mots chacune (ex. « contient des prix de vente »), sinon une liste vide.

Début du contenu du document :
---
${params.content}
---`
}

export async function classifyDocument(params: {
  fileName: string
  visibility: 'PUBLIC' | 'INTERNAL'
  families: FamilyOption[]
  content: string
}): Promise<Classification> {
  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4000,
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content: buildPrompt({ ...params, content: params.content.slice(0, 9000) }) }],
  })
  if (message.stop_reason === 'refusal') throw new Error('Classement refusé par le modèle.')
  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
  const result = JSON.parse(text) as Classification
  return {
    family: result.family.trim(),
    brand: result.brand.trim(),
    title: result.title.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 150),
    confidential: params.visibility === 'PUBLIC' && result.confidential,
    reasons: result.reasons ?? [],
  }
}
