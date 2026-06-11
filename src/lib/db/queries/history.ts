// TODO: Remplacer chaque fonction par une requête Prisma
import { MOCK_HISTORY } from '../fixtures'
import type { HistoryEntry } from '@/types/history'

export async function getAllHistory(): Promise<HistoryEntry[]> {
  // TODO: return db.chatMessage.findMany({ orderBy: { createdAt: 'desc' } })
  return MOCK_HISTORY
}

export async function getHistoryById(id: string): Promise<HistoryEntry | null> {
  // TODO: return db.chatMessage.findUnique({ where: { id } })
  return MOCK_HISTORY.find((h) => h.id === id) ?? null
}

export async function saveMessage(
  data: Omit<HistoryEntry, 'id' | 'createdAt'>
): Promise<HistoryEntry> {
  // TODO: return db.chatMessage.create({ data })
  throw new Error('saveMessage: non implémenté (attente Prisma)')
}
