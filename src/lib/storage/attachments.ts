import 'server-only'
import { randomUUID } from 'node:crypto'
import { getAdminStorageClient, ensurePrivateBucket } from './admin'

// Photos des clients : bucket PRIVÉ (contrairement au bucket "documents"), accessible
// uniquement avec la clé service_role côté serveur. Sans cette clé, les photos sont
// analysées par Kingso mais pas conservées.
const BUCKET = 'chat-attachments'

const getClient = getAdminStorageClient

export function isAttachmentStorageEnabled(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
}

const EXTENSIONS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

/** Enregistre les photos d'un message ; renvoie les chemins (vide si stockage indisponible). */
export async function saveAttachments(
  assistantSlug: string,
  images: { mediaType: string; data: string }[],
): Promise<string[]> {
  const supabase = getClient()
  if (!supabase || images.length === 0) return []
  try {
    await ensurePrivateBucket(supabase, BUCKET, '5MB')
    const day = new Date().toISOString().slice(0, 10)
    const paths: string[] = []
    for (const img of images) {
      const path = `${assistantSlug}/${day}/${randomUUID()}.${EXTENSIONS[img.mediaType] ?? 'jpg'}`
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, Buffer.from(img.data, 'base64'), { contentType: img.mediaType, upsert: false })
      if (error) throw error
      paths.push(path)
    }
    return paths
  } catch (error) {
    console.error('[attachments] upload', error instanceof Error ? error.message : error)
    return []
  }
}

/** URLs temporaires pour afficher les photos dans le back-office. */
export async function getSignedUrls(paths: string[], expiresIn = 3600): Promise<Record<string, string>> {
  const supabase = getClient()
  if (!supabase || paths.length === 0) return {}
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, expiresIn)
  if (error || !data) return {}
  const urls: Record<string, string> = {}
  for (const d of data) if (d.path && d.signedUrl) urls[d.path] = d.signedUrl
  return urls
}

/** Contenu des photos (base64) pour les joindre à l'email SAV. */
export async function downloadAttachments(paths: string[]): Promise<{ name: string; content: string }[]> {
  const supabase = getClient()
  if (!supabase) return []
  const files: { name: string; content: string }[] = []
  for (const [i, path] of paths.entries()) {
    const { data } = await supabase.storage.from(BUCKET).download(path)
    if (!data) continue
    const ext = path.split('.').pop() ?? 'jpg'
    files.push({ name: `photo-${i + 1}.${ext}`, content: Buffer.from(await data.arrayBuffer()).toString('base64') })
  }
  return files
}

/** Photo du retour technicien d'un dossier SAV (même stockage privé) ; renvoie son chemin. */
export async function saveCasePhoto(caseId: string, image: { mediaType: string; data: string }): Promise<string> {
  const supabase = getClient()
  if (!supabase) throw new Error('Stockage des photos indisponible.')
  await ensurePrivateBucket(supabase, BUCKET, '5MB')
  const path = `sav/${caseId}/${randomUUID()}.${EXTENSIONS[image.mediaType] ?? 'jpg'}`
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, Buffer.from(image.data, 'base64'), { contentType: image.mediaType, upsert: false })
  if (error) throw new Error(`Photo non enregistrée : ${error.message}`)
  return path
}

export async function removeCasePhoto(path: string): Promise<void> {
  const supabase = getClient()
  if (supabase && path.startsWith('sav/')) await supabase.storage.from(BUCKET).remove([path])
}
