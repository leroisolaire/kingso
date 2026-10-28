import type { Prisma } from '@prisma/client'

// Recherche dans les dossiers SAV : chaque mot doit se retrouver quelque part dans le dossier
// (n°, nom, commune, code postal, email, adresse, téléphone, résumé, équipement, code erreur, messages).

const TEXT_FIELDS = ['customerName', 'city', 'postalCode', 'email', 'address', 'summary', 'equipment', 'errorCode', 'clientQuestion'] as const

function termWhere(term: string): Prisma.SavCaseWhereInput {
  const or: Prisma.SavCaseWhereInput[] = TEXT_FIELDS.map((f) => ({ [f]: { contains: term, mode: 'insensitive' } }))
  or.push({ messages: { some: { text: { contains: term, mode: 'insensitive' } } } })

  const digits = term.replace(/^n°?/i, '').replace(/\D/g, '')
  // « 123 » ou « n°123 » : numéro de dossier
  if (digits && digits === term.replace(/^n°?/i, '') && digits.length <= 7) or.push({ number: Number(digits) })
  // Téléphone (« 06 12… », « 0612 », « +33 6… ») : comparé sans le 0 ni l'indicatif, sur la forme +33…
  // (seulement pour un numéro complet : « 0678 », fin de numéro, garde son 0)
  const phone = digits.length >= 10 ? digits.replace(/^(0033|33|0)/, '') : digits
  if (phone.length >= 4) {
    or.push({ phoneKey: { contains: phone } }, { callbackPhone: { contains: phone } })
  }
  return { OR: or }
}

/** Les numéros de téléphone tapés avec des espaces (« 06 12 34 56 78 ») comptent pour un seul terme. */
export function searchTerms(q: string): string[] {
  const joined = q.trim().replace(/(\d)[\s.-]+(?=\d)/g, '$1')
  return joined.split(/\s+/).filter((t) => t.length > 0).slice(0, 8)
}

export function savSearchWhere(q: string): Prisma.SavCaseWhereInput | null {
  const terms = searchTerms(q)
  return terms.length ? { AND: terms.map(termWhere) } : null
}
