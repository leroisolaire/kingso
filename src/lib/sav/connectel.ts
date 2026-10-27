// Emails du répondeur SAV (messagerie Connectel). Exemple :
//   Boîte vocale : Sandy SAV 108 (108)
//   Appelant     : 06 12 34 56 78 (SUZ)          ← ou « SUZ (0041…) » pour un numéro étranger
//   Date         : 23/10/2026 08:50
//   Durée        : 1 min 06 s
//   Transcription automatique :
//   <texte>
//   Numéro dicté dans le message : … (identique au numéro appelant).   ← ou « Attention : … diffère … », ou absent
//   --
//   <pied de page Connectel>
import { normalizePhone } from './phone'
import { parisTime } from './schedule'

export const CONNECTEL_SENDER = 'messagerie@connectel.fr'

export interface VoicemailMessage {
  callerPhone: string | null
  /** Numéro dicté s'il diffère de l'appelant (souvent mal transcrit : on garde l'appelant en priorité) */
  dictatedPhone: string | null
  receivedAt: Date | null
  durationSec: number | null
  transcript: string
}

/** L'email vient-il du répondeur (et d'une demande SAV) ? */
export function isConnectelVoicemail(from: string, subject: string): boolean {
  return from.toLowerCase().includes(CONNECTEL_SENDER) && /transcription/i.test(subject)
}

/** Date « 23/10/2026 08:50 » (heure de Paris) → Date. */
function parseParisDate(text: string): Date | null {
  const m = text.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/)
  if (!m) return null
  const [, d, mo, y, h, mi] = m.map(Number)
  return parisTime(y, mo, d, h, mi)
}

function parseDuration(text: string): number | null {
  const min = text.match(/(\d+)\s*min/)
  const sec = text.match(/(\d+)\s*s\b/)
  if (!min && !sec) return null
  return (min ? Number(min[1]) * 60 : 0) + (sec ? Number(sec[1]) : 0)
}

const field = (text: string, name: string) => text.match(new RegExp(`^\\s*${name}\\s*:\\s*(.+)$`, 'mi'))?.[1].trim() ?? ''

export function parseVoicemail(body: string): VoicemailMessage {
  const text = body.replace(/\r\n/g, '\n')
  // Le pied de page commence par « -- » seul sur sa ligne
  const main = text.split(/\n--\s*\n/)[0]

  const caller = field(main, 'Appelant')
  // « 06 12 34 56 78 (SUZ) » ou « SUZ (0041794460954) »
  const callerPhone = normalizePhone(caller.replace(/\(([^)]*)\)/g, (_, inner: string) => (/\d{6,}/.test(inner) ? inner : '')))

  const dictatedLine = main.match(/num[ée]ro dict[ée][^:]*:\s*([+\d][\d\s.]+)/i)
  const dictated = normalizePhone(dictatedLine?.[1])
  const dictatedPhone = dictated && dictated !== callerPhone ? dictated : null

  const afterLabel = main.split(/Transcription automatique\s*:\s*/i)[1] ?? ''
  const transcript = afterLabel
    .split('\n')
    .filter((l) => !/num[ée]ro dict[ée]/i.test(l) && !/^Attention\s*:/i.test(l.trim()))
    .join('\n')
    .trim()

  return {
    callerPhone,
    dictatedPhone,
    receivedAt: parseParisDate(field(main, 'Date')),
    durationSec: parseDuration(field(main, 'Dur[ée]e')),
    transcript,
  }
}
