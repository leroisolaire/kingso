import 'server-only'
import { db } from '@/lib/db/client'
import { cancelScheduledEmail, isEmailConfigured, sendEmail } from '@/lib/email/brevo'
import { caseLink } from './draft'
import { addSavEvent } from './events'
import { effectiveSendTime, formatParisDate } from './schedule'
import { getSavSettings } from './settings'
import { emailHtml } from './templates'

/**
 * Envoie l'email du dossier au client, depuis sav@ (copie cachée à sav@). Brevo l'envoie à l'heure
 * prévue (≈ 30 min après l'appel, dans les plages autorisées) ou tout de suite si elle est passée.
 */
export async function sendCaseEmail(caseId: string, author?: string | null): Promise<Date> {
  const settings = await getSavSettings()
  if (settings.paused) throw new Error('Les envois sont en pause (réglages SAV).')
  if (!isEmailConfigured()) throw new Error('Brevo n\'est pas configuré.')

  const c = await db.savCase.findUniqueOrThrow({ where: { id: caseId } })
  if (!c.email) throw new Error('Aucune adresse email pour ce client.')
  if (!c.emailSubject?.trim() || !c.emailBody?.trim()) throw new Error('Email vide.')
  if (c.emailSentAt) throw new Error('Cet email est déjà envoyé ou programmé.')

  const selfHelp = c.emailTemplate === 'SELF_HELP'
  const when = effectiveSendTime(c.emailScheduledAt, selfHelp, settings)
  const scheduled = when.getTime() - Date.now() > 2 * 60_000
  const link = caseLink(c.accessToken)

  try {
    const { messageId } = await sendEmail({
      from: { email: settings.senderEmail, name: settings.senderName },
      to: [c.email],
      bcc: [settings.senderEmail],
      replyTo: { email: settings.senderEmail, name: settings.senderName },
      subject: c.emailSubject,
      html: emailHtml(c.emailBody, c.emailBody.includes(link) ? link : null),
      ...(scheduled ? { scheduledAt: when.toISOString() } : {}),
    })
    await db.savCase.update({
      where: { id: caseId },
      data: {
        emailSentAt: when, emailScheduledAt: when, emailMessageId: messageId, emailError: null,
        // « Kingso peut aider » : on attend maintenant que le client ouvre son lien
        ...(selfHelp && (c.status === 'NEW' || c.status === 'TO_CALL') ? { status: 'WAITING' as const } : {}),
      },
    })
    await addSavEvent(caseId, scheduled ? 'EMAIL_SCHEDULED' : 'EMAIL_SENT',
      `${scheduled ? `Envoi prévu le ${formatParisDate(when, true)}` : 'Envoyé'} à ${c.email}`, author)
    return when
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await db.savCase.update({ where: { id: caseId }, data: { emailError: message.slice(0, 500) } })
    await addSavEvent(caseId, 'EMAIL_ERROR', message.slice(0, 300), author)
    throw error
  }
}

/** Annule l'email s'il n'est pas encore parti (relance du client, rappel fait avant…). */
export async function cancelCaseEmail(caseId: string, reason: string, author?: string | null): Promise<boolean> {
  const c = await db.savCase.findUniqueOrThrow({ where: { id: caseId } })
  if (!c.emailSentAt || c.emailSentAt <= new Date() || !c.emailMessageId) return false
  await cancelScheduledEmail(c.emailMessageId)
  await db.savCase.update({
    where: { id: caseId },
    data: { emailSentAt: null, emailMessageId: null, ...(c.status === 'WAITING' ? { status: 'NEW' as const } : {}) },
  })
  await addSavEvent(caseId, 'EMAIL_CANCELLED', reason, author)
  return true
}
