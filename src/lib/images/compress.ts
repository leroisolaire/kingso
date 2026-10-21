// Compression des photos dans le navigateur avant envoi : une photo de téléphone (4-12 Mo)
// devient un JPEG d'environ 200-500 Ko, assez net pour lire un afficheur ou une étiquette.

export interface PreparedImage {
  mediaType: 'image/jpeg'
  data: string // base64 sans préfixe
  thumbnail: string // petite data URL pour l'affichage dans la conversation
}

const MAX_SIDE = 1568 // taille au-delà de laquelle Claude redimensionne de toute façon
const THUMB_SIDE = 320

async function loadImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      /* format non décodable par createImageBitmap → repli sur <img> */
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return img
  } finally {
    URL.revokeObjectURL(url)
  }
}

function draw(source: ImageBitmap | HTMLImageElement, maxSide: number, quality: number): string {
  const width = source.width
  const height = source.height
  const scale = Math.min(1, maxSide / Math.max(width, height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', quality)
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!file.type.startsWith('image/')) throw new Error('Seules les photos sont acceptées.')
  const source = await loadImage(file)
  const full = draw(source, MAX_SIDE, 0.82)
  const thumbnail = draw(source, THUMB_SIDE, 0.7)
  if ('close' in source) source.close()
  return { mediaType: 'image/jpeg', data: full.split(',')[1], thumbnail }
}
