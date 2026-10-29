import 'server-only'
import { createHash } from 'node:crypto'
import Anthropic from '@anthropic-ai/sdk'
import type { DocumentType, Prisma } from '@prisma/client'
import { LOGIN_DOMAIN } from '@/lib/auth/permissions'
import { db } from '@/lib/db/client'
import { createDocument, findDocumentByHash } from '@/lib/db/queries/documents'
import { fileExtension } from '@/lib/documents/extract'
import { processDocument, uploadDocumentFile } from '@/lib/documents/process'
import { escapeHtml, isEmailConfigured, sendEmail } from '@/lib/email/brevo'
import type { FullEmail } from '@/lib/sav/mime'

// Kingsia (« la maman de Kingso ») : un collaborateur écrit à kingso@ avec « kingsia » dans l'objet pour ajouter
// des informations à la base documentaire. Kingso met le mail en forme en fiche (sans rien inventer), la range
// (catégorie, public / interne), importe les pièces jointes, et confirme par email à l'expéditeur.
// Seuls les collaborateurs (@domaine, email authentifié par Google) sont acceptés. Les fiches sont en ligne tout de suite.

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MODEL = 'claude-sonnet-5-5'
const LOG_KEY = 'kingsiaLog'
const LOG_MAX = 50
const ATTACHMENT_TYPES = ['pdf', 'docx', 'txt', 'md', 'csv']
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024

export const isKingsiaSubject = (subject: string) => /kingsia/i.test(subject)

// ── Journal (page Documents) ──
export interface KingsiaLogEntry {
  at: string
  from: string
  subject: string
  status: 'created' | 'refused' | 'empty' | 'error'
  reason?: string
  documents: { id: string; title: string; type: DocumentType; category: string | null; note?: string }[]
}

export async function getKingsiaLog(): Promise<KingsiaLogEntry[]> {
  const row = await db.appSetting.findUnique({ where: { key: LOG_KEY } })
  return (row?.value as KingsiaLogEntry[] | null) ?? []
}

async function log(entry: KingsiaLogEntry) {
  const value = [entry, ...(await getKingsiaLog())].slice(0, LOG_MAX) as unknown as Prisma.InputJsonValue
  await db.appSetting.upsert({ where: { key: LOG_KEY }, create: { key: LOG_KEY, value }, update: { value } })
}

// ── Expéditeur ──
/** null si l'expéditeur est un collaborateur authentifié, sinon la raison du refus. */
export function senderRefusal(email: FullEmail): string | null {
  const domain = LOGIN_DOMAIN.replace(/\./g, '\\.')
  if (!new RegExp(`@${domain}$`).test(email.fromAddress)) return `expéditeur extérieur (${email.fromAddress || 'inconnu'})`
  // Signature vérifiée par Gmail à la réception : une adresse @domaine falsifiée ne passe pas
  const auth = email.authResults.join(' ; ').toLowerCase()
  const verified = new RegExp(`dmarc=pass[^;]*header\\.from=${domain}`).test(auth)
    || new RegExp(`dkim=pass[^;]*header\\.(i=@|d=)${domain}`).test(auth)
    || new RegExp(`spf=pass[^;]*smtp\\.mailfrom=[^;\\s]*@${domain}`).test(auth)
  return verified ? null : 'authenticité de l’expéditeur non vérifiée par Google'
}

/** Visibilité imposée dans l'objet : « kingsia interne … », « kingsia public … ». */
function forcedVisibility(subject: string): DocumentType | null {
  // Seulement juste après « kingsia » : « tarif public des PAC » ne doit pas rendre la fiche publique
  const word = subject.match(/kingsia\s*[:\-–]?\s*(internes?|publi(?:c|que)s?)\b/i)?.[1]?.toLowerCase()
  if (!word) return null
  return word.startsWith('intern') ? 'INTERNAL' : 'PUBLIC'
}

const cleanSubject = (subject: string) =>
  subject.replace(/^\s*((re|tr|fwd?)\s*:\s*)+/i, '').replace(/kingsia\s*[:\-–]?\s*(internes?|publi(?:c|que)s?)?\b\s*[:\-–]?/i, '').trim()

