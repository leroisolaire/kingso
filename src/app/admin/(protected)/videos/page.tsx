import type { Metadata } from 'next'
import VideosClient from './VideosClient'
import { db } from '@/lib/db/client'
import { isGeminiConfigured } from '@/lib/videos/gemini'

export const metadata: Metadata = { title: 'Vidéos | Admin' }

export default async function VideosPage() {
  const [sources, toReview, recent, skipped, selectedCount, hasDrive] = await Promise.all([
    db.videoSource.findMany({
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { videos: true } } },
    }),
    db.videoItem.findMany({
      where: { status: 'TO_REVIEW' },
      orderBy: [{ sourceId: 'asc' }, { publishedAt: 'desc' }],
      include: { source: { select: { name: true } } },
    }),
    db.videoItem.findMany({
      where: { status: { in: ['DONE', 'ERROR'] } },
      orderBy: { updatedAt: 'desc' },
      take: 40,
      include: { source: { select: { name: true } } },
    }),
    db.videoItem.findMany({
      where: { status: 'SKIPPED' },
      orderBy: { publishedAt: 'desc' },
      take: 300,
      include: { source: { select: { name: true } } },
    }),
    db.videoItem.count({ where: { status: 'SELECTED' } }),
    db.driveSource.count(),
  ])

  const toItem = (v: (typeof toReview)[number]) => ({
    id: v.id,
    videoId: v.videoId,
    title: v.title,
    source: v.source.name,
    durationSec: v.durationSec,
    publishedAt: v.publishedAt?.toISOString() ?? null,
    topic: v.topic,
    reason: v.reason,
    status: v.status,
    note: v.note,
  })

  return (
    <VideosClient
      apiKeyConfigured={Boolean(process.env.GOOGLE_API_KEY)}
      geminiConfigured={isGeminiConfigured()}
      driveConnected={hasDrive > 0}
      sources={sources.map((s) => ({
        id: s.id, name: s.name, url: s.url, visibility: s.visibility === 'INTERNAL' ? 'INTERNAL' : 'PUBLIC',
        active: s.active, lastCheckedAt: s.lastCheckedAt?.toISOString() ?? null, videoCount: s._count.videos,
      }))}
      toReview={toReview.map(toItem)}
      recent={recent.map(toItem)}
      skipped={skipped.map(toItem)}
      selectedCount={selectedCount}
    />
  )
}
