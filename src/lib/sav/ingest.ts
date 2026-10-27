import 'server-only'
import { randomBytes } from 'node:crypto'
import type { SavCategory, SavSource, SavStatus } from '@prisma/client'
import { db } from '@/lib/db/client'
import { analyzeMessage, type MessageAnalysis } from './analyze'
import { findClient } from './clients'
import { buildEmail } from './draft'
import { addSavEvent } from './events'
import { formatPhone, normalizePhone } from './phone'
import { formatParisDate, plannedSendTime } from './schedule'
import { cancelCaseEmail, sendCaseEmail } from './send'
import { getSavSettings } from './settings'
import { CATEGORY_LABELS } from './status'
import { getTemplate, TEMPLATE_LABELS, type TemplateKey } from './templates'

// Réception d'une demande SAV (message du répondeur ; plus tard la même fonction sera appelée par Gmail) :
// lecture par Kingso, regroupement avec un dossier ouvert du même numéro (relance), identification
// du client, tri, puis préparation de l'email selon le cas.

const OPEN_STATUSES: SavStatus[] = ['NEW', 'WAITING', 'IN_CHAT', 'TO_CALL', 'TO_SCHEDULE', 'SCHEDULED']
const TOKEN_DAYS = 30


export interface IncomingMessage {
  source: SavSource
  /** Identifiant de l'email d'origine : un même email n'est jamais traité deux fois */
  externalId?: string | null
  text: string
  callerPhone?: string | null
  dictatedPhone?: string | null
  receivedAt?: Date | null
  durationSec?: number | null
  author?: string | null
}

function templateFor(category: SavCategory, followUp: boolean): TemplateKey | null {
  if (followUp) return 'FOLLOW_UP'
  return category === 'UNCLEAR' ? null : category
}

/** Prépare l'email du dossier selon le modèle, et l'envoie tout de suite si ce modèle est en « envoi direct ». */
export async function prepareEmail(caseId: string, key: TemplateKey, author?: string | null) {
  const c = await db.savCase.findUniqueOrThrow({ where: { id: caseId }, include: { client: true } })
  const settings = await getSavSettings()
  const template = await getTemplate(key)
  const { subject, body } = await buildEmail(c, c.client, template, settings)
  await db.savCase.update({
    where: { id: caseId },
    data: {
      emailTemplate: key, emailSubject: subject, emailBody: body, emailError: null,
      emailScheduledAt: plannedSendTime(c.receivedAt, key === 'SELF_HELP', settings),
    },
  })
  await addSavEvent(caseId, 'EMAIL_PREPARED', `Modèle « ${TEMPLATE_LABELS[key]} »${c.email ? '' : ' — aucune adresse email connue'}`, author)
  if (template.autoSend && c.email && !settings.paused) await sendCaseEmail(caseId).catch(() => {})
}

async function assistantIdFor(a: MessageAnalysis): Promise<string | null> {
  const { productChats } = await getSavSettings()
  const slug = productChats[a.product] ?? (a.category === 'SELF_HELP' ? productChats.PAC : undefined)
  if (!slug) return null
  return (await db.assistant.findFirst({ where: { slug }, select: { id: true } }))?.id ?? null
}

