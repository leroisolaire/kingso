import type { ImageInput } from '@/lib/ai/assistant'

// Photos envoyées par le back-office (compressées dans le navigateur, environ 200-500 Ko chacune).
export const MAX_CASE_PHOTOS = 5
const TYPES = ['image/jpeg', 'image/png', 'image/webp']

/** Photos d'une requête : liste valide, ou message d'erreur. */
export function parseCasePhotos(raw: unknown, max = MAX_CASE_PHOTOS): ImageInput[] | string {
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw)) return 'Photos invalides.'
  if (raw.length > max) return `${max} photos au maximum à la fois.`
  const photos: ImageInput[] = []
  for (const p of raw) {
    if (!p || typeof p.data !== 'string' || !TYPES.includes(p.mediaType)) return 'Photo invalide.'
    if (p.data.length > 6_000_000) return 'Photo trop lourde.'
    photos.push({ mediaType: p.mediaType, data: p.data })
  }
  return photos
}
