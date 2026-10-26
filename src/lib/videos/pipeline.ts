import 'server-only'
import type { DocumentType } from '@prisma/client'
import { db } from '@/lib/db/client'
import { FOLDER_MIME, findOrCreateFolder, listChildren, uploadTextFile } from '@/lib/drive/google'
import { SORT_FOLDER, logDriveEvent } from '@/lib/drive/sync'
import { isGeminiConfigured, summarizeVideo } from './gemini'
import { triageVideos } from './triage'
import { listChannelVideos, resolveChannel, videoUrl } from './youtube'

// Chaînes YouTube suivies → tri des vidéos (Claude) → validation dans le back-office →
// fiche pratique (Gemini) déposée dans Public/A trier ou Interne/A trier → circuit Drive habituel.

const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()

export async function addVideoSource(url: string, visibility: DocumentType) {
  const channel = await resolveChannel(url)
  return db.videoSource.upsert({
    where: { channelId: channel.channelId },
    create: { ...channel, url: url.trim(), visibility },
    update: { name: channel.name, uploadsPlaylistId: channel.uploadsPlaylistId, visibility, active: true },
  })
}

export interface CheckReport {
  sources: number
  newVideos: number
  relevant: number
  errors: string[]
}

/** Récupère les nouvelles vidéos des chaînes suivies et les fait trier par Kingso. */
export async function checkVideoSources(): Promise<CheckReport> {
  const report: CheckReport = { sources: 0, newVideos: 0, relevant: 0, errors: [] }
  const sources = await db.videoSource.findMany({ where: { active: true } })
  for (const source of sources) {
    report.sources++
    try {
      const known = new Set((await db.videoItem.findMany({ where: { sourceId: source.id }, select: { videoId: true } })).map((v) => v.videoId))
      const fresh = await listChannelVideos(source.uploadsPlaylistId, known)
      const verdicts = fresh.length ? await triageVideos(source.name, fresh) : []
      const byId = new Map(verdicts.map((v) => [v.videoId, v]))
      for (const video of fresh) {
        const verdict = byId.get(video.videoId)
        await db.videoItem.create({
          data: {
            sourceId: source.id, videoId: video.videoId, title: video.title, description: video.description.slice(0, 5000),
            durationSec: video.durationSec, publishedAt: video.publishedAt ? new Date(video.publishedAt) : null,
            relevant: verdict?.relevant ?? null, topic: verdict?.topic ?? null, reason: verdict?.reason ?? null,
            // Vidéos non pertinentes : écartées d'office, mais visibles (et récupérables) dans le back-office
            status: verdict?.relevant ? 'TO_REVIEW' : 'SKIPPED',
          },
        })
        report.newVideos++
        if (verdict?.relevant) report.relevant++
      }
      await db.videoSource.update({ where: { id: source.id }, data: { lastCheckedAt: new Date() } })
      if (fresh.length) await logDriveEvent('VIDEOS_FOUND', source.name, `${fresh.length} nouvelle(s) vidéo(s), ${fresh.filter((v) => byId.get(v.videoId)?.relevant).length} utile(s) à valider`)
    } catch (error) {
      report.errors.push(`${source.name} : ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return report
}

function formatDuration(sec: number | null) {
  if (!sec) return ''
  return `${Math.floor(sec / 60)} min ${String(sec % 60).padStart(2, '0')} s`
}

/** Dossier « A trier » de l'espace Public ou Interne du Drive Kingso. */
async function sortFolderId(visibility: DocumentType): Promise<string> {
  const source = await db.driveSource.findFirst({ select: { folderId: true } })
  if (!source) throw new Error('Aucun Drive Kingso connecté (page Google Drive).')
  const visId = await findOrCreateFolder(source.folderId, visibility === 'PUBLIC' ? 'Public' : 'Interne')
  const existing = (await listChildren(visId)).find((f) => f.mimeType === FOLDER_MIME && normalize(f.name) === SORT_FOLDER)
  return existing?.id ?? (await findOrCreateFolder(visId, 'A trier'))
}

export interface ProcessReport {
  done: string[]
  errors: { title: string; message: string }[]
  remaining: number
}

/** Rédige la fiche des vidéos retenues et la dépose dans « A trier » (relancer tant que remaining > 0). */
export async function processSelectedVideos(budgetMs = 240_000): Promise<ProcessReport> {
  const started = Date.now()
  const report: ProcessReport = { done: [], errors: [], remaining: 0 }

  while (Date.now() - started < budgetMs - 60_000) {
    const item = await db.videoItem.findFirst({
      where: { status: 'SELECTED' },
      orderBy: { publishedAt: 'desc' },
      include: { source: { select: { name: true, visibility: true } } },
    })
    if (!item) break
    try {
      const url = videoUrl(item.videoId)
      // Avec Gemini : fiche rédigée à partir du contenu de la vidéo ; sinon fiche minimale (titre, description, lien)
      const body = isGeminiConfigured()
        ? await summarizeVideo(url)
        : `Sujet : ${item.title}\n\n${item.description.slice(0, 1500)}`
      const content = [
        `Vidéo : ${item.title}`,
        `Chaîne YouTube : ${item.source.name}${item.publishedAt ? ` — publiée le ${item.publishedAt.toLocaleDateString('fr-FR')}` : ''}${item.durationSec ? ` — durée ${formatDuration(item.durationSec)}` : ''}`,
        `Lien de la vidéo : ${url}`,
        '',
        body,
        '',
        `Pour voir la démonstration en vidéo : ${url}`,
      ].join('\n')

      const name = `Vidéo - ${item.title}`.replace(/[\\/:*?"<>|]/g, '-').slice(0, 150)
      const driveFileId = await uploadTextFile(await sortFolderId(item.source.visibility), `${name}.txt`, content)
      await db.videoItem.update({ where: { id: item.id }, data: { status: 'DONE', driveFileId, note: null } })
      await logDriveEvent('VIDEO_SHEET', item.title, `Fiche déposée dans ${item.source.visibility === 'PUBLIC' ? 'Public' : 'Interne'}/A trier`)
      report.done.push(item.title)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await db.videoItem.update({ where: { id: item.id }, data: { status: 'ERROR', note: message.slice(0, 500) } })
      report.errors.push({ title: item.title, message })
    }
  }
  report.remaining = await db.videoItem.count({ where: { status: 'SELECTED' } })
  return report
}
