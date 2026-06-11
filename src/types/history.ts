export interface HistoryEntry {
  id: string
  sessionToken: string
  userMessage: string
  assistantMessage: string
  documentsUsed: string[]
  createdAt: string
}
