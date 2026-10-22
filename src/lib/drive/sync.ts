import 'server-only'
import { createHash } from 'node:crypto'
import type { DocumentType, Prisma } from '@prisma/client'
import { db } from '@/lib/db/client'
import { SUPPORTED_EXTENSIONS, fileExtension } from '@/lib/documents/extract'
import { deleteDocumentFile, processDocument, rechunkFromContent, uploadDocumentFile } from '@/lib/documents/process'
import {
  FOLDER_MIME, downloadFile, effectiveFileName, findOrCreateFolder, getFile, isGoogleNative, listChildren, moveFile,
  type DriveFile,
} from './google'
import { classifyDocument, type FamilyOption } from './classify'

// Synchronisation Drive → base documentaire. Le Drive fait foi :
//   1er niveau de dossier = visibilité (Public / Interne / Franchisé)
//   2e niveau = catégorie (même nom, ou correspondance enregistrée dans le back-office)
//   3e niveau = sous-catégorie (créée si besoin) ; plus profond : rangé dans la sous-catégorie
//   Public/À trier et Interne/À trier : Kingso classe, renomme et déplace lui-même le fichier
// Tout document Public passe un contrôle de confidentialité avant de servir aux chats clients.
// En deux temps : scanDrive (rapide : rattache, déplace, renomme, supprime, repère les
// nouveautés) puis processDriveQueue (téléchargement + lecture + indexation, reprenable).

