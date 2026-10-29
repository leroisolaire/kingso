// Adresse email du client dans un texte collé (email transféré, message écrit) : l'expéditeur (« De : », « From: »)
// en priorité, sinon la première adresse qui n'est pas celle de l'entreprise.

const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi
const OWN_DOMAINS = ['leroisolaire.fr', 'kingso.fr']

const isOwn = (email: string) => OWN_DOMAINS.some((d) => email.endsWith(`@${d}`) || email.endsWith(`.${d}`))

export function customerEmailFrom(text: string): string | null {
  const sender = /^\s*(?:de|from|exp[ée]diteur)\s*:\s*(.+)$/gim
  for (const line of text.matchAll(sender)) {
    const found = line[1].match(EMAIL)?.map((e) => e.toLowerCase()).find((e) => !isOwn(e))
    if (found) return found
  }
  return text.match(EMAIL)?.map((e) => e.toLowerCase()).find((e) => !isOwn(e)) ?? null
}
