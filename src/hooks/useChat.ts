'use client'

import { useState, useCallback } from 'react'
import type { ChatMessage, MascotState } from '@/types/chat'

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isTyping, setIsTyping] = useState(false)
  const [mascotState, setMascotState] = useState<MascotState>('idle')

  const sendMessage = useCallback(async (content: string) => {
    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}-user`,
      role: 'USER',
      content,
      createdAt: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, userMessage])
    setIsTyping(true)
    setMascotState('thinking')

    try {
      // TODO: Passer en streaming (ReadableStream) pour un affichage mot-à-mot.
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: content }),
      })
      const data = await response.json()

      const assistantMessage: ChatMessage = {
        id: `msg-${Date.now()}-assistant`,
        role: 'ASSISTANT',
        content: data.content,
        createdAt: new Date().toISOString(),
        documentsUsed: data.documentsUsed ?? [],
      }
      setMessages((prev) => [...prev, assistantMessage])
      setMascotState('happy')
      setTimeout(() => setMascotState('idle'), 2800)
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `msg-${Date.now()}-error`,
          role: 'ASSISTANT',
          content: 'Une erreur est survenue. Veuillez réessayer.',
          createdAt: new Date().toISOString(),
        },
      ])
      setMascotState('idle')
    } finally {
      setIsTyping(false)
    }
  }, [])

  return { messages, isTyping, mascotState, sendMessage }
}
