import 'server-only'
import { db } from '@/lib/db/client'
import { isSmsConfigured, sendSms } from '@/lib/sms/brevo'
import { addSavEvent } from './events'
import { formatPhone, normalizePhone } from './phone'
import { formatAppointment } from './schedule'
import { getSavSettings } from './settings'
import { isMobilePhone, isValidSmsSender, smsLength } from './smsText'
import { ensureTechToken, interventionLink } from './technicians'

/** Texte du SMS envoyé à l'intervenant : n° du dossier, date, commune et lien (ni nom ni adresse du client). */
export function technicianSmsText(c: { number: number; appointmentAt: Date | null; appointmentMinutes: number | null; city: string | null }, link: string): string {
  const when = c.appointmentAt ? ` le ${formatAppointment(c.appointmentAt, c.appointmentMinutes)}` : ''
  return `Le Roi Solaire : intervention SAV n°${c.number}${when}${c.city ? ` à ${c.city}` : ''}. Détails et retour : ${link}`
}

/** Envoie à l'intervenant affecté (sur clic de l'équipe) le lien de son intervention. Renvoie le numéro utilisé. */
export async function sendTechnicianLinkSms(caseId: string, author: string | null): Promise<string> {
  if (!isSmsConfigured()) throw new Error('Brevo n\'est pas configuré.')
  const settings = await getSavSettings()
  if (!isValidSmsSender(settings.smsSender)) throw new Error('Nom d\'expéditeur SMS invalide (réglages SAV).')
  const c = await db.savCase.findUniqueOrThrow({
    where: { id: caseId },
    select: { number: true, appointmentAt: true, appointmentMinutes: true, city: true, technician: { select: { name: true, phone: true } } },
  })
  if (!c.technician) throw new Error('Affectez d’abord un intervenant.')
  const phone = normalizePhone(c.technician.phone)
  if (!isMobilePhone(phone)) throw new Error(`Pas de numéro de mobile sur la fiche de ${c.technician.name}.`)
  const content = technicianSmsText(c, interventionLink(await ensureTechToken(caseId)))
  try {
    await sendSms({ sender: settings.smsSender, recipient: phone!.replace(/^\+/, ''), content, unicode: smsLength(content).unicode, tag: 'sav-intervenant' })
  } catch (e) {
    await addSavEvent(caseId, 'SMS_ERROR', `Lien de l'intervention à ${c.technician.name} : ${e instanceof Error ? e.message : e}`, author)
    throw e
  }
  await addSavEvent(caseId, 'TECH_LINK_SENT', `Par SMS à ${c.technician.name} (${formatPhone(phone)})`, author)
  return formatPhone(phone)
}
