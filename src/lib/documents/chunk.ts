// Découpe un document en passages d'environ une demi-page, en respectant les paragraphes.
// Un léger chevauchement évite de couper une explication (ou une ligne de tableau) en deux.

export interface Chunk {
  content: string
  pageStart: number | null
  pageEnd: number | null
}

const TARGET = 1400 // caractères visés par passage
const MAX = 2200 // au-delà, un paragraphe est redécoupé
const OVERLAP = 250

interface Piece {
  text: string
  page: number | null
}

/** Redécoupe un paragraphe trop long par lignes, puis par phrases. */
function splitLong(text: string): string[] {
  if (text.length <= MAX) return [text]
  const parts = text.includes('\n') ? text.split('\n') : text.split(/(?<=[.!?;])\s+/)
  const out: string[] = []
  let current = ''
  for (const part of parts) {
    if (current && current.length + part.length + 1 > TARGET) {
      out.push(current)
      current = ''
    }
    // Ligne sans ponctuation plus longue que MAX : coupe brute
    if (part.length > MAX) {
      for (let i = 0; i < part.length; i += TARGET) out.push(part.slice(i, i + TARGET))
      continue
    }
    current = current ? `${current}${text.includes('\n') ? '\n' : ' '}${part}` : part
  }
  if (current) out.push(current)
  return out
}

/**
 * @param pages texte de chaque page (index 0 = page 1), ou un seul élément pour un document sans pages
 * @param paginated false pour Word / texte : pas de numéro de page
 */
export function chunkPages(pages: string[], paginated: boolean): Chunk[] {
  const pieces: Piece[] = []
  pages.forEach((pageText, i) => {
    for (const para of pageText.split(/\n\s*\n/)) {
      const text = para.replace(/[ \t]+/g, ' ').trim()
      if (!text) continue
      for (const part of splitLong(text)) pieces.push({ text: part, page: paginated ? i + 1 : null })
    }
  })

  const chunks: Chunk[] = []
  let buffer: Piece[] = []
  let length = 0

  const flush = () => {
    if (buffer.length === 0) return
    chunks.push({
      content: buffer.map((p) => p.text).join('\n\n'),
      pageStart: buffer[0].page,
      pageEnd: buffer[buffer.length - 1].page,
    })
    // Chevauchement : on reprend la fin du passage précédent si elle est courte
    const last = buffer[buffer.length - 1]
    buffer = last.text.length <= OVERLAP ? [last] : []
    length = buffer.reduce((n, p) => n + p.text.length, 0)
  }

  for (const piece of pieces) {
    if (length > 0 && length + piece.text.length > TARGET) flush()
    buffer.push(piece)
    length += piece.text.length
  }
  // Le tampon contient toujours au moins le dernier paragraphe ajouté
  flush()
  return chunks
}
