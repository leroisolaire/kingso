import 'server-only'

// Gemini (Google) « regarde » une vidéo, image et son, et rédige une fiche pratique :
// vidéo YouTube publique (lien) ou vidéo déposée dans le Drive (envoyée à Gemini puis effacée).
// Clé GEMINI_API_KEY (créée dans AI Studio).
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash'
/** Essayés dans l'ordre quand le modèle principal est saturé. */
const FALLBACK_MODELS = ['gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash']
const API = 'https://generativelanguage.googleapis.com'

/** Clé Gemini (AI Studio) ; à défaut, la clé Google commune. */
const geminiKey = () => process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY

export function isGeminiConfigured(): boolean {
  return Boolean(geminiKey())
}

const SHEET_FORMAT = `Rédige la fiche en français, AVEC TES PROPRES MOTS (ne recopie pas la transcription), en texte simple sans markdown :
Sujet : en une phrase, le problème ou l'opération traité.
Équipements concernés : marque, gamme, modèles, télécommande ou application, tels qu'indiqués ou montrés dans la vidéo.
Public : « utilisateur » si un particulier peut le faire seul, « professionnel » si la vidéo s'adresse à un installateur ou demande d'ouvrir l'appareil, d'intervenir sur l'électricité ou le circuit frigorifique.
Étapes : la procédure numérotée (1. 2. 3.), une action par étape, avec les écrans, menus, boutons, codes et valeurs montrés.
Précautions : les mises en garde de la vidéo (couper l'alimentation, etc.).
Si la vidéo ne montre pas de procédure, résume en quelques lignes ce qu'elle explique.
N'ajoute rien qui ne soit pas dans la vidéo.`

const YOUTUBE_PROMPT = `Tu prépares une fiche pratique pour l'assistant de Le Roi Solaire (installateur de pompes à chaleur, climatisations et panneaux solaires), à partir de cette vidéo d'un fabricant ou d'un installateur.

${SHEET_FORMAT}`

const TEAM_PROMPT = `Tu prépares une fiche pratique pour l'assistant de Le Roi Solaire (installateur de pompes à chaleur, climatisations et panneaux solaires), à partir de cette vidéo tournée par l'équipe : souvent une démonstration filmée sur l'écran ou la télécommande d'un appareil, commentée à voix haute.

Sois très précis sur la navigation : nom exact de chaque bouton, de chaque menu et de chaque écran tel qu'il s'affiche, dans l'ordre, et ce qui apparaît à l'écran après chaque action. Appuie-toi sur ce qui est dit ET sur ce qui est montré.

${SHEET_FORMAT}`

