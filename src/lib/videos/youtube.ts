import 'server-only'

// API officielle YouTube Data v3 (clé GOOGLE_API_KEY) : chaînes et liste des vidéos publiques.
const API = 'https://www.googleapis.com/youtube/v3'

export interface ChannelInfo {
  channelId: string
  name: string
  uploadsPlaylistId: string
}

export interface VideoInfo {
  videoId: string
  title: string
  description: string
  durationSec: number | null
  publishedAt: string | null
}

function apiKey(): string {
  const key = process.env.GOOGLE_API_KEY
  if (!key) throw new Error('Clé Google absente : ajoutez GOOGLE_API_KEY (YouTube Data API v3 et Gemini).')
  return key
}

async function call<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${API}${path}`)
  for (const [k, v] of Object.entries({ ...params, key: apiKey() })) url.searchParams.set(k, v)
  const res = await fetch(url)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`YouTube : ${data?.error?.message ?? `HTTP ${res.status}`}`)
  return data as T
}

/** Retrouve une chaîne à partir de son adresse (…/@nom, …/channel/UC…) ou de son @nom. */
export async function resolveChannel(input: string): Promise<ChannelInfo> {
  const trimmed = input.trim()
  const handle = trimmed.match(/@([\w.-]+)/)?.[1]
  const id = trimmed.match(/channel\/(UC[\w-]{20,})/)?.[1] ?? (/^UC[\w-]{20,}$/.test(trimmed) ? trimmed : null)
  if (!handle && !id) throw new Error('Adresse de chaîne non reconnue (ex. https://www.youtube.com/@NomDeLaChaine).')

  const data = await call<{ items?: { id: string; snippet: { title: string }; contentDetails: { relatedPlaylists: { uploads: string } } }[] }>(
    '/channels',
    { part: 'snippet,contentDetails', ...(id ? { id } : { forHandle: `@${handle}` }) },
  )
  const channel = data.items?.[0]
  if (!channel) throw new Error('Chaîne introuvable.')
  return { channelId: channel.id, name: channel.snippet.title, uploadsPlaylistId: channel.contentDetails.relatedPlaylists.uploads }
}

/** Durée ISO 8601 (PT4M7S) en secondes. */
function parseDuration(iso: string | undefined): number | null {
  const m = iso?.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!m) return null
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)
}

/** Toutes les vidéos publiques d'une chaîne (ou seulement celles absentes de `known`). */
export async function listChannelVideos(uploadsPlaylistId: string, known: Set<string> = new Set()): Promise<VideoInfo[]> {
  const ids: string[] = []
  let pageToken: string | undefined
  do {
    const page = await call<{ items: { contentDetails: { videoId: string } }[]; nextPageToken?: string }>('/playlistItems', {
      part: 'contentDetails',
      playlistId: uploadsPlaylistId,
      maxResults: '50',
      ...(pageToken ? { pageToken } : {}),
    })
    ids.push(...page.items.map((i) => i.contentDetails.videoId))
    pageToken = page.nextPageToken
  } while (pageToken)

  const fresh = ids.filter((id) => !known.has(id))
  const videos: VideoInfo[] = []
  for (let i = 0; i < fresh.length; i += 50) {
    const batch = await call<{ items: { id: string; snippet: { title: string; description: string; publishedAt: string }; contentDetails: { duration: string } }[] }>(
      '/videos',
      { part: 'snippet,contentDetails', id: fresh.slice(i, i + 50).join(',') },
    )
    for (const v of batch.items) {
      videos.push({
        videoId: v.id,
        title: v.snippet.title,
        description: v.snippet.description ?? '',
        durationSec: parseDuration(v.contentDetails.duration),
        publishedAt: v.snippet.publishedAt ?? null,
      })
    }
  }
  return videos
}

export const videoUrl = (videoId: string) => `https://www.youtube.com/watch?v=${videoId}`
