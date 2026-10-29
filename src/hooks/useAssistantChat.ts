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
  /** Identifiant de l'échange enregistré (pour noter la réponse) */
  historyId?: string
  /** Avis du client : 1 = 👍, -1 = 👎 */
  rating?: 1 | -1 | null
  /** Envoyé par Kingso à la place du client (message laissé au SAV) : sert de contexte, pas affiché */
  hidden?: boolean
  createdAt: string
}

interface ServerEntry {
  historyId: string
  user: string
  userForHistory: string
  assistant: string
  photos: string[]
  rating: 1 | -1 | null
  hidden: boolean
  createdAt: string
}

/** Conversation du chat personnel enregistrée (null si elle n'a pas pu être lue). */
async function loadCaseConversation(caseToken: string): Promise<AssistantMessage[] | null> {
  try {
    const res = await fetch(`/api/s/${encodeURIComponent(caseToken)}/conversation`, { cache: 'no-store' })
    if (!res.ok) return null
    const { entries } = (await res.json()) as { entries: ServerEntry[] }
    return entries.flatMap((e): AssistantMessage[] => [
      {
        id: `${e.historyId}-user`, role: 'USER', content: e.user, historyContent: e.userForHistory,
        thumbnails: e.photos, hidden: e.hidden, createdAt: e.createdAt,
      },
      { id: `${e.historyId}-assistant`, role: 'ASSISTANT', content: e.assistant, historyId: e.historyId, rating: e.rating, createdAt: e.createdAt },
    ])
  } catch {
    return null
  }
}

interface StoredState {
  sessionToken: string
  messages: AssistantMessage[]
  escalationOffered: boolean
  escalationSent: boolean
  savedAt: number
}

// Conversation gardée dans le navigateur (localStorage) : le client la retrouve en rouvrant
// le lien plus tard (après avoir essayé une manipulation), ou si le téléphone recharge la
// page en ouvrant l'appareil photo. Effacée au bout de 7 jours d'inactivité.
const MAX_AGE_MS = 7 * 24 * 3600 * 1000

function storageKey(key: string) {
  return `kingso_chat_${key}`
}

function loadState(slug: string): StoredState | null {
  try {
    const raw = localStorage.getItem(storageKey(slug))
    if (!raw) return null
    const state = JSON.parse(raw) as StoredState
    if (!state.savedAt || Date.now() - state.savedAt > MAX_AGE_MS) {
      localStorage.removeItem(storageKey(slug))
      return null
    }
    return state
  } catch {
    return null
  }
}

function saveState(slug: string, state: Omit<StoredState, 'savedAt'>) {
  const full: StoredState = { ...state, savedAt: Date.now() }
  try {
    localStorage.setItem(storageKey(slug), JSON.stringify(full))
  } catch {
    // Quota dépassé (miniatures) : on garde au moins le texte
    try {
      localStorage.setItem(storageKey(slug), JSON.stringify({
        ...full,
        messages: full.messages.map(({ thumbnails: _t, ...m }) => m),
      }))
    } catch { /* stockage indisponible */ }
  }
}

