'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import type { MascotState } from '@/types/chat'
import type { PreparedImage } from '@/lib/images/compress'

export interface AssistantMessage {
  id: string
  role: 'USER' | 'ASSISTANT'
  content: string
  /** Texte renvoyé à l'API comme historique (inclut ce que Kingso a lu sur les photos) */
  historyContent?: string
  thumbnails?: string[]
  documentsUsed?: string[]
  offerEscalation?: boolean
  isError?: boolean
  createdAt: string
}

interface StoredState {
  sessionToken: string
  messages: AssistantMessage[]
  escalationOffered: boolean
  escalationSent: boolean
}

// Sauvegarde dans sessionStorage : sur mobile, ouvrir l'appareil photo peut recharger
// la page — le client ne doit pas perdre sa conversation.
function storageKey(slug: string) {
  return `kingso_chat_${slug}`
}

function loadState(slug: string): StoredState | null {
  try {
    const raw = sessionStorage.getItem(storageKey(slug))
    return raw ? (JSON.parse(raw) as StoredState) : null
  } catch {
    return null
  }
}

function saveState(slug: string, state: StoredState) {
  try {
    sessionStorage.setItem(storageKey(slug), JSON.stringify(state))
  } catch {
    // Quota dépassé (miniatures) : on garde au moins le texte
    try {
      sessionStorage.setItem(storageKey(slug), JSON.stringify({
        ...state,
        messages: state.messages.map(({ thumbnails: _t, ...m }) => m),
      }))
    } catch { /* stockage indisponible */ }
  }
}

function newSessionToken() {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function useAssistantChat(slug: string) {
  const [messages, setMessages] = useState<AssistantMessage[]>([])
  const [isTyping, setIsTyping] = useState(false)
  const [mascotState, setMascotState] = useState<MascotState>('wave')
  const [escalationOffered, setEscalationOffered] = useState(false)
  const [escalationSent, setEscalationSent] = useState(false)
  const [limitReached, setLimitReached] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const sessionToken = useRef('')
  const messagesRef = useRef<AssistantMessage[]>([])
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  // Restauration après rechargement : sessionStorage n'existe que côté navigateur,
  // la lecture doit donc se faire après le rendu serveur.
  useEffect(() => {
    const stored = loadState(slug)
    sessionToken.current = stored?.sessionToken ?? newSessionToken()
    if (stored) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMessages(stored.messages)
      setEscalationOffered(stored.escalationOffered)
      setEscalationSent(stored.escalationSent)
      if (stored.messages.length > 0) setMascotState('idle')
    }
    setHydrated(true)
  }, [slug])

  useEffect(() => {
    messagesRef.current = messages
    if (!hydrated) return
    saveState(slug, { sessionToken: sessionToken.current, messages, escalationOffered, escalationSent })
  }, [slug, messages, escalationOffered, escalationSent, hydrated])

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  useEffect(() => {
    if (mascotState !== 'idle') return
    const t = setTimeout(() => setMascotState('bored'), 30000)
    return () => clearTimeout(t)
  }, [mascotState])

  const handleInteraction = useCallback(() => {
    setMascotState((prev) => (['wave', 'bored', 'confused'].includes(prev) ? 'idle' : prev))
  }, [])

  const later = (fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms))
  }

  const sendMessage = useCallback(async (content: string, images: PreparedImage[] = []) => {
    const text = content.trim()
    if (!text && images.length === 0) return

    // Historique calculé à partir de la référence à jour (pas d'état figé dans la closure)
    const history = messagesRef.current
      .filter((m) => !m.isError && (m.historyContent ?? m.content))
      .map((m) => ({ role: m.role === 'USER' ? 'user' : 'assistant', content: m.historyContent ?? m.content }))

    const userMessage: AssistantMessage = {
      id: `msg-${Date.now()}-user`,
      role: 'USER',
      content: text,
      thumbnails: images.map((i) => i.thumbnail),
      createdAt: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, userMessage])
    setIsTyping(true)
    setMascotState('thinking')
    timers.current.forEach(clearTimeout)
    timers.current = []

    try {
      const response = await fetch(`/api/c/${encodeURIComponent(slug)}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          sessionToken: sessionToken.current,
          history,
          images: images.map(({ mediaType, data }) => ({ mediaType, data })),
        }),
      })
      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        if (data.limitReached) setLimitReached(true)
        setMessages((prev) => [...prev, {
          id: `msg-${Date.now()}-error`,
          role: 'ASSISTANT',
          content: data.error ?? 'Une erreur est survenue. Veuillez réessayer.',
          isError: true,
          createdAt: new Date().toISOString(),
        }])
        setMascotState('confused')
        later(() => setMascotState('idle'), 3000)
        return
      }

      setMessages((prev) => [
        ...prev.map((m) => (m.id === userMessage.id ? { ...m, historyContent: data.historyUserMessage } : m)),
        {
          id: `msg-${Date.now()}-assistant`,
          role: 'ASSISTANT',
          content: data.content,
          documentsUsed: data.documentsUsed ?? [],
          offerEscalation: Boolean(data.offerEscalation),
          createdAt: new Date().toISOString(),
        },
      ])
      if (data.offerEscalation) setEscalationOffered(true)

      if (!data.documentsUsed?.length) {
        setMascotState('confused')
        later(() => setMascotState('idle'), 3000)
      } else {
        setMascotState('talking')
        later(() => setMascotState('happy'), 3000)
        later(() => setMascotState('idle'), 9000)
      }
    } catch {
      setMessages((prev) => [...prev, {
        id: `msg-${Date.now()}-error`,
        role: 'ASSISTANT',
        content: 'Connexion impossible. Vérifiez votre réseau et réessayez.',
        isError: true,
        createdAt: new Date().toISOString(),
      }])
      setMascotState('idle')
    } finally {
      setIsTyping(false)
    }
  }, [slug])

  const submitEscalation = useCallback(async (form: {
    firstName: string; lastName: string; phone: string; postalCode: string; email: string
  }): Promise<{ ok: true } | { ok: false; error: string; fields?: Record<string, string> }> => {
    try {
      const response = await fetch(`/api/c/${encodeURIComponent(slug)}/escalate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, sessionToken: sessionToken.current }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) return { ok: false, error: data.error ?? 'Une erreur est survenue.', fields: data.fields }
      setEscalationSent(true)
      setMascotState('happy')
      later(() => setMascotState('idle'), 4000)
      return { ok: true }
    } catch {
      return { ok: false, error: 'Connexion impossible. Vérifiez votre réseau et réessayez.' }
    }
  }, [slug])

  const resetConversation = useCallback(() => {
    sessionToken.current = newSessionToken()
    setMessages([])
    setEscalationOffered(false)
    setEscalationSent(false)
    setLimitReached(false)
    setMascotState('wave')
  }, [])

  return {
    messages, isTyping, mascotState, hydrated,
    escalationOffered, escalationSent, limitReached,
    sendMessage, submitEscalation, handleInteraction, resetConversation,
  }
}