const MAX_FILE_BYTES = 50 * 1024 * 1024
const MAX_DEPTH = 8
export const SORT_FOLDER = 'a trier' // « À trier », comparé sans accent ni majuscule

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

  async function resolve(path: string[]): Promise<{ type: DocumentType; categoryId: string | null; toSort: boolean } | { skip: string }> {
    const type = path[0] ? VISIBILITY[normalize(path[0])] : undefined
    if (!type) return { skip: 'hors des dossiers Public / Interne / Franchisé' }
    if (path.length < 2) return { skip: 'à ranger dans un dossier de catégorie, ou dans « À trier »' }
    // Déposé dans « À trier » : Kingso le classera après l'avoir lu
    if (normalize(path[1]) === SORT_FOLDER) return { type, categoryId: null, toSort: true }

    const folder = path[1]
    const parent = mappingByName.get(normalize(folder))
      ?? categories.find((c) => !c.parentId && normalize(c.name) === normalize(folder))?.id
    if (!parent) {
      unmapped.add(folder)
      return { skip: `dossier « ${folder} » sans catégorie correspondante` }
    }
    if (path.length < 3) return { type, categoryId: parent, toSort: false }

    const subName = path[2].trim()
    let sub = categories.find((c) => c.parentId === parent && normalize(c.name) === normalize(subName))
    if (!sub) {
      const created = await db.category.create({ data: { name: subName, parentId: parent }, select: { id: true, name: true, parentId: true } })
      categories.push(created)
      sub = created
    }
    return { type, categoryId: sub.id, toSort: false }
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
      select: {
        id: true, title: true, content: true, type: true, categoryId: true, status: true, reviewState: true,
        driveFileId: true, driveMd5: true, driveModifiedTime: true, drivePath: true,
      },
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
        if (existing.categoryId !== target.categoryId) {
          data.category = target.categoryId ? { connect: { id: target.categoryId } } : { disconnect: true }
        }
        if (existing.drivePath !== drivePath) data.drivePath = drivePath
        const renamed = existing.title !== title
        if (renamed) data.title = title
        // Changement de visibilité ou remis dans « À trier » : contrôles à refaire
        if (existing.type !== target.type || (target.toSort && existing.reviewState !== 'TO_SORT')) {
          data.type = target.type
          data.reviewState = target.toSort ? 'TO_SORT' : null
          data.reviewNote = null
          data.classifiedAt = null
        } else if (target.toSort) {
          data.classifiedAt = null // pas encore rangé (erreur à la dernière tentative ?) : on réessaie
        }

        if (contentChanged(existing, file)) {
          // Nouvelle version du fichier : retéléchargée et retraitée par processDriveQueue
          await db.documentChunk.deleteMany({ where: { documentId: existing.id } })
          await db.document.update({
            where: { id: existing.id },
            data: {
              ...data, driveMd5: null, status: 'PENDING', statusMessage: 'Modifié dans le Drive : à retraiter',
              // Nouvelle version : contrôle de confidentialité / classement à refaire
              reviewState: target.toSort ? 'TO_SORT' : null, reviewNote: null, classifiedAt: null,
            },
          })
          report.modified++
          await logDriveEvent('MODIFIED', title, `${drivePath}/${file.name}`, existing.id)
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
            reviewState: target.toSort ? 'TO_SORT' : null,
          },
        })
        if (imported.title !== title && imported.status === 'READY') await rechunkFromContent(imported.id, imported.content)
        report.linked++
        continue
      }

      // Nouveau fichier : créé en attente, téléchargé et traité par processDriveQueue
      const created = await db.document.create({
        select: { id: true },
        data: {
          title, content: '', type: target.type, categoryId: target.categoryId,
          reviewState: target.toSort ? 'TO_SORT' : null,
          driveFileId: file.id, drivePath, fileName, mimeType: file.mimeType,
          fileSize: file.size ? Number(file.size) : null,
          status: 'PENDING', statusMessage: 'Nouveau dans le Drive : à télécharger',
        },
      })
      report.created++
      await logDriveEvent('NEW', title, `${drivePath}/${file.name}`, created.id)
    }

    // Fichiers retirés du Drive (ou sortis des dossiers synchronisés) : retirés de Kingso.
    // Garde-fou : si le Drive paraît vide (accès perdu ?), on ne supprime rien.
    if (files.length > 0) {
      for (const doc of linkedDocs) {
        if (seen.has(doc.driveFileId!)) continue
        const removed = await db.document.delete({ where: { id: doc.id }, select: { storagePath: true } })
        if (removed.storagePath) await deleteDocumentFile(removed.storagePath)
        report.deleted++
        await logDriveEvent('DELETED', doc.title, `${doc.drivePath ?? ''} (retiré du Drive)`)
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
/** Documents Drive à classer (« À trier ») ou à contrôler (Public pas encore vérifié). */
const toClassifyWhere: Prisma.DocumentWhereInput = {
  driveFileId: { not: null },
  status: 'READY',
  classifiedAt: null,
  OR: [{ reviewState: 'TO_SORT' }, { type: 'PUBLIC', reviewState: null }],
}

export async function logDriveEvent(kind: string, title: string, detail?: string, documentId?: string) {
  await db.driveEvent.create({ data: { kind, title, detail, documentId } }).catch(() => {})
}

/** Familles connues : dossiers de 2e niveau du Drive (avec leurs marques) et catégories principales. */
async function loadFamilies(rootId: string): Promise<FamilyOption[]> {
  const [categories, mappings] = await Promise.all([
    db.category.findMany({ select: { id: true, name: true, parentId: true } }),
    db.driveCategoryMapping.findMany(),
  ])
  const byFolder = new Map<string, FamilyOption>()
  const categoryNameOf = (folder: string) => {
    const id = mappings.find((m) => m.folderName === normalize(folder))?.categoryId
      ?? categories.find((c) => !c.parentId && normalize(c.name) === normalize(folder))?.id
    return categories.find((c) => c.id === id)?.name ?? folder
  }

  for (const vis of (await listChildren(rootId)).filter((f) => f.mimeType === FOLDER_MIME)) {
    for (const family of (await listChildren(vis.id)).filter((f) => f.mimeType === FOLDER_MIME && normalize(f.name) !== SORT_FOLDER)) {
      const brandFolders = (await listChildren(family.id)).filter((f) => f.mimeType === FOLDER_MIME)
      const subfolders: Record<string, string[]> = {}
      for (const b of brandFolders) {
        subfolders[b.name] = (await listChildren(b.id)).filter((f) => f.mimeType === FOLDER_MIME).map((f) => f.name)
      }
      const brands = brandFolders.map((f) => f.name)
      const known = byFolder.get(normalize(family.name))
      if (known) {
        known.brands = [...new Set([...known.brands, ...brands])]
        for (const [b, subs] of Object.entries(subfolders)) known.subfolders[b] = [...new Set([...(known.subfolders[b] ?? []), ...subs])]
      } else {
        byFolder.set(normalize(family.name), { folder: family.name, category: categoryNameOf(family.name), brands, subfolders })
      }
    }
  }
  // Catégories principales sans dossier dans le Drive (ex. « Photovoltaïque (PV) »)
  for (const c of categories.filter((c) => !c.parentId)) {
    const hasFolder = [...byFolder.values()].some((f) => f.category === c.name)
    if (!hasFolder) {
      byFolder.set(normalize(c.name), { folder: c.name, category: c.name, brands: categories.filter((s) => s.parentId === c.id).map((s) => s.name), subfolders: {} })
    }
  }
  return [...byFolder.values()]
}

/** Catégorie (et sous-catégorie de marque) correspondant au dossier de famille, créées si besoin. */
async function ensureCategory(familyFolder: string, brand: string): Promise<{ categoryId: string; createdFamily: boolean }> {
  const mapping = await db.driveCategoryMapping.findUnique({ where: { folderName: normalize(familyFolder) } })
  const parents = await db.category.findMany({ where: { parentId: null }, select: { id: true, name: true } })
  let parentId = mapping?.categoryId ?? parents.find((c) => normalize(c.name) === normalize(familyFolder))?.id
  let createdFamily = false
  if (!parentId) {
    parentId = (await db.category.create({ data: { name: familyFolder }, select: { id: true } })).id
    createdFamily = true
  }
  if (!brand) return { categoryId: parentId, createdFamily }
  const subs = await db.category.findMany({ where: { parentId }, select: { id: true, name: true } })
  const sub = subs.find((c) => normalize(c.name) === normalize(brand))
    ?? await db.category.create({ data: { name: brand, parentId }, select: { id: true, name: true } })
  return { categoryId: sub.id, createdFamily }
}

/** Classe (« À trier ») et/ou contrôle (Public) un document lu. Renvoie false s'il n'y a plus rien à faire. */
async function classifyNext(rootId: string, result: QueueResult): Promise<boolean> {
  const doc = await db.document.findFirst({
    where: toClassifyWhere,
    orderBy: { updatedAt: 'asc' },
    select: { id: true, title: true, content: true, type: true, fileName: true, drivePath: true, driveFileId: true, reviewState: true },
  })
  if (!doc) return false

  const visibility = doc.type === 'PUBLIC' ? 'PUBLIC' : 'INTERNAL'
  try {
    const knownFamilies = await loadFamilies(rootId)
    const c = await classifyDocument({
      fileName: doc.fileName ?? doc.title,
      visibility,
      families: knownFamilies,
      content: doc.content,
    })
    const reviewNote = c.confidential ? c.reasons.join(' ; ') || 'Contenu jugé confidentiel' : null

    // Le modèle peut répondre avec le nom de la catégorie (« Pompe à Chaleur (PAC) ») au lieu du
    // dossier (« PAC ») : on retombe toujours sur le dossier existant correspondant
    const matches = knownFamilies.filter((f) => normalize(f.folder) === normalize(c.family) || normalize(f.category) === normalize(c.family))
    // Plusieurs dossiers pour la même catégorie : on préfère celui qui lui est associé (ex. « PAC »)
    const family = matches.find((f) => normalize(f.folder) !== normalize(f.category)) ?? matches[0]
    if (family) {
      c.family = family.folder
      c.brand = family.brands.find((b) => normalize(b) === normalize(c.brand)) ?? c.brand
      // Orthographe existante du sous-dossier (ex. « telecommandes » → « Télécommandes et thermostats »)
      const existingSubs = Object.entries(family.subfolders).find(([b]) => normalize(b) === normalize(c.brand))?.[1] ?? []
      c.subfolder = existingSubs.find((sf) => normalize(sf) === normalize(c.subfolder)) ?? c.subfolder
    }

    if (doc.reviewState === 'TO_SORT') {
      // Rangement : <visibilité>/<famille>/<marque>, fichier renommé avec un titre clair
      const visName = doc.drivePath?.split('/')[0] || (visibility === 'PUBLIC' ? 'Public' : 'Interne')
      const visId = await findOrCreateFolder(rootId, visName)
      const familyId = await findOrCreateFolder(visId, c.family)
      const brandId = c.brand ? await findOrCreateFolder(familyId, c.brand) : familyId
      // Sous-dossier (gamme, modèle, accessoires…) sous la marque, créé s'il n'existe pas encore
      const targetId = c.brand && c.subfolder ? await findOrCreateFolder(brandId, c.subfolder) : brandId
      const driveFile = await getFile(doc.driveFileId!)
      const ext = isGoogleNative(driveFile.mimeType) ? '' : fileExtension(driveFile.name)
      const newName = ext ? `${c.title}.${ext}` : c.title
      await moveFile(doc.driveFileId!, targetId, newName)

      const { categoryId, createdFamily } = await ensureCategory(c.family, c.brand)
      if (createdFamily) await logDriveEvent('FAMILY_CREATED', c.family, `Nouvelle famille créée pour « ${c.title} »`)

      const newPath = [visName, c.family, c.brand, c.brand ? c.subfolder : ''].filter(Boolean).join('/')
      await db.document.update({
        where: { id: doc.id },
        data: {
          title: c.title, categoryId, drivePath: newPath, ...(ext ? { fileName: newName } : {}),
          reviewState: c.confidential ? 'CONFIDENTIAL' : null, reviewNote, classifiedAt: new Date(),
        },
      })
      // Le titre fait partie de l'indexation de chaque passage
      if (c.title !== doc.title) await rechunkFromContent(doc.id, doc.content)
      await logDriveEvent('SORTED', c.title, `${doc.drivePath ?? ''}/${driveFile.name} → ${newPath}/${newName}`, doc.id)
      result.processed.push(`${c.title} (rangé dans ${newPath})`)
    } else {
      await db.document.update({
        where: { id: doc.id },
        data: { classifiedAt: new Date(), ...(c.confidential ? { reviewState: 'CONFIDENTIAL', reviewNote } : {}) },
      })
    }
    if (c.confidential) await logDriveEvent('CONFIDENTIAL', c.title, reviewNote ?? undefined, doc.id)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    // Retenté à la prochaine synchronisation ; le document reste hors des chats en attendant
    await db.document.update({ where: { id: doc.id }, data: { classifiedAt: new Date(), reviewNote: `Erreur de classement : ${message}`.slice(0, 500) } })
    await logDriveEvent('ERROR', doc.title, message, doc.id)
    result.errors.push({ title: doc.title, message })
  }
  return true
}

/** Étape 2 : télécharge et indexe les documents Drive en attente, puis les classe / contrôle (relancer tant que remaining > 0). */
export async function processDriveQueue(budgetMs = 240_000): Promise<QueueResult> {
  const started = Date.now()
  const result: QueueResult = { remaining: 0, processed: [], errors: [] }
  const pendingWhere: Prisma.DocumentWhereInput = { driveFileId: { not: null }, status: { in: ['PENDING', 'PROCESSING'] } }
  const source = await db.driveSource.findFirst({ select: { folderId: true } })

  while (Date.now() - started < budgetMs - 20_000) {
    const doc = await db.document.findFirst({
      where: pendingWhere,
      orderBy: { updatedAt: 'asc' },
      select: { id: true, title: true, driveFileId: true, driveMd5: true },
    })
    if (!doc) {
      // Plus rien à lire : classement / contrôle de confidentialité des documents lus
      if (source && await classifyNext(source.folderId, result)) continue
      break
    }

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

  const [pending, toClassify] = await Promise.all([
    db.document.count({ where: pendingWhere }),
    db.document.count({ where: toClassifyWhere }),
  ])
  result.remaining = pending + toClassify
  return result
}
