import 'server-only'
import { db } from '@/lib/db/client'
import { addSavEvent } from './events'

/** Dossier correspondant au lien personnel du client (null si le lien est inconnu ou expiré). */
export async function getCaseByToken(token: string | null | undefined) {
  if (!token || token.length < 16 || token.length > 64) return null
  const c = await db.savCase.findUnique({
    where: { accessToken: token },
    include: {
      assistant: { select: { slug: true } },
      client: { select: { equipment: true } },
      messages: { where: { photoNote: { not: null } }, select: { photoNote: true } },
    },
  })
  if (!c || c.tokenExpiresAt < new Date()) return null
  return c
}

/** Ce que Kingso sait du client dans son chat personnel (jamais d'adresse, de téléphone ni d'email). */
export function caseContextText(c: {
  number: number; equipment: string | null; clientQuestion: string | null; summary: string; errorCode: string | null
  client?: { equipment: string | null } | null
  messages?: { photoNote: string | null }[]
}): string {
  const photoNotes = (c.messages ?? []).map((m) => m.photoNote).filter(Boolean)
  const fileEquipment = c.client?.equipment || null
  // Équipement du dossier différent de la fiche client : dit par le client ou corrigé par l'équipe
  const saidEquipment = c.equipment && c.equipment !== fileEquipment ? c.equipment : null
  return [
    `Dossier SAV n° ${c.number}.`,
    `Problème signalé par le client (son message au SAV, reçu par toi comme 1er message) : ${c.clientQuestion ?? c.summary}`,
    saidEquipment ? `Équipement indiqué par le client ou vérifié par notre équipe (fiable) : ${saidEquipment}.` : '',
    // Le fichier client liste les ouvrages posés (souvent sans marque ni modèle exact) : jamais une certitude
    fileEquipment
      ? `Ouvrages notés dans notre fichier client (indicatif, souvent sans marque ni modèle exact, parfois incomplet) : ${fileEquipment}.`
      : '',
    !saidEquipment && !fileEquipment ? 'Équipement : non précisé.' : '',
    c.errorCode ? `Code affiché : ${c.errorCode}.` : '',
    photoNotes.length
      ? `Photos envoyées par le client à notre équipe (il ne les voit pas dans ce chat ; ne lui redemande pas ce qu'elles montrent) : ${photoNotes.join(' ')}`
      : '',
  ].filter(Boolean).join('\n')
}

const PHOTO_NOTE = /\n?\[Photo : [\s\S]*\]$/

export interface CaseConversationEntry {
  historyId: string
  /** Ce que le client a écrit (sans le texte lu sur ses photos) */
  user: string
  /** Avec le texte lu sur les photos : renvoyé à Kingso comme historique */
  userForHistory: string
  assistant: string
  attachments: string[]
  rating: number | null
  /** 1er message envoyé par Kingso à partir du message du client au SAV : pas affiché comme écrit par le client */
  fromCaseMessage: boolean
  createdAt: Date
}

/** Conversation du chat personnel, telle qu'enregistrée : la même sur tous les appareils du client et dans le back-office. */
export async function caseConversation(c: { chatSessionToken: string | null; clientQuestion: string | null }): Promise<CaseConversationEntry[]> {
  if (!c.chatSessionToken) return []
  const entries = await db.history.findMany({
    where: { sessionToken: c.chatSessionToken },
    orderBy: { createdAt: 'asc' },
    take: 200,
    select: { id: true, userMessage: true, assistantMessage: true, attachments: true, rating: true, createdAt: true },
  })
  return entries.map((e, i) => ({
    historyId: e.id,
    user: e.userMessage.replace(PHOTO_NOTE, ''),
    userForHistory: e.userMessage,
    assistant: e.assistantMessage,
    attachments: e.attachments,
    rating: e.rating,
    fromCaseMessage: i === 0 && Boolean(c.clientQuestion) && e.userMessage.trim() === c.clientQuestion!.trim(),
    createdAt: e.createdAt,
  }))
}

/** Statuts d'où l'ouverture du lien fait passer le dossier « Avec Kingso ». Un dossier à rappeler, planifié ou
 *  résolu ne bouge pas (le client a pu demander à être rappelé et rester sur la page) : seule sa pastille change. */
const TO_IN_CHAT = ['NEW', 'WAITING'] as const

/**
 * Signal de la page du client (à l'ouverture, puis toutes les 30 s tant qu'elle est ouverte et visible).
 * Envoyé par le navigateur lui-même : un antivirus de messagerie qui « clique » le lien ne le déclenche pas.
 */
export async function recordPresence(caseId: string) {
  const c = await db.savCase.findUnique({ where: { id: caseId }, select: { status: true, linkOpenedAt: true } })
  if (!c) return
  const now = new Date()
  const toChat = (TO_IN_CHAT as readonly string[]).includes(c.status)
  await db.savCase.update({
    where: { id: caseId },
    data: { lastSeenAt: now, ...(c.linkOpenedAt ? {} : { linkOpenedAt: now }), ...(toChat ? { status: 'IN_CHAT' as const } : {}) },
  })
  if (!c.linkOpenedAt) await addSavEvent(caseId, 'LINK_OPENED', 'Page du chat affichée chez le client')
}

/** Premier message du client dans son chat personnel : conversation rattachée au dossier. */
export async function markCaseChatStarted(caseId: string, sessionToken: string) {
  const c = await db.savCase.findUnique({ where: { id: caseId }, select: { chatSessionToken: true, status: true, linkOpenedAt: true } })
  if (!c) return
  const now = new Date()
  if (c.chatSessionToken) {
    await db.savCase.update({ where: { id: caseId }, data: { lastSeenAt: now } })
    return
  }
  await db.savCase.update({
    where: { id: caseId },
    data: {
      chatSessionToken: sessionToken,
      chatOpenedAt: now,
      lastSeenAt: now,
      ...(c.linkOpenedAt ? {} : { linkOpenedAt: now }),
      ...((TO_IN_CHAT as readonly string[]).includes(c.status) ? { status: 'IN_CHAT' as const } : {}),
    },
  })
  await addSavEvent(caseId, 'CHAT_STARTED', 'Premier message du client à Kingso')
}
