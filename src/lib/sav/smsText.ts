// SMS au client : texte, longueur et numéro. Sans dépendance serveur : utilisé aussi dans le dossier (compteur).

export const DEFAULT_SMS_TEXT =
  'Le Roi Solaire : votre demande SAV est bien enregistrée. Notre assistant Kingso peut vous aider : {{lien}} Ne pas répondre.'

/** Nom d'expéditeur affiché à la place d'un numéro : 3 à 11 lettres ou chiffres (règle des opérateurs). */
export function isValidSmsSender(sender: string): boolean {
  return /^[A-Za-z0-9 ]{3,11}$/.test(sender) && /[A-Za-z]/.test(sender)
}

/** Mobiles français (06, 07) : un fixe ne reçoit pas de SMS. Numéro au format +33612345678. */
export function isMobilePhone(phone: string | null | undefined): phone is string {
  return Boolean(phone && /^\+33[67]\d{8}$/.test(phone))
}

export function fillSmsText(template: string, link: string): string {
  return template.replace(/\{\{\s*lien\s*\}\}/g, link).replace(/\s+/g, ' ').trim()
}

// Alphabet GSM 7 bits : 160 caractères par SMS. Au-delà (ê, ç, emojis…) : 70 caractères seulement.
const GSM = '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà'
const GSM_EXT = '^{}\\[~]|€' // comptent double

export function smsLength(text: string): { chars: number; parts: number; unicode: boolean; nonGsm: string[] } {
  const nonGsm = [...new Set([...text].filter((ch) => !GSM.includes(ch) && !GSM_EXT.includes(ch)))]
  const unicode = nonGsm.length > 0
  const chars = unicode ? [...text].length : [...text].reduce((n, ch) => n + (GSM_EXT.includes(ch) ? 2 : 1), 0)
  const [single, multi] = unicode ? [70, 67] : [160, 153]
  const parts = chars === 0 ? 0 : chars <= single ? 1 : Math.ceil(chars / multi)
  return { chars, parts, unicode, nonGsm }
}
