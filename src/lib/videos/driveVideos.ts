import 'server-only'
import { db } from '@/lib/db/client'
import { rechunkFromContent } from '@/lib/documents/process'
import { driveViewUrl, getFile, openFileStream, setPublicLink } from '@/lib/drive/google'
import { isGeminiConfigured, summarizeVideoFile } from './gemini'

// Vidéos déposées dans le Drive (ex. démonstration filmée sur l'écran d'une PAC) : Gemini les
// regarde et rédige une fiche, qui devient le contenu du document. La vidéo reste dans le Drive,
// rangée comme les autres documents ; son lien est donné au client pour voir la démonstration.

export const VIDEO_EXTENSIONS = ['mp4', 'mov', 'm4v', 'webm', 'avi', 'mpeg', 'mpg', '3gp', 'wmv'] as const
export const MAX_VIDEO_BYTES = 1500 * 1024 * 1024 // Gemini accepte jusqu'à 2 Go

export function isVideoFile(mimeType: string | null | undefined, fileName: string | null | undefined): boolean {
  if (mimeType?.startsWith('video/')) return true
  const ext = fileName?.split('.').pop()?.toLowerCase() ?? ''
  return (VIDEO_EXTENSIONS as readonly string[]).includes(ext)
}

const MIME_BY_EXT: Record<string, string> = {
  mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', avi: 'video/x-msvideo',
  mpeg: 'video/mpeg', mpg: 'video/mpeg', '3gp': 'video/3gpp', wmv: 'video/x-ms-wmv',
}

/** Lit la vidéo du Drive avec Gemini et enregistre la fiche comme contenu du document (puis indexation). */
export async function readDriveVideo(docId: string, driveFileId: string): Promise<void> {
  if (!isGeminiConfigured()) throw new Error('Gemini n\'est pas configuré (GEMINI_API_KEY) : impossible de lire les vidéos.')
  const file = await getFile(driveFileId)
  const size = Number(file.size ?? 0)
  if (size > MAX_VIDEO_BYTES) throw new Error('Vidéo de plus de 1,5 Go : à raccourcir ou à compresser.')
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  const mimeType = file.mimeType?.startsWith('video/') ? file.mimeType : MIME_BY_EXT[ext] ?? 'video/mp4'

  await db.document.update({ where: { id: docId }, data: { status: 'PROCESSING', statusMessage: 'Lecture de la vidéo par Gemini…' } })
  const sheet = await summarizeVideoFile({ stream: await openFileStream(driveFileId), size, mimeType, name: file.name })

  // Même présentation que les fiches YouTube : le lien est retrouvé par la recherche pour être donné au client
  const link = driveViewUrl(driveFileId)
  const content = [
    'Vidéo de démonstration de l\'équipe Le Roi Solaire',
    `Lien de la vidéo : ${link}`,
    '',
    sheet,
    '',
    `Pour voir la démonstration en vidéo : ${link}`,
  ].join('\n')

  await db.document.update({
    where: { id: docId },
    data: {
      content, fileName: file.name, mimeType, fileSize: size, storagePath: null, contentHash: null,
      driveMd5: file.md5Checksum ?? `modified:${file.modifiedTime}`, driveModifiedTime: new Date(file.modifiedTime),
    },
  })
  await rechunkFromContent(docId, content)
}

/**
 * Accès à la vidéo par lien : ouvert seulement quand la vidéo est en Public et a passé le contrôle
 * de confidentialité ; refermé sinon (passée en Interne, jugée confidentielle, écartée).
 * Renvoie l'état appliqué, ou null si le document n'est pas une vidéo du Drive.
 */
export async function syncVideoSharing(docId: string): Promise<boolean | null> {
  const doc = await db.document.findUnique({
    where: { id: docId },
    select: { type: true, reviewState: true, classifiedAt: true, mimeType: true, fileName: true, driveFileId: true },
  })
  if (!doc?.driveFileId || !isVideoFile(doc.mimeType, doc.fileName)) return null
  const shared = doc.type === 'PUBLIC' && doc.reviewState === null && doc.classifiedAt !== null
  await setPublicLink(doc.driveFileId, shared)
  return shared
}
