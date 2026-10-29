import 'server-only'
import type { SavClient } from '@prisma/client'
import { db } from '@/lib/db/client'
import { formatPhone } from './phone'

const normalize = (s: string | null | undefined) =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')

/**
 * Retrouve le client dans le fichier client par ses numéros (appelant, puis numéro dicté),
 * la commune servant à départager un numéro partagé. Jamais d'IA ici : simple comparaison.
 */
export async function findClient(phones: (string | null)[], city?: string | null, email?: string | null): Promise<{ client: SavClient | null; match: string }> {
  const list = [...new Set(phones.filter((p): p is string => Boolean(p)))]
  if (list.length === 0) {
    const byEmail = email ? await findByEmail(email, city) : null
    if (byEmail) return byEmail
    return { client: null, match: email ? `Aucun numéro dans le message, email ${email} absent du fichier client` : 'Aucun numéro exploitable dans le message' }
  }

  for (const phone of list) {
    const found = await db.savClient.findMany({ where: { phones: { has: phone } }, take: 5 })
    if (found.length === 1) return { client: found[0], match: `Téléphone ${formatPhone(phone)}` }
    if (found.length > 1) {
      const byCity = city ? found.filter((c) => normalize(c.city) === normalize(city)) : []
      if (byCity.length === 1) return { client: byCity[0], match: `Téléphone ${formatPhone(phone)} et commune` }
      // Plusieurs fiches (doublons, couple, propriétaire et locataire…) mais une seule adresse email : c'est elle qu'on utilisera
      const emails = new Set(found.map((c) => c.email?.toLowerCase().trim() || null))
      if (emails.size === 1 && !emails.has(null)) {
        const best = byCity[0] ?? found[0]
        return { client: best, match: `Téléphone ${formatPhone(phone)} (${found.length} fiches, même email)` }
      }
      return { client: null, match: `${found.length} clients ont le numéro ${formatPhone(phone)} : à vérifier` }
    }
  }
  const byEmail = email ? await findByEmail(email, city) : null
  if (byEmail) return byEmail
  const total = await db.savClient.count()
  return { client: null, match: total === 0 ? 'Fichier client pas encore importé' : 'Numéro absent du fichier client' }
}

/** Client retrouvé par son adresse email (message écrit sans numéro, ou numéro inconnu du fichier). */
async function findByEmail(email: string, city?: string | null): Promise<{ client: SavClient; match: string } | null> {
  const found = await db.savClient.findMany({ where: { email: { equals: email.trim(), mode: 'insensitive' } }, take: 5 })
  if (found.length === 1) return { client: found[0], match: `Email ${email}` }
  if (found.length > 1) {
    const byCity = city ? found.filter((c) => normalize(c.city) === normalize(city)) : []
    // Plusieurs fiches avec cet email (doublons, couple…) : c'est bien la même adresse à utiliser
    return { client: byCity[0] ?? found[0], match: `Email ${email} (${found.length} fiches)` }
  }
  return null
}

// ── Clients possibles (numéro introuvable) ──
// Proposés à l'équipe, qui confirme d'un clic : les noms et communes transcrits du répondeur sont souvent déformés
// (« Huchot » pour Uchaux), d'où une comparaison approchée. Jamais d'association automatique ici.

export interface ClientSuggestion {
  id: string
  name: string
  email: string | null
  phones: string[]
  address: string | null
  postalCode: string | null
  city: string | null
  equipment: string | null
  reasons: string[]
}

const IGNORED_WORDS = new Set(['madame', 'monsieur', 'mme', 'mlle', 'mademoiselle', 'client', 'cliente', 'et', 'de', 'du', 'des', 'la', 'le', 'les'])

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = tmp
    }
  }
  return row[b.length]
}

/** Mots proches : identiques, ou quelques lettres d'écart selon la longueur. */
function similar(a: string, b: string): 'exact' | 'close' | null {
  if (a === b) return 'exact'
  if (Math.min(a.length, b.length) < 4) return null
  const d = distance(a, b)
  return d <= (Math.max(a.length, b.length) >= 7 ? 2 : 1) ? 'close' : null
}

const words = (s: string | null | undefined) =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 3 && !IGNORED_WORDS.has(w))
const digits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '').replace(/^33/, '0')

const SELECT = { id: true, name: true, email: true, phones: true, address: true, postalCode: true, city: true, equipment: true } as const

