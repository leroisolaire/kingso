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

export interface ConversationSummary {
  sessionToken: string
  firstMessage: string
  messageCount: number
  lastCreatedAt: string
}

export async function getConversations(): Promise<ConversationSummary[]> {
  const entries = await db.history.findMany({ orderBy: { createdAt: 'asc' } })

  const bySession = new Map<string, typeof entries>()
  for (const entry of entries) {
    const list = bySession.get(entry.sessionToken) ?? []
    list.push(entry)
    bySession.set(entry.sessionToken, list)
  }

  return Array.from(bySession.entries())
    .map(([sessionToken, list]) => ({
      sessionToken,
      firstMessage: list[0].userMessage,
      messageCount: list.length,
      lastCreatedAt: list[list.length - 1].createdAt.toISOString(),
    }))
    .sort((a, b) => b.lastCreatedAt.localeCompare(a.lastCreatedAt))
}

export async function getHistoryBySession(sessionToken: string): Promise<HistoryEntry[]> {
  const entries = await db.history.findMany({ where: { sessionToken }, orderBy: { createdAt: 'asc' } })
  return entries.map(serialize)
}

export async function saveMessage(
  data: Omit<HistoryEntry, 'id' | 'createdAt'>
): Promise<HistoryEntry> {
  const entry = await db.history.create({ data })
  return serialize(entry)
}