// ── Catégories (liste lisible pour le modèle) ──
export async function categoryOptions(): Promise<{ id: string; label: string }[]> {
  const all = await db.category.findMany({ select: { id: true, name: true, parentId: true } })
  const byId = new Map(all.map((c) => [c.id, c]))
  const label = (c: (typeof all)[number]): string => {
    const parent = c.parentId ? byId.get(c.parentId) : null
    return parent ? `${label(parent)} › ${c.name}` : c.name
  }
  return all.map((c) => ({ id: c.id, label: label(c) })).sort((a, b) => a.label.localeCompare(b.label, 'fr'))
}

async function askJson<T>(prompt: string, schema: Record<string, unknown>, maxTokens: number): Promise<T> {
  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    output_config: { format: { type: 'json_schema', schema } },
    messages: [{ role: 'user', content: prompt }],
  })
  if (message.stop_reason === 'refusal') throw new Error('Rédaction refusée par le modèle.')
  const text = message.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('')
  return JSON.parse(text) as T
}

const VISIBILITY_RULE = `Visibilité : PUBLIC seulement si l'information peut être donnée telle quelle à un client (explications produit, conseils d'utilisation, démarches). INTERNAL dès qu'il y a des prix d'achat, remises, marges, tarifs non publics, procédures ou consignes internes, informations sur des fournisseurs ou des collaborateurs, ou en cas de doute.`

interface Fiche { usable: boolean; title: string; content: string; categoryId: string; visibility: 'PUBLIC' | 'INTERNAL'; reasons: string[] }

/** Met le mail en forme en fiche documentaire (sans rien ajouter) et propose son rangement. */
export async function writeFiche(email: FullEmail, categories: { id: string; label: string }[], forced: DocumentType | null): Promise<Fiche> {
  const ids = categories.map((c) => c.id)
  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['usable', 'title', 'content', 'categoryId', 'visibility', 'reasons'],
    properties: {
      usable: { type: 'boolean', description: 'false si le mail ne contient aucune information à ajouter (ex. « voir pièce jointe », test)' },
      title: { type: 'string' },
      content: { type: 'string' },
      categoryId: { type: 'string', enum: [...ids, ''] },
      visibility: { type: 'string', enum: ['PUBLIC', 'INTERNAL'] },
      reasons: { type: 'array', items: { type: 'string' }, description: 'Si INTERNAL : raisons courtes' },
    },
  }
  const prompt = `Tu alimentes la base documentaire de Kingso, l'assistant de Le Roi Solaire (installateur de panneaux solaires, pompes à chaleur, climatisation, ballons thermodynamiques, batteries). Kingso répond aux clients et à l'équipe UNIQUEMENT à partir de cette base.

Un collaborateur a envoyé ce mail pour ajouter des informations. Transforme-le en fiche documentaire.

Règles :
- N'ajoute AUCUNE information qui n'est pas dans le mail. Ne complète pas, ne généralise pas. Reformule seulement pour que ce soit clair et autonome (compréhensible sans le mail).
- Retire salutations, formules de politesse, signature, mentions légales, historique de réponses ou de transferts, et tout ce qui parle de Kingsia ou de la demande elle-même.
- Ne garde JAMAIS de données personnelles de clients (nom, adresse, téléphone, email, numéro de dossier) : remplace par une formulation générale.
- title : titre court et précis en français (ex. « Hitachi Yutaki S – Réarmement après coupure de courant »).
- content : texte en français, structuré avec des lignes de titre et des listes « - », phrases complètes. Garde tous les détails utiles (valeurs, codes, étapes, références).
- categoryId : la catégorie la plus précise qui convient parmi la liste, sinon chaîne vide.
- ${forced ? `visibility : imposée par l'expéditeur, réponds ${forced}.` : VISIBILITY_RULE}
${email.attachments.length ? `- Le mail a des pièces jointes (${email.attachments.map((a) => a.fileName).join(', ')}) : elles sont importées à part. Si le corps du mail n'apporte rien d'autre (ex. « voir pièce jointe »), réponds usable = false.` : ''}

Catégories :
${categories.map((c) => `- ${c.id} : ${c.label}`).join('\n')}

