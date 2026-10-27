import 'server-only'
import { db } from '@/lib/db/client'
import { addSavEvent } from './events'

/** Dossier correspondant au lien personnel du client (null si le lien est inconnu ou expiré). */
export async function getCaseByToken(token: string | null | undefined) {
  if (!token || token.length < 16 || token.length > 64) return null
  const c = await db.savCase.findUnique({
    where: { accessToken: token },
    include: { assistant: { select: { slug: true } } },
  })
  if (!c || c.tokenExpiresAt < new Date()) return null
  return c
}

/** Ce que Kingso sait du client dans son chat personnel (jamais d'adresse, de téléphone ni d'email). */
export function caseContextText(c: { number: number; equipment: string | null; clientQuestion: string | null; summary: string; errorCode: string | null }): string {
  return [
    `Dossier SAV n° ${c.number}.`,
    // Le fichier client liste les ouvrages posés (souvent sans marque ni modèle exact) : jamais une certitude
    c.equipment
      ? `Ouvrages notés dans notre fichier client (indicatif, souvent sans marque ni modèle exact, parfois incomplet) : ${c.equipment}. Ne dis jamais au client que tu connais son installation. Si la marque ou le modèle exact te manque pour répondre, demande-les-lui comme d'habitude (règle MODÈLE INCONNU).`
      : 'Équipement : non précisé (demande la marque et le modèle si nécessaire, règle MODÈLE INCONNU).',
    `Problème signalé : ${c.clientQuestion ?? c.summary}`,
    c.errorCode ? `Code affiché : ${c.errorCode}.` : '',
  ].filter(Boolean).join('\n')
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
