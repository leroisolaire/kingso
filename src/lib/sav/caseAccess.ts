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
    c.equipment ? `Équipement du client : ${c.equipment}.` : 'Équipement : non précisé (demande-le si nécessaire).',
    `Problème signalé : ${c.clientQuestion ?? c.summary}`,
    c.errorCode ? `Code affiché : ${c.errorCode}.` : '',
  ].filter(Boolean).join('\n')
}

/** Premier message du client dans son chat personnel : dossier « en cours avec Kingso ». */
export async function markCaseChatStarted(caseId: string, sessionToken: string) {
  const c = await db.savCase.findUnique({ where: { id: caseId }, select: { chatSessionToken: true, status: true } })
  if (!c || c.chatSessionToken) return
  await db.savCase.update({
    where: { id: caseId },
    data: {
      chatSessionToken: sessionToken,
      chatOpenedAt: new Date(),
      ...(c.status === 'NEW' || c.status === 'WAITING' ? { status: 'IN_CHAT' as const } : {}),
    },
  })
  await addSavEvent(caseId, 'CHAT_STARTED', 'Le client a ouvert son lien et échange avec Kingso')
}
