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
export async function findClient(phones: (string | null)[], city?: string | null): Promise<{ client: SavClient | null; match: string }> {
  const list = [...new Set(phones.filter((p): p is string => Boolean(p)))]
  if (list.length === 0) return { client: null, match: 'Aucun numéro exploitable dans le message' }

  for (const phone of list) {
    const found = await db.savClient.findMany({ where: { phones: { has: phone } }, take: 5 })
    if (found.length === 1) return { client: found[0], match: `Téléphone ${formatPhone(phone)}` }
    if (found.length > 1) {
      const byCity = city ? found.filter((c) => normalize(c.city) === normalize(city)) : []
      if (byCity.length === 1) return { client: byCity[0], match: `Téléphone ${formatPhone(phone)} et commune` }
      return { client: null, match: `${found.length} clients ont le numéro ${formatPhone(phone)} : à vérifier` }
    }
  }
  const total = await db.savClient.count()
  return { client: null, match: total === 0 ? 'Fichier client pas encore importé' : 'Numéro absent du fichier client' }
}
