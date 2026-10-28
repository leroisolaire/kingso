'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

// Dictée vocale du navigateur (Chrome, Edge, Safari). Absente de Firefox : le bouton est alors masqué.
interface RecognitionResult { isFinal: boolean; 0: { transcript: string } }
interface RecognitionEvent { resultIndex: number; results: ArrayLike<RecognitionResult> }
interface Recognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((e: RecognitionEvent) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
}
type RecognitionCtor = new () => Recognition

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

const noop = () => () => {}

const ERRORS: Record<string, string> = {
  'not-allowed': 'Micro refusé : autorisez-le dans le navigateur (icône à gauche de l\'adresse).',
  'service-not-allowed': 'Micro refusé : autorisez-le dans le navigateur (icône à gauche de l\'adresse).',
  'audio-capture': 'Aucun micro détecté.',
  network: 'Dictée indisponible (connexion).',
}

function join(base: string, added: string): string {
  const a = added.trim()
  if (!a) return base
  return base && !/\s$/.test(base) ? `${base} ${a}` : base + a
}

/** Bouton micro : ajoute à la suite du texte ce qui est dicté (en direct). */
export default function DictationButton({ value, onChange, disabled }: {
  value: string
  onChange: (text: string) => void
  disabled?: boolean
}) {
  const supported = useSyncExternalStore(noop, () => recognitionCtor() !== null, () => false)
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recRef = useRef<Recognition | null>(null)

  useEffect(() => () => recRef.current?.stop(), [])

  if (!supported) return null

  function start() {
    const Ctor = recognitionCtor()
    if (!Ctor) return
    const rec = new Ctor()
    rec.lang = 'fr-FR'
    rec.continuous = true
    rec.interimResults = true
    let base = value
    rec.onresult = (e) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) base = join(base, r[0].transcript)
        else interim += r[0].transcript
      }
      onChange(join(base, interim))
    }
    rec.onerror = (e) => {
      if (e.error !== 'no-speech' && e.error !== 'aborted') setError(ERRORS[e.error] ?? 'La dictée s\'est arrêtée.')
    }
    rec.onend = () => {
      setListening(false)
      recRef.current = null
    }
    setError(null)
    recRef.current = rec
    rec.start()
    setListening(true)
  }

  function stop() {
    recRef.current?.stop()
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={listening ? stop : start}
        disabled={disabled}
        aria-pressed={listening}
        className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium ring-1 transition disabled:opacity-50 ${
          listening ? 'bg-red-50 text-red-700 ring-red-300' : 'bg-white text-gray-700 ring-gray-300 hover:bg-gray-50'
        }`}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className={`h-4 w-4 ${listening ? 'animate-pulse' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="2" width="6" height="12" rx="3" />
          <path d="M5 10a7 7 0 0 0 14 0M12 17v5" />
        </svg>
        {listening ? 'Arrêter la dictée' : 'Dicter'}
      </button>
      {listening && <span className="text-xs text-red-700">Parlez, le texte s&apos;écrit au fur et à mesure…</span>}
      {error && <span className="text-xs text-red-700">{error}</span>}
    </div>
  )
}
