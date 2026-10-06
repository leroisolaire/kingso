import { db } from '../client'
import type { HistoryEntry } from '@/types/history'
import type { Document } from '@/types/document'

function serialize(h: { createdAt: Date; [key: string]: unknown }): HistoryEntry {
  return { ...h, createdAt: h.createdAt.toISOString() } as HistoryEntry
}

export interface UsedSource {
  id: string
  title: string
  kind: 'document' | 'webpage'
  type?: Document['type']
  url?: string | null
  deleted?: boolean
}

export async function getUsedSources(ids: string[]): Promise<UsedSource[]> {
  if (ids.length === 0) return []

  const [docs, pages] = await Promise.all([
    db.document.findMany({ where: { id: { in: ids } }, select: { id: true, title: true, type: true } }),
    db.webPage.findMany({ where: { id: { in: ids } }, select: { id: true, title: true, url: true } }),
  ])

  const byId = new Map<string, UsedSource>()
  for (const d of docs) byId.set(d.id, { id: d.id, title: d.title, kind: 'document', type: d.type })
  for (const p of pages) byId.set(p.id, { id: p.id, title: p.title, kind: 'webpage', url: p.url })

  return ids.map((id) => byId.get(id) ?? { id, title: 'Source supprimée', kind: 'document', deleted: true })
}

export async function getAllHistory(): Promise<HistoryEntry[]> {
  const entries = await db.history.findMany({ orderBy: { createdAt: 'desc' } })
  return entries.map(serialize)
}

export async function getHistoryById(id: string): Promise<HistoryEntry | null> {
  const entry = await db.history.findUnique({ where: { id } })
  return entry ? serialize(entry) : null
}

export async function saveMessage(
  data: Omit<HistoryEntry, 'id' | 'createdAt'>
): Promise<HistoryEntry> {
  const entry = await db.history.create({ data })
  return serialize(entry)
}
