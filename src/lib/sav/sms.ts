import 'server-only'
import { db } from '@/lib/db/client'
import { isSmsConfigured, sendSms } from '@/lib/sms/brevo'
import { caseLink } from './draft'
import { addSavEvent } from './events'
import { formatPhone } from './phone'
import { getSavSettings } from './settings'
import { fillSmsText, isMobilePhone, isValidSmsSender, smsLength } from './smsText'

const MAX_PARTS = 3

/** Numéro mobile où envoyer le SMS : numéro de rappel, sinon celui de l'appel. */
export function smsPhoneOf(c: { callbackPhone: string | null; phoneKey: string | null }): string | null {
  if (isMobilePhone(c.callbackPhone)) return c.callbackPhone
  if (isMobilePhone(c.phoneKey)) return c.phoneKey
  return null
}

/** Texte prévu pour ce dossier (modèle des réglages, lien personnel du client). */
export async function defaultCaseSms(accessToken: string): Promise<string> {
  const settings = await getSavSettings()
  return fillSmsText(settings.smsText, caseLink(accessToken))
}

/** Accusé de réception par SMS : seulement sur clic de l'équipe, un seul par dossier. */
export async function sendCaseSms(caseId: string, text: string | null, author?: string | null): Promise<string> {
  const settings = await getSavSettings()
  if (settings.paused) throw new Error('Les envois sont en pause (réglages SAV).')
  if (!isSmsConfigured()) throw new Error('Brevo n\'est pas configuré.')
  if (!isValidSmsSender(settings.smsSender)) throw new Error('Nom d\'expéditeur SMS invalide (réglages SAV : 3 à 11 lettres ou chiffres).')

  const c = await db.savCase.findUniqueOrThrow({ where: { id: caseId } })
  const phone = smsPhoneOf(c)
  if (!phone) throw new Error('Pas de numéro de mobile (06 ou 07) pour ce client.')
  if (await db.savEvent.findFirst({ where: { caseId, kind: 'SMS_SENT' }, select: { id: true } })) {
    throw new Error('Le SMS a déjà été envoyé à ce client.')
  }

  const content = (text?.trim() || fillSmsText(settings.smsText, caseLink(c.accessToken))).slice(0, 1000)
  const length = smsLength(content)
  if (length.parts > MAX_PARTS) throw new Error(`SMS trop long (${length.parts} SMS) : raccourcissez le texte.`)

  try {
    await sendSms({ sender: settings.smsSender, recipient: phone, content, unicode: length.unicode, tag: 'sav-accuse' })
    await addSavEvent(caseId, 'SMS_SENT', `Au ${formatPhone(phone)} : ${content}`, author)
    return phone
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await addSavEvent(caseId, 'SMS_ERROR', message.slice(0, 300), author)
    throw error
  }
}
