import 'server-only'
import { createHash } from 'node:crypto'
import type { DocumentType, Prisma } from '@prisma/client'
import { db } from '@/lib/db/client'
import { SUPPORTED_EXTENSIONS, fileExtension } from '@/lib/documents/extract'
import { deleteDocumentFile, processDocument, rechunkFromContent, uploadDocumentFile } from '@/lib/documents/process'
import {
  FOLDER_MIME, downloadFile, effectiveFileName, getFile, isGoogleNative, listChildren, type DriveFile,
} from './google'

// Synchronisation Drive → base documentaire. Le Drive fait foi :
//   1er niveau de dossier = visibilité (Public / Interne / Franchisé)
//   2e niveau = catégorie (même nom, ou correspondance enregistrée dans le back-office)
//   3e niveau = sous-catégorie (créée si besoin) ; plus profond : rangé dans la sous-catégorie
// En deux temps : scanDrive (rapide : rattache, déplace, renomme, supprime, repère les
// nouveautés) puis processDriveQueue (téléchargement + lecture + indexation, reprenable).

const MAX_FILE_BYTES = 50 * 1024 * 1024
const MAX_DEPTH = 8

const VISIBILITY: Record<string, DocumentType> = {
  public: 'PUBLIC',
  interne: 'INTERNAL',
  franchise: 'FRANCHISE',
  franchises: 'FRANCHISE',
}

export interface SyncReport {
  startedAt: string
  finishedAt?: string
  filesSeen: number
  linked: number
  created: number
  updated: number
  modified: number
  deleted: number
  skipped: { path: string; reason: string }[]
  unmappedFolders: string[]
  error?: string
}

interface ScannedFile extends DriveFile {
  path: string[] // dossiers depuis la racine, ex. ['Public', 'PAC', 'Hitachi']
}

const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
const titleOf = (name: string) => name.replace(/\.[^./]+$/, '').trim()

/** Parcourt récursivement le dossier racine. */
async function walk(folderId: string, path: string[], out: ScannedFile[], depth = 0) {
  if (depth > MAX_DEPTH) return
  const children = await listChildren(folderId)
  for (const child of children) {
    if (child.mimeType === FOLDER_MIME) await walk(child.id, [...path, child.name], out, depth + 1)
    else out.push({ ...child, path })
  }
}

/** Visibilité + catégorie déduites de l'emplacement du fichier. */
async function makeResolver() {
  const [categories, mappings] = await Promise.all([
    db.category.findMany({ select: { id: true, name: true, parentId: true } }),
    db.driveCategoryMapping.findMany(),
  ])
  const mappingByName = new Map(mappings.map((m) => [m.folderName, m.categoryId]))
  const unmapped = new Set<string>()

  async function resolve(path: string[]): Promise<{ type: DocumentType; categoryId: string } | { skip: string }> {
    const type = path[0] ? VISIBILITY[normalize(path[0])] : undefined
    if (!type) return { skip: 'hors des dossiers Public / Interne / Franchisé' }
    if (path.length < 2) return { skip: 'à ranger dans un dossier de catégorie (ex. Public/PAC/…)' }

    const folder = path[1]
    const parent = mappingByName.get(normalize(folder))
      ?? categories.find((c) => !c.parentId && normalize(c.name) === normalize(folder))?.id
    if (!parent) {
      unmapped.add(folder)
      return { skip: `dossier « ${folder} » sans catégorie correspondante` }
    }
    if (path.length < 3) return { type, categoryId: parent }

    const subName = path[2].trim()
    let sub = categories.find((c) => c.parentId === parent && normalize(c.name) === normalize(subName))
    if (!sub) {
      const created = await db.category.create({ data: { name: subName, parentId: parent }, select: { id: true, name: true, parentId: true } })
      categories.push(created)
      sub = created
    }
    return { type, categoryId: sub.id }
  }

  return { resolve, unmapped }
}

/** Le contenu du fichier Drive a-t-il changé depuis le dernier traitement ? */
function contentChanged(doc: { driveMd5: string | null; driveModifiedTime: Date | null }, file: DriveFile) {
  if (doc.driveMd5 === null) return true
  if (file.md5Checksum) return file.md5Checksum !== doc.driveMd5
  // Google Docs / Sheets : pas d'empreinte, on se fie à la date de modification
  return !doc.driveModifiedTime || new Date(file.modifiedTime) > doc.driveModifiedTime
}

