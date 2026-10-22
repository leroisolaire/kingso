import type { Metadata } from 'next'
import DriveSyncClient from './DriveSyncClient'
import { db } from '@/lib/db/client'
import { getServiceAccount } from '@/lib/drive/google'
import type { SyncReport } from '@/lib/drive/sync'

export const metadata: Metadata = { title: 'Google Drive | Admin' }

export default async function DrivePage() {
  const [source, mappings, categories, driveDocs, pending, errors, alerts, events] = await Promise.all([
    db.driveSource.findFirst(),
    db.driveCategoryMapping.findMany({ include: { category: { select: { name: true } } } }),
    db.category.findMany({ where: { parentId: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    db.document.count({ where: { driveFileId: { not: null } } }),
    db.document.count({ where: { driveFileId: { not: null }, status: { in: ['PENDING', 'PROCESSING'] } } }),
    db.document.count({ where: { driveFileId: { not: null }, status: 'ERROR' } }),
    // À valider : documents publics jugés confidentiels, ou classement en échec
    db.document.findMany({
      where: {
        driveFileId: { not: null },
        OR: [{ reviewState: 'CONFIDENTIAL' }, { reviewState: 'TO_SORT', reviewNote: { startsWith: 'Erreur' } }],
      },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, title: true, drivePath: true, reviewState: true, reviewNote: true, storagePath: true },
    }),
    db.driveEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 150 }),
  ])

  return (
    <DriveSyncClient
      serviceAccountEmail={getServiceAccount()?.client_email ?? null}
      source={source ? {
        name: source.name,
        folderId: source.folderId,
        lastSyncAt: source.lastSyncAt?.toISOString() ?? null,
        lastSyncReport: (source.lastSyncReport as unknown as SyncReport | null) ?? null,
      } : null}
      mappings={mappings.map((m) => ({ folderName: m.folderName, categoryName: m.category.name }))}
      categories={categories}
      counts={{ driveDocs, pending, errors }}
      alerts={alerts.map((a) => ({
        id: a.id, title: a.title, drivePath: a.drivePath, kind: a.reviewState === 'CONFIDENTIAL' ? 'confidential' as const : 'error' as const,
        note: a.reviewNote, hasFile: Boolean(a.storagePath),
      }))}
      events={events.map((e) => ({ id: e.id, kind: e.kind, title: e.title, detail: e.detail, createdAt: e.createdAt.toISOString() }))}
    />
  )
}