export async function ingestMessage(input: IncomingMessage): Promise<{ caseId: string; created: boolean; duplicate: boolean }> {
  if (input.externalId) {
    const known = await db.savMessage.findUnique({ where: { externalId: input.externalId }, select: { caseId: true } })
    if (known) return { caseId: known.caseId, created: false, duplicate: true }
  }

  const receivedAt = input.receivedAt ?? new Date()
  const phoneKey = input.callerPhone ?? input.dictatedPhone ?? null
  const analysis = await analyzeMessage(input.text)
  const messageData = {
    source: input.source, externalId: input.externalId ?? null, callerPhone: input.callerPhone ?? null,
    durationSec: input.durationSec ?? null, text: input.text, receivedAt,
  }

  // ── Relance : dossier encore ouvert pour ce numéro ──
  const open = phoneKey
    ? await db.savCase.findFirst({
        where: { phoneKey, status: { in: OPEN_STATUSES }, receivedAt: { gte: new Date(Date.now() - 30 * 24 * 3600_000) } },
        orderBy: { receivedAt: 'desc' },
      })
    : null
  if (open) {
    await db.savMessage.create({ data: { ...messageData, caseId: open.id } })
    await addSavEvent(open.id, 'FOLLOW_UP', `${formatParisDate(receivedAt, true)} — ${analysis.summary}`, input.author)
    // Le client relance : plus question de lui proposer Kingso par email, on le rappelle en priorité
    await cancelCaseEmail(open.id, 'Le client a relancé : email remplacé', input.author).catch(() => false)
    const reachedTeam = ['TO_SCHEDULE', 'SCHEDULED'].includes(open.status)
    await db.savCase.update({
      where: { id: open.id },
      data: {
        urgent: true,
        urgentReason: analysis.urgentReason || open.urgentReason || 'Relance du client',
        noHeating: open.noHeating || analysis.noHeating,
        summary: `${open.summary}\nRelance du ${formatParisDate(receivedAt, true)} : ${analysis.summary}`,
        ...(reachedTeam ? {} : { status: 'TO_CALL' as const }),
      },
    })
    const updated = await db.savCase.findUniqueOrThrow({ where: { id: open.id }, select: { emailSentAt: true, email: true } })
    if (updated.email && !updated.emailSentAt) await prepareEmail(open.id, 'FOLLOW_UP', input.author)
    return { caseId: open.id, created: false, duplicate: false }
  }

  // ── Nouveau dossier ── (fichier client relu s'il a changé depuis le dernier import)
  await import('./clientSync').then((m) => m.syncClientFile()).catch(() => null)
  const { client, match } = await findClient([input.callerPhone ?? null, input.dictatedPhone ?? null], analysis.city)
  const followUp = analysis.mentionsPreviousCalls
  const category = analysis.category as SavCategory
  const key = templateFor(category, followUp)
  const email = client?.email ?? null
  const status: SavStatus = category === 'SELF_HELP' && !followUp && email ? 'NEW' : 'TO_CALL'

  const created = await db.savCase.create({
    data: {
      source: input.source,
      status,
      category,
      urgent: analysis.urgent || followUp,
      urgentReason: analysis.urgentReason || (followUp ? 'Le client dit avoir déjà appelé' : null),
      phoneKey,
      callbackPhone: input.dictatedPhone ?? input.callerPhone ?? null,
      customerName: client?.name ?? (analysis.customerName || null),
      email,
      address: client?.address ?? (analysis.address || null),
      postalCode: client?.postalCode ?? (analysis.postalCode || null),
      city: client?.city ?? (analysis.city || null),
      clientId: client?.id ?? null,
      clientMatch: match,
      product: analysis.product,
      equipment: client?.equipment || analysis.equipment || null,
      summary: analysis.summary,
      clientQuestion: analysis.clientQuestion || null,
      emailProblem: analysis.problemForEmail,
      errorCode: analysis.errorCode || null,
      noHeating: analysis.noHeating,
      assistantId: await assistantIdFor(analysis),
      accessToken: randomBytes(18).toString('base64url'),
      tokenExpiresAt: new Date(Date.now() + TOKEN_DAYS * 24 * 3600_000),
      receivedAt,
      messages: { create: messageData },
    },
  })

  const from = input.callerPhone ? ` de ${formatPhone(input.callerPhone)}` : ''
  await addSavEvent(created.id, 'RECEIVED', `${formatParisDate(receivedAt, true)}${from}`, input.author)
  await addSavEvent(created.id, 'ANALYZED',
    `${CATEGORY_LABELS[category]}${analysis.urgent ? ` — urgent : ${analysis.urgentReason}` : ''}${followUp ? ' — le client dit avoir déjà appelé' : ''}`)
  await addSavEvent(created.id, client ? 'CLIENT_FOUND' : 'CLIENT_NOT_FOUND', match)

  if (key) await prepareEmail(created.id, key, input.author)
  return { caseId: created.id, created: true, duplicate: false }
}

/** Demande « Transmettre au SAV » depuis un chat : dossier « À rappeler », avec la conversation rattachée. */
export async function caseFromChatEscalation(params: {
  assistantId: string
  sessionToken: string
  name: string
  phone: string
  postalCode: string
  email: string | null
  userMessages: string[]
}): Promise<string> {
  const phoneKey = normalizePhone(params.phone)
  const text = params.userMessages.join('\n').slice(0, 4000)
  const analysis = await analyzeMessage(`(Demande écrite dans le chat de l'assistant, après échange avec lui)\n${text}`)
    .catch(() => null)
  const summary = `Demande SAV depuis le chat après échange avec Kingso${analysis ? ` : ${analysis.summary}` : ''}`

  const open = phoneKey
    ? await db.savCase.findFirst({ where: { phoneKey, status: { in: OPEN_STATUSES } }, orderBy: { receivedAt: 'desc' } })
    : null
  if (open) {
    await db.savMessage.create({ data: { caseId: open.id, source: 'CHAT', callerPhone: phoneKey, text, receivedAt: new Date() } })
    await db.savCase.update({ where: { id: open.id }, data: { status: 'TO_CALL', urgent: true, urgentReason: open.urgentReason ?? 'Relance du client', chatSessionToken: open.chatSessionToken ?? params.sessionToken } })
    await addSavEvent(open.id, 'CALLBACK_REQUESTED', 'Demande depuis le chat (formulaire SAV)')
    return open.id
  }

  const { client, match } = await findClient([phoneKey], null)
  const created = await db.savCase.create({
    data: {
      source: 'CHAT',
      status: 'TO_CALL',
      category: (analysis?.category ?? 'UNCLEAR') as SavCategory,
      urgent: analysis?.urgent ?? false,
      urgentReason: analysis?.urgentReason || null,
      phoneKey,
      callbackPhone: phoneKey,
      customerName: params.name,
      email: params.email ?? client?.email ?? null,
      postalCode: params.postalCode,
      city: client?.city ?? (analysis?.city || null),
      address: client?.address ?? null,
      clientId: client?.id ?? null,
      clientMatch: match,
      product: analysis?.product ?? null,
      equipment: client?.equipment || analysis?.equipment || null,
      summary,
      clientQuestion: analysis?.clientQuestion || null,
      emailProblem: analysis?.problemForEmail ?? null,
      errorCode: analysis?.errorCode || null,
      noHeating: analysis?.noHeating ?? false,
      assistantId: params.assistantId,
      chatSessionToken: params.sessionToken,
      chatOpenedAt: new Date(),
      accessToken: randomBytes(18).toString('base64url'),
      tokenExpiresAt: new Date(Date.now() + TOKEN_DAYS * 24 * 3600_000),
      messages: { create: { source: 'CHAT', callerPhone: phoneKey, text, receivedAt: new Date() } },
    },
  })
  await addSavEvent(created.id, 'CALLBACK_REQUESTED', 'Demande depuis le chat (formulaire SAV)')
  await addSavEvent(created.id, client ? 'CLIENT_FOUND' : 'CLIENT_NOT_FOUND', match)
  return created.id
}