/** Étape 1 : compare le Drive à la base et applique ce qui ne demande pas de téléchargement. */
export async function scanDrive(sourceId: string): Promise<SyncReport> {
  const source = await db.driveSource.findUniqueOrThrow({ where: { id: sourceId } })
  const report: SyncReport = {
    startedAt: new Date().toISOString(),
    filesSeen: 0, linked: 0, created: 0, updated: 0, modified: 0, deleted: 0, skipped: [], unmappedFolders: [],
  }

  try {
    const files: ScannedFile[] = []
    await walk(source.folderId, [], files)
    report.filesSeen = files.length

    const { resolve, unmapped } = await makeResolver()
    const linkedDocs = await db.document.findMany({
      where: { driveFileId: { not: null } },
      select: { id: true, title: true, content: true, type: true, categoryId: true, status: true, driveFileId: true, driveMd5: true, driveModifiedTime: true, drivePath: true },
    })
    const byDriveId = new Map(linkedDocs.map((d) => [d.driveFileId!, d]))
    const seen = new Set<string>()

    for (const file of files) {
      const where = [...file.path, file.name].join('/')
      const fileName = effectiveFileName(file)
      if (!fileName || !(SUPPORTED_EXTENSIONS as readonly string[]).includes(fileExtension(fileName))) {
        report.skipped.push({ path: where, reason: 'format non pris en charge' })
        continue
      }
      if (!isGoogleNative(file.mimeType) && Number(file.size ?? 0) > MAX_FILE_BYTES) {
        report.skipped.push({ path: where, reason: 'plus de 50 Mo (à découper)' })
        continue
      }
      const target = await resolve(file.path)
      if ('skip' in target) {
        report.skipped.push({ path: where, reason: target.skip })
        // Déjà synchronisé mais dossier momentanément sans catégorie (renommé…) : on le garde tel quel
        if (byDriveId.has(file.id)) seen.add(file.id)
        continue
      }

      seen.add(file.id)
      const title = titleOf(file.name)
      const drivePath = file.path.join('/')
      const existing = byDriveId.get(file.id)

      if (existing) {
        const data: Prisma.DocumentUpdateInput = {}
        if (existing.type !== target.type) data.type = target.type
        if (existing.categoryId !== target.categoryId) data.category = { connect: { id: target.categoryId } }
        if (existing.drivePath !== drivePath) data.drivePath = drivePath
        const renamed = existing.title !== title
        if (renamed) data.title = title

        if (contentChanged(existing, file)) {
          // Nouvelle version du fichier : retéléchargée et retraitée par processDriveQueue
          await db.documentChunk.deleteMany({ where: { documentId: existing.id } })
          await db.document.update({
            where: { id: existing.id },
            data: { ...data, driveMd5: null, status: 'PENDING', statusMessage: 'Modifié dans le Drive : à retraiter' },
          })
          report.modified++
        } else if (Object.keys(data).length > 0) {
          await db.document.update({ where: { id: existing.id }, data })
          // Le titre fait partie de l'indexation de chaque passage
          if (renamed && existing.status === 'READY') await rechunkFromContent(existing.id, existing.content)
          report.updated++
        }
        continue
      }

      // Document déjà importé à la main (même nom de fichier et même taille) : on le rattache
      const imported = !isGoogleNative(file.mimeType)
        ? await db.document.findFirst({
            where: { driveFileId: null, fileName: file.name, fileSize: Number(file.size ?? -1) },
            select: { id: true, title: true, content: true, status: true },
          })
        : null
      if (imported) {
        await db.document.update({
          where: { id: imported.id },
          data: {
            driveFileId: file.id, driveMd5: file.md5Checksum ?? null, driveModifiedTime: new Date(file.modifiedTime),
            drivePath, type: target.type, categoryId: target.categoryId, title,
          },
        })
        if (imported.title !== title && imported.status === 'READY') await rechunkFromContent(imported.id, imported.content)
        report.linked++
        continue
      }

      // Nouveau fichier : créé en attente, téléchargé et traité par processDriveQueue
      await db.document.create({
        data: {
          title, content: '', type: target.type, categoryId: target.categoryId,
          driveFileId: file.id, drivePath, fileName, mimeType: file.mimeType,
          fileSize: file.size ? Number(file.size) : null,
          status: 'PENDING', statusMessage: 'Nouveau dans le Drive : à télécharger',
        },
      })
      report.created++
    }

    // Fichiers retirés du Drive (ou sortis des dossiers synchronisés) : retirés de Kingso.
    // Garde-fou : si le Drive paraît vide (accès perdu ?), on ne supprime rien.
    if (files.length > 0) {
      for (const doc of linkedDocs) {
        if (seen.has(doc.driveFileId!)) continue
        const removed = await db.document.delete({ where: { id: doc.id }, select: { storagePath: true } })
        if (removed.storagePath) await deleteDocumentFile(removed.storagePath)
        report.deleted++
      }
    }

    report.unmappedFolders = [...unmapped]
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error)
  }

  report.finishedAt = new Date().toISOString()
  await db.driveSource.update({
    where: { id: sourceId },
    data: { lastSyncAt: new Date(), lastSyncReport: report as unknown as Prisma.InputJsonValue },
  })
  return report
}

