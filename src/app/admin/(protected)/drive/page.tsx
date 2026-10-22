import type { Metadata } from 'next'
import DriveSyncClient from './DriveSyncClient'
import { db } from '@/lib/db/client'
import { getServiceAccount } from '@/lib/drive/google'
import type { SyncReport } from '@/lib/drive/sync'

export const metadata: Metadata = { title: 'Google Drive | Admin' }

export default async function DrivePage() {
  const [source, mappings, categories, driveDocs, pending, errors] = await Promise.all([
    db.driveSource.findFirst(),
    db.driveCategoryMapping.findMany({ include: { category: { select: { name: true } } } }),
    db.category.findMany({ where: { parentId: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    db.document.count({ where: { driveFileId: { not: null } } }),
    db.document.count({ where: { driveFileId: { not: null }, status: { in: ['PENDING', 'PROCESSING'] } } }),
    db.document.count({ where: { driveFileId: { not: null }, status: 'ERROR' } }),
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
    />
  )
}
