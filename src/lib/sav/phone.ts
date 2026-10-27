// Numéros de téléphone : une seule forme (+33612345678) pour comparer et regrouper.

/** « 06 12 34 56 78 », « 0612345678 », « +33 6 12… », « 0041794460954 » → « +33612345678 »… ; null si illisible. */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null
  let digits = input.replace(/[^\d+]/g, '')
  if (digits.startsWith('00')) digits = `+${digits.slice(2)}`
  if (digits.startsWith('+')) {
    const rest = digits.slice(1).replace(/\D/g, '')
    // +33 0 6… (zéro en trop après l'indicatif)
    const fixed = rest.startsWith('330') ? `33${rest.slice(3)}` : rest
    return fixed.length >= 9 && fixed.length <= 15 ? `+${fixed}` : null
  }
  digits = digits.replace(/\D/g, '')
  if (digits.length === 10 && digits.startsWith('0')) return `+33${digits.slice(1)}`
  if (digits.length === 9 && /^[1-9]/.test(digits)) return `+33${digits}`
  return null
}

/** « +33612345678 » → « 06 12 34 56 78 » (numéros français), sinon tel quel. */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return ''
  if (/^\+33\d{9}$/.test(phone)) return `0${phone.slice(3)}`.replace(/(\d{2})(?=\d)/g, '$1 ')
  return phone
}