/** Télécharge la dernière version du fichier Drive et la dépose dans le stockage privé. */
async function refreshFromDrive(docId: string, driveFileId: string): Promise<'ready-to-process' | 'merged'> {
  const file = await getFile(driveFileId)
  const fileName = effectiveFileName(file) ?? file.name
  const { buffer, mimeType } = await downloadFile(file)
  const contentHash = createHash('sha256').update(buffer).digest('hex')

  // Même contenu qu'un document importé à la main sous un autre nom : on rattache plutôt que dupliquer
  const twin = await db.document.findFirst({
    where: { contentHash, driveFileId: null, id: { not: docId } },
    select: { id: true },
  })
  if (twin) {
    const placeholder = await db.document.delete({ where: { id: docId }, select: { title: true, type: true, categoryId: true, drivePath: true, storagePath: true } })
    if (placeholder.storagePath) await deleteDocumentFile(placeholder.storagePath)
    await db.document.update({
      where: { id: twin.id },
      data: {
        driveFileId, driveMd5: file.md5Checksum ?? `modified:${file.modifiedTime}`, driveModifiedTime: new Date(file.modifiedTime),
        drivePath: placeholder.drivePath, title: placeholder.title, type: placeholder.type, categoryId: placeholder.categoryId,
      },
    })
    return 'merged'
  }

  const previous = await db.document.findUniqueOrThrow({ where: { id: docId }, select: { storagePath: true } })
  const storagePath = await uploadDocumentFile(fileName, buffer, mimeType)
  await db.documentChunk.deleteMany({ where: { documentId: docId } })
  await db.document.update({
    where: { id: docId },
    data: {
      storagePath, fileName, mimeType, fileSize: buffer.length, contentHash,
      driveMd5: file.md5Checksum ?? `modified:${file.modifiedTime}`, driveModifiedTime: new Date(file.modifiedTime),
      status: 'PENDING', statusMessage: 'Téléchargé depuis le Drive',
    },
  })
  if (previous.storagePath) await deleteDocumentFile(previous.storagePath)
  return 'ready-to-process'
}

export interface QueueResult {
  remaining: number
  processed: string[]
  errors: { title: string; message: string }[]
  retryAfter?: number
}

/** Étape 2 : traite les documents Drive en attente, dans le temps imparti (relancer tant que remaining > 0). */
export async function processDriveQueue(budgetMs = 240_000): Promise<QueueResult> {
  const started = Date.now()
  const result: QueueResult = { remaining: 0, processed: [], errors: [] }
  const pendingWhere: Prisma.DocumentWhereInput = { driveFileId: { not: null }, status: { in: ['PENDING', 'PROCESSING'] } }

  while (Date.now() - started < budgetMs - 20_000) {
    const doc = await db.document.findFirst({
      where: pendingWhere,
      orderBy: { updatedAt: 'asc' },
      select: { id: true, title: true, driveFileId: true, driveMd5: true },
    })
    if (!doc) break

    try {
      if (doc.driveMd5 === null) {
        const outcome = await refreshFromDrive(doc.id, doc.driveFileId!)
        if (outcome === 'merged') {
          result.processed.push(`${doc.title} (déjà présent, rattaché)`)
          continue
        }
      }
      const res = await processDocument(doc.id, Math.max(30_000, budgetMs - (Date.now() - started)))
      if (res.status === 'READY') result.processed.push(doc.title)
      else if (res.status === 'ERROR') result.errors.push({ title: doc.title, message: res.message ?? 'Erreur' })
      else {
        // Pause imposée (limite de débit) ou traitement long : on reprendra au prochain appel
        result.retryAfter = res.retryAfter
        break
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await db.document.update({ where: { id: doc.id }, data: { status: 'ERROR', statusMessage: message.slice(0, 500) } }).catch(() => {})
      result.errors.push({ title: doc.title, message })
    }
  }

  result.remaining = await db.document.count({ where: pendingWhere })
  return result
}