export async function suggestClients(c: {
  customerName: string | null; city: string | null; postalCode: string | null; phoneKey: string | null; callbackPhone: string | null
}, limit = 5): Promise<ClientSuggestion[]> {
  const nameWords = words(c.customerName)
  const cityKey = normalize(c.city)
  const caseDigits = [...new Set([c.phoneKey, c.callbackPhone].map(digits).filter((d) => d.length >= 6))]
  if (nameWords.length === 0 && caseDigits.length === 0) return []

  const clients = await db.savClient.findMany({ select: SELECT })
  // Mots courants dans le fichier (prénoms comme Marie ou Michel) : ils ne suffisent pas à proposer un client
  const frequency = new Map<string, number>()
  for (const cl of clients) for (const w of new Set(words(cl.name))) frequency.set(w, (frequency.get(w) ?? 0) + 1)
  const common = (w: string) => (frequency.get(w) ?? 0) > 15

  const scored = clients.map((cl) => {
    const reasons: string[] = []
    let score = 0

    // Numéro : mêmes 8 derniers chiffres (indicatif différent) ou numéro dicté incomplet contenu dans celui du client
    const clDigits = cl.phones.map(digits)
    if (caseDigits.some((d) => clDigits.some((p) => p.slice(-8) === d.slice(-8)))) { score += 5; reasons.push('numéro presque identique') }
    else if (caseDigits.some((d) => d.length >= 7 && clDigits.some((p) => p.includes(d.replace(/^0/, ''))))) { score += 3; reasons.push('numéro dicté incomplet') }

    // Nom
    const clWords = words(cl.name)
    let nameScore = 0
    let rare = false
    for (const w of nameWords) {
      let best: 'exact' | 'close' | null = null
      let bestWord = ''
      for (const x of clWords) {
        const s = similar(w, x)
        if (s === 'exact' || (s === 'close' && !best)) { best = s; bestWord = x }
        if (s === 'exact') break
      }
      if (!best) continue
      if (common(bestWord)) { nameScore += 1; continue }
      rare = true
      nameScore += best === 'exact' ? 3 : 2
    }
    const phoneMatch = score > 0
    if (!rare && !phoneMatch) return { cl, score: 0, reasons }
    if (nameScore > 0) { score += Math.min(nameScore, 6); reasons.push(rare ? (nameScore >= 3 ? 'même nom' : 'nom proche') : 'même prénom') }

    // Commune / code postal (pour départager)
    const clCity = normalize(cl.city)
    if (c.postalCode && cl.postalCode === c.postalCode) { score += 2; reasons.push('même code postal') }
    else if (cityKey && clCity) {
      if (clCity === cityKey) { score += 2; reasons.push('même commune') }
      else if (clCity.slice(0, 4) === cityKey.slice(0, 4) || distance(clCity, cityKey) <= Math.max(2, Math.floor(clCity.length / 3))) {
        score += 1; reasons.push('commune proche')
      }
    }
    return { cl, score, reasons }
  })

  return scored
    .filter((s) => s.score >= 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ cl, reasons }) => ({ ...cl, reasons }))
}

/** Recherche manuelle dans le fichier client (nom, commune, code postal ou numéro). */
export async function searchClients(query: string, limit = 10): Promise<ClientSuggestion[]> {
  const q = query.trim()
  if (q.length < 2) return []
  const d = digits(q)
  let ids: string[] | null = null
  if (d.length >= 6) {
    // Numéros stockés en +33… : on compare la fin (sans le 0 initial)
    const rows = await db.$queryRaw<{ id: string }[]>`
      SELECT id FROM "SavClient" WHERE EXISTS (SELECT 1 FROM unnest(phones) p WHERE p LIKE ${'%' + d.replace(/^0/, '')}) LIMIT ${limit}`
    ids = rows.map((r) => r.id)
  }
  const found = await db.savClient.findMany({
    where: ids
      ? { id: { in: ids } }
      : { OR: [{ name: { contains: q, mode: 'insensitive' } }, { city: { contains: q, mode: 'insensitive' } }, { postalCode: { startsWith: q } }] },
    select: SELECT,
    take: limit,
    orderBy: { name: 'asc' },
  })
  return found.map((cl) => ({ ...cl, reasons: [] }))
}