Mail de ${email.fromName || email.fromAddress}
Objet : ${cleanSubject(email.subject) || '(sans objet)'}
---
${email.text.slice(0, 20000)}
---`
  const fiche = await askJson<Fiche>(prompt, schema, 8000)
  return { ...fiche, visibility: forced === 'PUBLIC' || forced === 'INTERNAL' ? forced : fiche.visibility }
}

interface AttachmentInfo { title: string; categoryId: string; visibility: 'PUBLIC' | 'INTERNAL' }

/** Titre et rangement d'une pièce jointe, d'après son contenu. */
async function classifyAttachment(fileName: string, content: string, email: FullEmail, categories: { id: string; label: string }[], forced: DocumentType | null): Promise<AttachmentInfo> {
  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'categoryId', 'visibility'],
    properties: {
      title: { type: 'string' },
      categoryId: { type: 'string', enum: [...categories.map((c) => c.id), ''] },
      visibility: { type: 'string', enum: ['PUBLIC', 'INTERNAL'] },
    },
  }
  const prompt = `Tu ranges un document dans la base documentaire de Le Roi Solaire (installateur de panneaux solaires, pompes à chaleur, climatisation, ballons thermodynamiques, batteries).
Il a été envoyé en pièce jointe d'un mail d'un collaborateur (objet : « ${cleanSubject(email.subject)} »).

- title : titre clair en français, sur le modèle « Marque Gamme/Modèle - Type de document (précision, année) » si c'est un document de fabricant ; sans extension.
- categoryId : la catégorie la plus précise qui convient, sinon chaîne vide.
- ${forced ? `visibility : imposée, réponds ${forced}.` : `${VISIBILITY_RULE} Une notice ou fiche technique de fabricant est PUBLIC. Des données personnelles de clients → INTERNAL.`}

Catégories :
${categories.map((c) => `- ${c.id} : ${c.label}`).join('\n')}

Fichier : « ${fileName} ». Début du contenu :
---
${content.slice(0, 9000)}
---`
  const info = await askJson<AttachmentInfo>(prompt, schema, 1000)
  return { ...info, visibility: forced === 'PUBLIC' || forced === 'INTERNAL' ? forced : info.visibility }
}

// ── Confirmation à l'expéditeur ──
const TYPE_LABELS: Record<DocumentType, string> = { PUBLIC: 'Public (utilisé aussi avec les clients)', INTERNAL: 'Interne (équipe seulement)', FRANCHISE: 'Franchisés' }

async function confirm(email: FullEmail, entry: KingsiaLogEntry) {
  if (!isEmailConfigured()) return
  const base = process.env.KINGSO_PUBLIC_URL ?? 'https://kingso.fr'
  const items = entry.documents.map((d) => `
    <li style="margin-bottom:10px">
      <a href="${base}/admin/documents/${d.id}" style="color:#b45309;font-weight:600">${escapeHtml(d.title)}</a><br>
      <span style="color:#555">${TYPE_LABELS[d.type]}${d.category ? ` · ${escapeHtml(d.category)}` : ' · sans catégorie'}${d.note ? ` · ${escapeHtml(d.note)}` : ''}</span>
    </li>`).join('')
  const body = entry.status === 'created'
    ? `<p>Merci ! J'ai ajouté à ma base documentaire :</p><ul style="padding-left:18px">${items}</ul>
       <p>C'est déjà en ligne : Kingso s'en sert dès maintenant. Pour corriger le texte, la catégorie ou la visibilité, cliquez sur le document (back-office).</p>`
    : `<p>Je n'ai rien ajouté à la base documentaire : ${escapeHtml(entry.reason ?? 'aucune information à ajouter')}.</p>`
  await sendEmail({
    to: [email.fromAddress],
    subject: entry.status === 'created' ? `Kingsia : ${entry.documents.length > 1 ? `${entry.documents.length} documents ajoutés` : 'document ajouté'} – ${cleanSubject(email.subject) || 'votre mail'}` : `Kingsia : rien ajouté – ${cleanSubject(email.subject) || 'votre mail'}`,
    html: `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#222">${body}<p style="color:#888;font-size:12px">Kingsia, pour Kingso — Le Roi Solaire. Rappel : écrivez « kingsia interne » ou « kingsia public » dans l'objet pour imposer la visibilité.</p></div>`,
  }).catch(() => null) // la fiche est créée même si la confirmation ne part pas
}