/** Appel Gemini avec nouvel essai puis modèles de secours quand le modèle est saturé (429/500/503). */
async function generate(videoPart: Record<string, unknown>, prompt: string, timeoutMs = 200_000): Promise<string> {
  const attempts = [
    { model: MODEL, wait: 0 },
    { model: MODEL, wait: 10_000 },
    ...FALLBACK_MODELS.filter((m) => m !== MODEL).map((model) => ({ model, wait: 0 })),
  ]
  const deadline = Date.now() + timeoutMs // sous la limite de 300 s de la fonction Vercel
  let res!: Response
  let data
  for (const [i, { model, wait }] of attempts.entries()) {
    if (wait) await new Promise((r) => setTimeout(r, wait))
    try {
      res = await fetch(`${API}/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey() ?? '' },
        body: JSON.stringify({
          contents: [{ parts: [videoPart, { text: prompt }] }],
          // Images en basse définition (le son et les textes à l'écran suffisent) et réflexion courte : beaucoup plus rapide
          generationConfig: {
            mediaResolution: 'MEDIA_RESOLUTION_LOW',
            thinkingConfig: { thinkingLevel: 'low' },
          },
        }),
        signal: AbortSignal.timeout(Math.max(deadline - Date.now(), 1_000)),
      })
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw new Error('Gemini a mis trop de temps à lire la vidéo. Réessayez plus tard.')
      }
      throw new Error(`Gemini injoignable : ${error instanceof Error ? (error.cause as Error)?.message ?? error.message : error}`)
    }
    data = await res.json().catch(() => ({}))
    if (res.ok || ![429, 500, 503].includes(res.status)) break
    if (i < attempts.length - 1 && Date.now() + attempts[i + 1].wait > deadline - 60_000) break
  }
  if (!res.ok) throw new Error(`Gemini : ${data?.error?.message ?? `HTTP ${res.status}`}`)
  const text = (data.candidates?.[0]?.content?.parts ?? [])
    .map((p: { text?: string }) => p.text ?? '')
    .join('')
    .trim()
  if (!text) throw new Error(`Gemini n'a pas pu lire la vidéo (${data.candidates?.[0]?.finishReason ?? 'réponse vide'}).`)
  return text
}

/** Fiche pratique rédigée à partir d'une vidéo YouTube publique (texte brut). */
export async function summarizeVideo(url: string): Promise<string> {
  return generate({ file_data: { file_uri: url } }, YOUTUBE_PROMPT)
}

/** Envoi d'une vidéo à Gemini par morceaux (protocole « resumable »), sans la charger en mémoire. */
async function uploadToGemini(stream: ReadableStream<Uint8Array>, size: number, mimeType: string, name: string) {
  const start = await fetch(`${API}/upload/v1beta/files`, {
    method: 'POST',
    headers: {
      'x-goog-api-key': geminiKey() ?? '',
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(size),
      'X-Goog-Upload-Header-Content-Type': mimeType,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file: { display_name: name.slice(0, 100) } }),
  })
  const uploadUrl = start.headers.get('x-goog-upload-url')
  if (!start.ok || !uploadUrl) throw new Error(`Gemini (envoi de la vidéo) : HTTP ${start.status}`)
  // Morceaux multiples de la granularité imposée (8 Mo en général), sauf le dernier
  const granularity = Number(start.headers.get('x-goog-upload-chunk-granularity')) || 8 * 1024 * 1024
  const chunkSize = granularity * Math.max(1, Math.floor((16 * 1024 * 1024) / granularity))

  const reader = stream.getReader()
  let pending: Buffer[] = []
  let pendingBytes = 0
  let offset = 0
  let ended = false
  let result: { file?: { name: string; uri: string; state: string; mimeType: string } } = {}

  while (!ended || pendingBytes > 0) {
    while (!ended && pendingBytes < chunkSize) {
      const { done, value } = await reader.read()
      if (done) ended = true
      else {
        pending.push(Buffer.from(value))
        pendingBytes += value.byteLength
      }
    }
    const all = Buffer.concat(pending)
    const last = ended && all.length <= chunkSize
    const chunk = last ? all : all.subarray(0, chunkSize)
    const rest = last ? Buffer.alloc(0) : all.subarray(chunkSize)
    const res = await fetch(uploadUrl, {
      method: 'POST',
      headers: { 'X-Goog-Upload-Command': last ? 'upload, finalize' : 'upload', 'X-Goog-Upload-Offset': String(offset) },
      body: new Uint8Array(chunk),
    })
    if (!res.ok) throw new Error(`Gemini (envoi de la vidéo) : HTTP ${res.status}`)
    offset += chunk.length
    pending = rest.length ? [rest] : []
    pendingBytes = rest.length
    if (last) {
      result = await res.json()
      break
    }
  }
  if (!result.file) throw new Error('Gemini (envoi de la vidéo) : réponse inattendue.')
  return result.file
}

/** Fiche pratique rédigée à partir d'une vidéo de l'équipe (déposée dans le Drive). */
export async function summarizeVideoFile(params: {
  stream: ReadableStream<Uint8Array>
  size: number
  mimeType: string
  name: string
}): Promise<string> {
  const started = Date.now()
  let file = await uploadToGemini(params.stream, params.size, params.mimeType, params.name)
  try {
    // Gemini prépare la vidéo avant de pouvoir la lire (quelques secondes à quelques minutes)
    while (file.state === 'PROCESSING') {
      if (Date.now() - started > 150_000) throw new Error('Gemini met trop de temps à préparer la vidéo. Réessayez plus tard.')
      await new Promise((r) => setTimeout(r, 5_000))
      const res = await fetch(`${API}/v1beta/${file.name}`, { headers: { 'x-goog-api-key': geminiKey() ?? '' } })
      file = await res.json()
    }
    if (file.state !== 'ACTIVE') throw new Error('Gemini n\'a pas pu lire ce fichier vidéo.')
    const left = 230_000 - (Date.now() - started)
    if (left < 40_000) throw new Error('Plus assez de temps pour lire la vidéo : elle sera reprise au prochain passage.')
    return await generate({ file_data: { mime_type: file.mimeType || params.mimeType, file_uri: file.uri } }, TEAM_PROMPT, left)
  } finally {
    // Gemini l'efface de lui-même au bout de 48 h ; on n'attend pas
    await fetch(`${API}/v1beta/${file.name}`, { method: 'DELETE', headers: { 'x-goog-api-key': geminiKey() ?? '' } }).catch(() => {})
  }
}
