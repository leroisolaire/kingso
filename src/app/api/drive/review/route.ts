import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/dal'
import { db } from '@/lib/db/client'
import { findOrCreateFolder, moveFile } from '@/lib/drive/google'
import { logDriveEvent } from '@/lib/drive/sync'
import { syncVideoSharing } from '@/lib/videos/driveVideos'

type Action = 'public' | 'internal' | 'ignore' | 'retry'

/** Décision de l'équipe sur un document mis de côté par la synchronisation Drive. */
export async function POST(request: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  const { documentId, action } = (await request.json()) as { documentId?: string; action?: Action }
  if (typeof documentId !== 'string' || !['public', 'internal', 'ignore', 'retry'].includes(action ?? '')) {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 })
  }
  const doc = await db.document.findUnique({
    where: { id: documentId },
    select: { id: true, title: true, driveFileId: true, drivePath: true, reviewState: true },
  })
  if (!doc) return NextResponse.json({ error: 'Document introuvable.' }, { status: 404 })

  try {
    if (action === 'public') {
      await db.document.update({ where: { id: doc.id }, data: { reviewState: null, reviewNote: null, classifiedAt: new Date() } })
      await logDriveEvent('VALIDATED_PUBLIC', doc.title, 'Validé comme public : utilisable par les chats clients', doc.id)
    } else if (action === 'ignore') {
      await db.document.update({ where: { id: doc.id }, data: { reviewState: 'IGNORED' } })
      await logDriveEvent('IGNORED', doc.title, 'Écarté : non utilisé par Kingso', doc.id)
    } else if (action === 'retry') {
      await db.document.update({ where: { id: doc.id }, data: { classifiedAt: null, reviewNote: null } })
    } else {
      // Passer en Interne : même famille / marque, dans l'espace Interne du Drive
      const source = await db.driveSource.findFirst({ select: { folderId: true } })
      if (!source || !doc.driveFileId) throw new Error('Document non relié au Drive.')
      const folders = (doc.drivePath ?? '').split('/').filter(Boolean).slice(1)
      let folderId = await findOrCreateFolder(source.folderId, 'Interne')
      for (const name of folders) folderId = await findOrCreateFolder(folderId, name)
      await moveFile(doc.driveFileId, folderId)
      const drivePath = ['Interne', ...folders].join('/')
      await db.document.update({
        where: { id: doc.id },
        data: { type: 'INTERNAL', drivePath, reviewState: null, reviewNote: null, classifiedAt: new Date() },
      })
      await logDriveEvent('MOVED_INTERNAL', doc.title, `Déplacé dans ${drivePath}`, doc.id)
    }
    // Vidéo : lien ouvert si validée en Public, refermé sinon
    await syncVideoSharing(doc.id).catch((e) => logDriveEvent('ERROR', doc.title, `Partage de la vidéo : ${e instanceof Error ? e.message : e}`, doc.id))
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 })
  }
}
