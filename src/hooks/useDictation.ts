'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'

// Dictée vocale gratuite via la reconnaissance vocale intégrée au navigateur
// (Safari iOS, Chrome Android / ordinateur). Absente ailleurs : le bouton est alors masqué.
// Nécessite une page en https (ou localhost) : le navigateur refuse le micro sinon.

interface RecognitionResult {
  readonly isFinal: boolean
  readonly 0: { readonly transcript: string }
}
interface RecognitionEvent {
  readonly results: ArrayLike<RecognitionResult>
}
interface Recognition {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((event: RecognitionEvent) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}
type RecognitionConstructor = new () => Recognition

function getRecognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

const subscribe = () => () => {}

const ERROR_MESSAGES: Record<string, string> = {
  'not-allowed': 'Le micro est bloqué. Autorisez-le dans les réglages de votre navigateur pour ce site.',
  'service-not-allowed': 'La dictée n\'est pas disponible sur ce navigateur.',
  'no-speech': 'Je n\'ai rien entendu. Appuyez sur le micro et parlez.',
  'audio-capture': 'Aucun micro détecté.',
  network: 'La dictée nécessite une connexion internet.',
}

/**
 * @param onText reçoit le texte reconnu (provisoire puis définitif) à chaque mise à jour
 */
export function useDictation(onText: (transcript: string) => void) {
  const supported = useSyncExternalStore(subscribe, () => getRecognitionConstructor() !== null, () => false)
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recognitionRef = useRef<Recognition | null>(null)
  const onTextRef = useRef(onText)

  useEffect(() => {
    onTextRef.current = onText
  }, [onText])

  // Arrêt du micro si le composant disparaît
  useEffect(() => () => recognitionRef.current?.abort(), [])

  const stop = useCallback(() => {
    recognitionRef.current?.stop()
  }, [])

  const start = useCallback(() => {
    const Ctor = getRecognitionConstructor()
    if (!Ctor || recognitionRef.current) return
    const recognition = new Ctor()
    recognition.lang = 'fr-FR'
    recognition.interimResults = true // le texte s'affiche pendant qu'on parle
    recognition.continuous = false // s'arrête tout seul après une pause

    recognition.onresult = (event) => {
      let transcript = ''
      for (let i = 0; i < event.results.length; i++) transcript += event.results[i][0].transcript
      onTextRef.current(transcript.trim())
    }
    recognition.onerror = (event) => {
      if (event.error !== 'aborted') setError(ERROR_MESSAGES[event.error] ?? 'La dictée a été interrompue.')
    }
    recognition.onend = () => {
      recognitionRef.current = null
      setListening(false)
    }

    setError(null)
    try {
      recognition.start()
      recognitionRef.current = recognition
      setListening(true)
    } catch {
      setError('Impossible de démarrer la dictée.')
    }
  }, [])

  return { supported, listening, error, start, stop }
}