// ── Traitement d'un mail ──
export async function handleKingsiaEmail(email: FullEmail, budgetMs = 120_000): Promise<KingsiaLogEntry['status']> {
  const started = Date.now()
  const entry: KingsiaLogEntry = { at: new Date().toISOString(), from: email.fromAddress, subject: email.subject.slice(0, 200), status: 'created', documents: [] }
  const refusal = senderRefusal(email)
  if (refusal) {
    // Aucune réponse à un expéditeur non reconnu
    await log({ ...entry, status: 'refused', reason: refusal })
    return 'refused'
  }

  try {
    const categories = await categoryOptions()
    const labelOf = (id: string | null) => categories.find((c) => c.id === id)?.label ?? null
    const forced = forcedVisibility(email.subject)
    const author = email.fromName || email.fromAddress

    // 1. Le corps du mail → une fiche
    if (email.text.trim()) {
      const fiche = await writeFiche(email, categories, forced)
      if (fiche.usable && fiche.title.trim() && fiche.content.trim()) {
        const categoryId = categories.some((c) => c.id === fiche.categoryId) ? fiche.categoryId : null
        const doc = await createDocument({
          title: fiche.title.trim().slice(0, 200),
          content: `${fiche.content.trim()}\n\n(Information transmise par ${author}, le ${new Date().toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })}.)`,
          type: fiche.visibility,
          categoryId,
        })
        entry.documents.push({ id: doc.id, title: doc.title, type: doc.type, category: labelOf(categoryId), note: fiche.visibility === 'INTERNAL' && fiche.reasons.length && !forced ? fiche.reasons.join(', ') : undefined })
      }
    }

    // 2. Les pièces jointes (PDF, Word, texte) → un document chacune
    for (const a of email.attachments) {
      const ext = fileExtension(a.fileName)
      if (!ATTACHMENT_TYPES.includes(ext) || a.data.length === 0) continue
      if (a.data.length > MAX_ATTACHMENT_BYTES) {
        entry.documents.push({ id: '', title: a.fileName, type: 'INTERNAL', category: null, note: 'trop lourd (25 Mo max), non importé' })
        continue
      }
      const contentHash = createHash('sha256').update(a.data).digest('hex')
      const duplicate = await findDocumentByHash(contentHash)
      if (duplicate) {
        const existing = await db.document.findUnique({ where: { id: duplicate.id }, select: { type: true, categoryId: true } })
        entry.documents.push({ id: duplicate.id, title: duplicate.title, type: existing?.type ?? 'INTERNAL', category: labelOf(existing?.categoryId ?? null), note: 'déjà dans la base' })
        continue
      }
      const storagePath = await uploadDocumentFile(a.fileName, a.data, a.mimeType || 'application/octet-stream')
      // Interne tant que le contenu n'est pas lu et rangé
      const doc = await db.document.create({
        data: {
          title: a.fileName.replace(/\.[^.]+$/, '').slice(0, 200), content: '', type: forced ?? 'INTERNAL', categoryId: null,
          storagePath, fileName: a.fileName, mimeType: a.mimeType, fileSize: a.data.length, contentHash,
          status: 'PENDING', statusMessage: 'En attente de lecture…',
        },
        select: { id: true, title: true, type: true },
      })
      let status = 'PENDING'
      while (Date.now() - started < budgetMs) {
        const res = await processDocument(doc.id, Math.max(20_000, budgetMs - (Date.now() - started)))
        status = res.status
        if (status === 'READY' || status === 'ERROR' || res.retryAfter) break
      }
      if (status !== 'READY') {
        entry.documents.push({ id: doc.id, title: doc.title, type: doc.type, category: null, note: status === 'ERROR' ? 'lecture du fichier en erreur' : 'lecture en cours : à reprendre dans Documents' })
        continue
      }
      const { content } = await db.document.findUniqueOrThrow({ where: { id: doc.id }, select: { content: true } })
      const info = await classifyAttachment(a.fileName, content, email, categories, forced).catch(() => null)
      const categoryId = info && categories.some((c) => c.id === info.categoryId) ? info.categoryId : null
      const updated = await db.document.update({
        where: { id: doc.id },
        data: info ? { title: info.title.trim().slice(0, 200) || doc.title, type: info.visibility, categoryId } : {},
        select: { id: true, title: true, type: true },
      })
      entry.documents.push({ id: updated.id, title: updated.title, type: updated.type, category: labelOf(categoryId), note: 'pièce jointe' })
    }

    const created = entry.documents.filter((d) => d.id)
    if (!created.length) {
      entry.status = 'empty'
      entry.reason = email.attachments.length || email.text.trim() ? 'aucune information exploitable dans le mail (ou pièces jointes dans un format non pris en charge : PDF, Word, texte)' : 'mail vide'
    }
  } catch (error) {
    entry.status = entry.documents.length ? 'created' : 'error'
    entry.reason = `erreur pendant le traitement : ${error instanceof Error ? error.message : String(error)}`.slice(0, 300)
  }
  await log(entry)
  await confirm(email, entry)
  return entry.status
}
