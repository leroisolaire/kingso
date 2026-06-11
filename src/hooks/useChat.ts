'use client'

import { useState, useCallback, useEffect } from 'react'
import type { ChatMessage, MascotState } from '@/types/chat'

/* Mots-clés de test (tapés dans le chat) → état forcé instantanément */
const TEST_KEYWORDS: Record<string, MascotState> = {
  'test idle':      'idle',
  'test réflexion': 'thinking',
  'test parle':     'talking',
  'test content':   'happy',
  'test ennui':     'bored',
  'test confus':    'confused',
  'test bonjour':   'wave',
}

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isTyping, setIsTyping] = useState(false)
  const [mascotState, setMascotState] = useState<MascotState>('wave')

  // Bored après 30s d'inactivité en idle
  useEffect(() => {
    if (mascotState !== 'idle') return
    const t = setTimeout(() => setMascotState('bored'), 30000)
    return () => clearTimeout(t)
  }, [mascotState])

  const handleInteraction = useCallback(() => {
    setMascotState((prev) => ['wave', 'bored', 'confused'].includes(prev) ? 'idle' : prev)
  }, [])

  const sendMessage = useCallback(async (content: string) => {
    // Mode test : mot-clé → force l'état sans appel API
    const testState = TEST_KEYWORDS[content.toLowerCase().trim()]
    if (testState) {
      setMascotState(testState)
      return
    }

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

      const noAnswer = data.documentsUsed?.length === 0
      if (noAnswer) {
        // Kingso cherche ses mots — confused longtemps puis retour idle
        setMascotState('confused')
        setTimeout(() => setMascotState('idle'), 3000)
      } else {
        // Kingso parle (talking), puis célèbre (happy), puis se repose
        setMascotState('talking')
        setTimeout(() => setMascotState('happy'), 3000)
        setTimeout(() => setMascotState('idle'), 9000)
      }
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

  return { messages, isTyping, mascotState, sendMessage, handleInteraction }
}
