import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/dal'
import { createUploadedDocument, findDocumentByHash } from '@/lib/db/queries/documents'
import { createUploadTarget } from '@/lib/documents/process'
import { SUPPORTED_EXTENSIONS, fileExtension } from '@/lib/documents/extract'
import { db } from '@/lib/db/client'

const MAX_SIZE = 50 * 1024 * 1024

/**
 * Prépare l'import d'un fichier : vérifie les doublons, crée le document (en attente)
 * et renvoie une URL d'envoi direct vers le stockage privé.
 */
export async function POST(request: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  try {
    const body = await request.json()
    const fileName = typeof body.fileName === 'string' ? body.fileName.trim().slice(0, 255) : ''
    const fileSize = Number(body.fileSize)
    const contentHash = typeof body.contentHash === 'string' && /^[a-f0-9]{64}$/.test(body.contentHash) ? body.contentHash : ''
    const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim().slice(0, 200) : fileName
    const type = (['PUBLIC', 'INTERNAL', 'FRANCHISE'] as const).find((t) => t === body.type) ?? 'PUBLIC'
    const categoryId = typeof body.categoryId === 'string' && body.categoryId ? body.categoryId : null

    if (!fileName || !contentHash) return NextResponse.json({ error: 'Fichier invalide.' }, { status: 400 })
    if (!(SUPPORTED_EXTENSIONS as readonly string[]).includes(fileExtension(fileName))) {
      return NextResponse.json({ error: `Format non pris en charge (.${fileExtension(fileName)}).` }, { status: 400 })
    }
    if (!fileSize || fileSize > MAX_SIZE) return NextResponse.json({ error: 'Fichier trop lourd (50 Mo max).' }, { status: 400 })
    if (categoryId && !(await db.category.findUnique({ where: { id: categoryId }, select: { id: true } }))) {
      return NextResponse.json({ error: 'Catégorie introuvable.' }, { status: 400 })
    }

    const duplicate = await findDocumentByHash(contentHash)
    if (duplicate) return NextResponse.json({ duplicate })

    const target = await createUploadTarget(fileName)
    const doc = await createUploadedDocument({
      title,
      type,
      categoryId,
      storagePath: target.path,
      fileName,
      mimeType: typeof body.mimeType === 'string' ? body.mimeType.slice(0, 100) : null,
      fileSize,
      contentHash,
    })
    return NextResponse.json({ id: doc.id, ...target }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[POST /api/documents/uploads]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
