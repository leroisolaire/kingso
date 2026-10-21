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
  /** Titre généré par Claude (null tant qu'il n'est pas encore calculé) */
  summary: string | null
  /** À jour par rapport au nombre d'échanges ? */
  summaryUpToDate: boolean
  /** Premier message parlant (les boutons « Hitachi », « Atlantic »… sont ignorés) */
  firstMessage: string
  messageCount: number
  lastCreatedAt: string
  assistantName: string | null
  photoCount: number
  hasEscalation: boolean
}

export async function getConversations(assistantId?: string): Promise<ConversationSummary[]> {
  const [entries, escalations, summaries] = await Promise.all([
    db.history.findMany({
      where: assistantId ? { assistantId } : undefined,
      orderBy: { createdAt: 'asc' },
      include: { assistant: { select: { name: true } } },
    }),
    db.escalation.findMany({ select: { sessionToken: true } }),
    db.conversationSummary.findMany({ select: { sessionToken: true, summary: true, messageCount: true } }),
  ])
  const escalated = new Set(escalations.map((e) => e.sessionToken))
  const summaryBySession = new Map(summaries.map((s) => [s.sessionToken, s]))

  const bySession = new Map<string, typeof entries>()
  for (const entry of entries) {
    const list = bySession.get(entry.sessionToken) ?? []
    list.push(entry)
    bySession.set(entry.sessionToken, list)
  }

  return Array.from(bySession.entries())
    .map(([sessionToken, list]) => ({
      sessionToken,
      summary: summaryBySession.get(sessionToken)?.summary ?? null,
      summaryUpToDate: summaryBySession.get(sessionToken)?.messageCount === list.length,
      firstMessage: (list.find((e) => e.userMessage.trim().length > 30) ?? list[0]).userMessage,
      messageCount: list.length,
      lastCreatedAt: list[list.length - 1].createdAt.toISOString(),
      assistantName: list[0].assistant?.name ?? null,
      photoCount: list.reduce((n, e) => n + e.attachments.length, 0),
      hasEscalation: escalated.has(sessionToken),
    }))
    .sort((a, b) => b.lastCreatedAt.localeCompare(a.lastCreatedAt))
}

export async function getConversationMeta(sessionToken: string) {
  const [first, escalations, summary] = await Promise.all([
    db.history.findFirst({ where: { sessionToken }, select: { assistant: { select: { id: true, name: true } } } }),
    db.escalation.findMany({ where: { sessionToken }, orderBy: { createdAt: 'asc' } }),
    db.conversationSummary.findUnique({ where: { sessionToken }, select: { summary: true } }),
  ])
  return { assistant: first?.assistant ?? null, escalations, summary: summary?.summary ?? null }
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
