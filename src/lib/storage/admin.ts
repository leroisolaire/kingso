import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Accès au stockage avec la clé service_role (serveur uniquement) : buckets PRIVÉS,
// fichiers lisibles seulement via des URLs signées temporaires.

let client: SupabaseClient | null = null
const readyBuckets = new Set<string>()

export function getAdminStorageClient(): SupabaseClient | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key || !process.env.NEXT_PUBLIC_SUPABASE_URL) return null
  client ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, key, { auth: { persistSession: false } })
  return client
}

/** Crée le bucket privé s'il n'existe pas encore. */
export async function ensurePrivateBucket(supabase: SupabaseClient, bucket: string, fileSizeLimit: string) {
  if (readyBuckets.has(bucket)) return
  const { data } = await supabase.storage.getBucket(bucket)
  if (!data) {
    const { error } = await supabase.storage.createBucket(bucket, { public: false, fileSizeLimit })
    if (error && !/already exists/i.test(error.message)) throw error
  }
  readyBuckets.add(bucket)
}
