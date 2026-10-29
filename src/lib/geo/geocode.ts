import 'server-only'
import { db } from '@/lib/db/client'

// Géocodage des adresses avec l'API Adresse de l'État (Géoplateforme, gratuite, sans clé). Chaque réponse est gardée
// en base (GeoPoint), y compris « introuvable », pour ne jamais redemander la même adresse.

export interface Point { lat: number; lng: number; label: string | null }

const MIN_SCORE = 0.4

const normalize = (q: string) => q.replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 300)

/** Position d'une adresse (null si introuvable ou si le service ne répond pas). */
export async function geocode(query: string | null | undefined): Promise<Point | null> {
  const key = normalize(query ?? '')
  if (key.length < 4) return null
  const cached = await db.geoPoint.findUnique({ where: { query: key } })
  if (cached) return cached.lat !== null && cached.lng !== null ? { lat: cached.lat, lng: cached.lng, label: cached.label } : null

  let found: Point | null = null
  try {
    const res = await fetch(`https://data.geopf.fr/geocodage/search?q=${encodeURIComponent(key)}&limit=1`, { signal: AbortSignal.timeout(6000) })
    if (!res.ok) return null // service indisponible : on réessaiera plus tard
    const json = await res.json() as { features?: { geometry?: { coordinates?: [number, number] }; properties?: { label?: string; score?: number } }[] }
    const f = json.features?.[0]
    const [lng, lat] = f?.geometry?.coordinates ?? []
    if (typeof lat === 'number' && typeof lng === 'number' && (f?.properties?.score ?? 0) >= MIN_SCORE) {
      found = { lat, lng, label: f?.properties?.label ?? null }
    }
  } catch {
    return null
  }
  await db.geoPoint.upsert({
    where: { query: key },
    create: { query: key, lat: found?.lat ?? null, lng: found?.lng ?? null, label: found?.label ?? null },
    update: {},
  }).catch(() => null)
  return found
}

/** Distance à vol d'oiseau, en km. */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(h))
}
