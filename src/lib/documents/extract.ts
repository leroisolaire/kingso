import 'server-only'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Lecture des pages scannées / images : Haiku 5.5 (vision), effort bas = transcription rapide et peu chère
const OCR_MODEL = 'claude-haiku-5-5'
/** Une page avec moins de caractères que ça est considérée comme scannée (image). */
const MIN_TEXT_CHARS = 60
const MAX_OCR_PAGES = 150
const OCR_CONCURRENCY = 4

export interface ExtractedDocument {
  /** Texte par page (index 0 = page 1), ou un seul élément pour un document sans pages */
  pages: string[]
  paginated: boolean
  /** Nombre de pages lues par Claude (scans, images) */
  ocrPages: number
}

export const SUPPORTED_EXTENSIONS = ['pdf', 'docx', 'txt', 'md', 'csv', 'jpg', 'jpeg', 'png', 'webp'] as const

const IMAGE_TYPES: Record<string, 'image/jpeg' | 'image/png' | 'image/webp'> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
}

export function fileExtension(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() ?? ''
}

const TRANSCRIBE_PROMPT = `Cette image est une page d'un document technique de Le Roi Solaire (notice, fiche technique, procédure…).
Transcris fidèlement TOUT le texte visible, dans l'ordre de lecture, en texte brut (pas de markdown).
- Tableaux : une ligne par rangée, colonnes séparées par " | ", en gardant la ligne d'en-tête.
- Codes erreur, références, valeurs et unités : recopie-les exactement.
- Schéma, photo ou pictogramme utile : décris-le brièvement entre crochets, ex. [Schéma : raccordement de la sonde extérieure sur les bornes 1 et 2].
- N'ajoute aucune information qui ne figure pas sur la page.
Si la page ne contient rien d'utile, réponds uniquement : VIDE`

async function transcribeImage(data: string, mediaType: 'image/jpeg' | 'image/png' | 'image/webp'): Promise<string> {
  const message = await anthropic.messages.create({
    model: OCR_MODEL,
    max_tokens: 8000,
    output_config: { effort: 'low' },
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data } },
        { type: 'text', text: TRANSCRIBE_PROMPT },
      ],
    }],
  })
  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim()
  return text === 'VIDE' ? '' : text
}

/** Exécute les tâches par petits groupes pour ne pas saturer l'API. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i])
    }
  }))
  return results
}

function cleanText(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

async function extractPdf(buffer: Buffer): Promise<ExtractedDocument> {
  // pdfjs-dist (utilisé par pdf-parse) référence DOMMatrix au chargement du module,
  // absent par défaut en Node.js — on le polyfill depuis @napi-rs/canvas avant l'import.
  if (typeof globalThis.DOMMatrix === 'undefined') {
    const { DOMMatrix } = await import('@napi-rs/canvas')
    globalThis.DOMMatrix = DOMMatrix as unknown as typeof globalThis.DOMMatrix
  }
  const { PDFParse } = await import('pdf-parse')
  const parser = new PDFParse({ data: new Uint8Array(buffer) })
  try {
    const result = await parser.getText()
    const pages: string[] = new Array(result.total).fill('')
    for (const p of result.pages) pages[p.num - 1] = cleanText(p.text)

    // Pages sans texte exploitable = scans ou pages-images : lecture par Claude
    const scanned = pages
      .map((text, i) => ({ text, num: i + 1 }))
      .filter((p) => p.text.replace(/\s/g, '').length < MIN_TEXT_CHARS)
      .map((p) => p.num)

    if (scanned.length > MAX_OCR_PAGES) {
      throw new Error(`${scanned.length} pages scannées : c'est trop pour un seul fichier (${MAX_OCR_PAGES} max). Découpez le PDF.`)
    }

    // Rendu des pages par petits lots pour limiter la mémoire utilisée
    for (let i = 0; i < scanned.length; i += OCR_CONCURRENCY) {
      const batch = scanned.slice(i, i + OCR_CONCURRENCY)
      const shots = await parser.getScreenshot({ partial: batch, desiredWidth: 1500, imageBuffer: true, imageDataUrl: false })
      const texts = await mapLimit(shots.pages, OCR_CONCURRENCY, (shot) =>
        transcribeImage(Buffer.from(shot.data).toString('base64'), 'image/png'))
      shots.pages.forEach((shot, j) => {
        if (texts[j]) pages[shot.pageNumber - 1] = cleanText(texts[j])
      })
    }

    return { pages, paginated: true, ocrPages: scanned.length }
  } finally {
    await parser.destroy()
  }
}

/** Réduit les grosses photos (l'API refuse les images de plus de 5 Mo). */
async function normalizeImage(buffer: Buffer, mediaType: 'image/jpeg' | 'image/png' | 'image/webp') {
  if (buffer.length <= 3_500_000) return { data: buffer.toString('base64'), mediaType }
  const { loadImage, createCanvas } = await import('@napi-rs/canvas')
  const img = await loadImage(buffer)
  const scale = Math.min(1, 2000 / Math.max(img.width, img.height))
  const canvas = createCanvas(Math.round(img.width * scale), Math.round(img.height * scale))
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
  const jpeg = await canvas.encode('jpeg', 85)
  return { data: Buffer.from(jpeg).toString('base64'), mediaType: 'image/jpeg' as const }
}

export async function extractDocument(buffer: Buffer, fileName: string): Promise<ExtractedDocument> {
  const ext = fileExtension(fileName)

  if (ext === 'pdf') return extractPdf(buffer)

  if (ext === 'docx') {
    const mammoth = await import('mammoth')
    const result = await mammoth.extractRawText({ buffer })
    return { pages: [cleanText(result.value)], paginated: false, ocrPages: 0 }
  }

  if (ext === 'txt' || ext === 'md' || ext === 'csv') {
    return { pages: [cleanText(buffer.toString('utf-8'))], paginated: false, ocrPages: 0 }
  }

  if (IMAGE_TYPES[ext]) {
    const { data, mediaType } = await normalizeImage(buffer, IMAGE_TYPES[ext])
    const text = await transcribeImage(data, mediaType)
    return { pages: [cleanText(text)], paginated: false, ocrPages: 1 }
  }

  throw new Error(`Format non pris en charge (.${ext}). Formats acceptés : ${SUPPORTED_EXTENSIONS.join(', ')}.`)
}
