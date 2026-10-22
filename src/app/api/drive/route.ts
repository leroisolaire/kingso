import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/dal'
import { db } from '@/lib/db/client'
import { getFolderName, getServiceAccount, parseDriveLink } from '@/lib/drive/google'

/** Enregistre (ou remplace) le dossier Drive à synchroniser, après avoir vérifié l'accès. */
export async function PUT(request: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  if (!getServiceAccount()) {
    return NextResponse.json({ error: 'Clé Google absente : ajoutez GOOGLE_SERVICE_ACCOUNT_KEY.' }, { status: 400 })
  }
  try {
    const { link } = await request.json()
    const folderId = typeof link === 'string' ? parseDriveLink(link) : null
    if (!folderId) return NextResponse.json({ error: 'Lien Google Drive invalide.' }, { status: 400 })

    const name = await getFolderName(folderId)
    // Une seule source pour l'instant : la nouvelle remplace l'ancienne
    const source = await db.$transaction(async (tx) => {
      await tx.driveSource.deleteMany({ where: { folderId: { not: folderId } } })
      return tx.driveSource.upsert({ where: { folderId }, create: { folderId, name }, update: { name } })
    })
    return NextResponse.json(source)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