function newSessionToken() {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/** `caseToken` : chat personnel d'un dossier SAV (conversation séparée, rattachée au dossier). */
export function useAssistantChat(slug: string, caseToken?: string) {
  // Clé de sauvegarde locale : une conversation par chat, et une par dossier SAV
  const storeKey = caseToken ? `${slug}_dossier_${caseToken.slice(0, 12)}` : slug
  const [messages, setMessages] = useState<AssistantMessage[]>([])
  const [isTyping, setIsTyping] = useState(false)
  const [mascotState, setMascotState] = useState<MascotState>('wave')
  const [escalationOffered, setEscalationOffered] = useState(false)
  const [escalationSent, setEscalationSent] = useState(false)
  const [limitReached, setLimitReached] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  /** Dernier envoi échoué (réseau ou serveur), pour le bouton « Réessayer » — non sauvegardé */
  const [failed, setFailed] = useState<{ userMessageId: string; text: string; images: PreparedImage[] } | null>(null)
  const sessionToken = useRef('')
  const messagesRef = useRef<AssistantMessage[]>([])
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  // Restauration après rechargement : sessionStorage n'existe que côté navigateur,
  // la lecture doit donc se faire après le rendu serveur.
  useEffect(() => {
    let cancelled = false
    const stored = loadState(storeKey)
    sessionToken.current = stored?.sessionToken ?? newSessionToken()
    const restore = (list: AssistantMessage[]) => {
      setMessages(list)
      if (list.length > 0) setMascotState('idle')
    }
    if (stored) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restauration après rechargement (navigateur seulement)
      setEscalationOffered(stored.escalationOffered)
      setEscalationSent(stored.escalationSent)
    }
    if (!caseToken) {
      if (stored) restore(stored.messages)
      setHydrated(true)
      return
    }
    // Chat personnel : la conversation enregistrée fait foi (la même sur tous les appareils du client) ;
    // la copie du navigateur ne sert que si elle ne peut pas être lue
    loadCaseConversation(caseToken).then((server) => {
      if (cancelled) return
      restore(server ?? stored?.messages ?? [])
      setHydrated(true)
    })
    return () => { cancelled = true }
  }, [storeKey, caseToken])

  useEffect(() => {
    messagesRef.current = messages
    if (!hydrated) return
    saveState(storeKey, { sessionToken: sessionToken.current, messages, escalationOffered, escalationSent })
  }, [storeKey, messages, escalationOffered, escalationSent, hydrated])

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

  const sendMessage = useCallback(async (content: string, images: PreparedImage[] = [], options: { hidden?: boolean } = {}) => {
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
      hidden: options.hidden,
      createdAt: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, userMessage])
    setFailed(null)
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
          ...(caseToken ? { caseToken } : {}),
          ...(options.hidden ? { initial: true } : {}),
        }),
      })
      const data = await response.json().catch(() => ({}))

      // Conversation déjà commencée sur un autre appareil : on la reprend au lieu de reposer la question
      if (data.alreadyStarted && caseToken) {
        const server = await loadCaseConversation(caseToken)
        setMessages(server ?? messagesRef.current.filter((m) => m.id !== userMessage.id))
        setMascotState('idle')
        return
      }

      if (!response.ok) {
        if (data.limitReached) setLimitReached(true)
        // Erreur serveur passagère : on propose de renvoyer le même message
        if (response.status >= 500) setFailed({ userMessageId: userMessage.id, text, images })
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
          historyId: data.historyId,
          createdAt: new Date().toISOString(),
        },
      ])
      if (data.offerEscalation) setEscalationOffered(true)

      if (!data.documentsUsed?.length) {
        setMascotState('confused')
        later(() => setMascotState('idle'), 3000)
      } else {
        // Kingso reste sur la vidéo où il parle, puis revient au repos
        setMascotState('talking')
        later(() => setMascotState('idle'), 9000)
      }
    } catch {
      setMessages((prev) => [...prev, {
        id: `msg-${Date.now()}-error`,
        role: 'ASSISTANT',
        content: "Le message n'a pas pu être envoyé (connexion interrompue).",
        isError: true,
        createdAt: new Date().toISOString(),
      }])
      setFailed({ userMessageId: userMessage.id, text, images })
      setMascotState('idle')
    } finally {
      setIsTyping(false)
    }
  }, [slug, caseToken])

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
      // Pas d'air content ici (le client a un problème) : Kingso parle pour confirmer l'envoi
      setMascotState('talking')
      later(() => setMascotState('idle'), 4000)
      return { ok: true }
    } catch {
      return { ok: false, error: 'Connexion impossible. Vérifiez votre réseau et réessayez.' }
    }
  }, [slug])

  /** Note une réponse (un 2e appui sur le même avis le retire). */
  const rateMessage = useCallback(async (messageId: string, value: 1 | -1) => {
    const message = messagesRef.current.find((m) => m.id === messageId)
    if (!message?.historyId) return
    const next = message.rating === value ? null : value
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, rating: next } : m)))
    try {
      await fetch(`/api/c/${encodeURIComponent(slug)}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ historyId: message.historyId, sessionToken: sessionToken.current, rating: next ?? 0 }),
      })
    } catch { /* un avis perdu n'empêche pas de continuer la conversation */ }
  }, [slug])

  /** Renvoie le dernier message qui n'a pas abouti (sans le dupliquer dans la conversation). */
  const retryFailed = useCallback(() => {
    if (!failed) return
    const { userMessageId, text, images } = failed
    // On retire le message échoué et l'erreur ; la référence est mise à jour tout de suite
    // pour que l'historique envoyé ne contienne pas le message en double
    const kept = messagesRef.current.filter((m) => m.id !== userMessageId && !m.isError)
    messagesRef.current = kept
    setMessages(kept)
    sendMessage(text, images)
  }, [failed, sendMessage])

  const resetConversation = useCallback(() => {
    setFailed(null)
    sessionToken.current = newSessionToken()
    setMessages([])
    setEscalationOffered(false)
    setEscalationSent(false)
    setLimitReached(false)
    setMascotState('wave')
  }, [])

  return {
    messages, isTyping, mascotState, hydrated,
    escalationOffered, escalationSent, limitReached, canRetry: failed !== null,
    sendMessage, retryFailed, rateMessage, submitEscalation, handleInteraction, resetConversation,
  }
}
