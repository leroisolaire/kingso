import { db } from '../client'
import type { HistoryEntry } from '@/types/history'

function serialize(h: { createdAt: Date; [key: string]: unknown }): HistoryEntry {
  return { ...h, createdAt: h.createdAt.toISOString() } as HistoryEntry
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
