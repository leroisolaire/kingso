export type MessageRole = 'USER' | 'ASSISTANT'
export type MascotState = 'idle' | 'thinking' | 'happy' | 'wave'

export interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  createdAt: string
  documentsUsed?: string[]
}

export interface ChatSession {
  id: string
  messages: ChatMessage[]
  createdAt: string
}
