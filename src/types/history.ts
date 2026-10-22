export interface HistoryEntry {
  id: string
  sessionToken: string
  userMessage: string
  assistantMessage: string
  documentsUsed: string[]
  assistantId?: string | null
  attachments?: string[]
  ipHash?: string | null
  rating?: number | null
  unanswered?: boolean
  reviewedAt?: string | null
  createdAt: string
}
