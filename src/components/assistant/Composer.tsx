'use client'

import { useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from 'react'
import { prepareImage, type PreparedImage } from '@/lib/images/compress'
import { useDictation } from '@/hooks/useDictation'

const MAX_IMAGES = 3

interface ComposerProps {
  onSend: (text: string, images: PreparedImage[]) => void
  disabled?: boolean
  attachmentsEnabled: boolean
  onFocus?: () => void
}

export default function Composer({ onSend, disabled = false, attachmentsEnabled, onFocus }: ComposerProps) {
  const [value, setValue] = useState('')
  const [images, setImages] = useState<PreparedImage[]>([])
  const [menuOpen, setMenuOpen] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  /** Texte déjà saisi au moment où la dictée démarre : la dictée s'ajoute à la suite */
  const dictationBaseRef = useRef('')

  const resizeTextarea = () => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`
  }

  const dictation = useDictation((transcript) => {
    const base = dictationBaseRef.current
    setValue(base && transcript ? `${base} ${transcript}` : base || transcript)
    requestAnimationFrame(resizeTextarea)
  })

  const toggleDictation = () => {
    if (dictation.listening) {
      dictation.stop()
      return
    }
    dictationBaseRef.current = value.trim()
    dictation.start()
  }

  const canSend = !disabled && !processing && (value.trim() !== '' || images.length > 0)

  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    if (!canSend) return
    if (dictation.listening) dictation.stop()
    onSend(value.trim(), images)
    setValue('')
    setImages([])
    setError(null)
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Sur mobile, « Entrée » ajoute une ligne : on n'envoie au clavier que sur ordinateur
    if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(pointer: fine)').matches) {
      e.preventDefault()
      submit()
    }
  }

  const handleInput = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = `${Math.min(e.target.scrollHeight, 128)}px`
  }

  const handleFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    setMenuOpen(false)
    if (files.length === 0) return

    const room = MAX_IMAGES - images.length
    if (room <= 0) {
      setError(`${MAX_IMAGES} photos maximum par message.`)
      return
    }
    setProcessing(true)
    setError(files.length > room ? `${MAX_IMAGES} photos maximum par message.` : null)
    try {
      const prepared = await Promise.all(files.slice(0, room).map(prepareImage))
      setImages((prev) => [...prev, ...prepared])
    } catch {
      setError('Impossible de lire cette photo. Essayez-en une autre.')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <form onSubmit={submit} className="relative">
      {/* Photos en attente d'envoi */}
      {(images.length > 0 || processing) && (
        <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
          {images.map((img, i) => (
            <div key={i} className="relative h-16 w-16 shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.thumbnail} alt={`Photo ${i + 1}`} className="h-16 w-16 rounded-xl object-cover ring-1 ring-black/10" />
              <button
                type="button"
                onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                aria-label="Retirer la photo"
                className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-gray-900 text-xs text-white shadow"
              >
                ✕
              </button>
            </div>
          ))}
          {processing && (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-gray-100">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-[#e73e11]" />
            </div>
          )}
        </div>
      )}

      {(error || dictation.error) && <p className="mb-2 text-xs text-red-500">{error ?? dictation.error}</p>}

      {/* Menu pièce jointe */}
      {menuOpen && (
        <>
          <button type="button" aria-label="Fermer" className="fixed inset-0 z-10 cursor-default" onClick={() => setMenuOpen(false)} />
          <div className="absolute bottom-full left-0 z-20 mb-2 w-60 overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-black/5">
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-[15px] text-gray-800 active:bg-gray-50 hover:bg-gray-50"
            >
              <CameraIcon /> Prendre une photo
            </button>
            <div className="h-px bg-gray-100" />
            <button
              type="button"
              onClick={() => galleryRef.current?.click()}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-[15px] text-gray-800 active:bg-gray-50 hover:bg-gray-50"
            >
              <ImageIcon /> Choisir une photo
            </button>
          </div>
        </>
      )}

      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFiles} />
      <input ref={galleryRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} />

      <div className="flex items-end gap-2 rounded-3xl border border-gray-200 bg-white py-1.5 pl-1.5 pr-1.5 shadow-sm focus-within:border-[#e73e11] focus-within:ring-4 focus-within:ring-[#e73e11]/10">
        {attachmentsEnabled && (
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            disabled={disabled}
            aria-label="Ajouter une photo"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 active:bg-gray-100 disabled:opacity-40"
          >
            <CameraIcon className="h-6 w-6" />
          </button>
        )}

        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onFocus={onFocus}
          placeholder={dictation.listening
            ? 'Je vous écoute, parlez maintenant…'
            : images.length > 0 ? 'Ajoutez un commentaire (facultatif)…' : 'Écrivez ou dictez votre question…'}
          disabled={disabled}
          rows={1}
          enterKeyHint="send"
          // 16px minimum : en dessous, iOS zoome sur le champ
          className={`max-h-32 min-h-11 flex-1 resize-none bg-transparent py-2.5 text-base leading-6 text-gray-900 outline-none placeholder:text-gray-400 ${attachmentsEnabled ? '' : 'pl-3'}`}
          style={{ caretColor: '#e73e11' }}
        />

        {dictation.supported && (
          <button
            type="button"
            onClick={toggleDictation}
            disabled={disabled}
            aria-label={dictation.listening ? 'Arrêter la dictée' : 'Dicter un message'}
            aria-pressed={dictation.listening}
            className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40 ${
              dictation.listening ? 'bg-red-500 text-white' : 'text-gray-500 hover:bg-gray-100 active:bg-gray-100'
            }`}
          >
            {dictation.listening && <span className="absolute inset-0 animate-ping rounded-full bg-red-400 opacity-60" />}
            <MicIcon />
          </button>
        )}

        <button
          type="submit"
          disabled={!canSend}
          aria-label="Envoyer"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#e73e11] text-white shadow-md transition-all disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none"
        >
          <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path d="M3.105 2.288a.75.75 0 00-.826.95l1.414 4.926A1.5 1.5 0 005.135 9.25h6.115a.75.75 0 010 1.5H5.135a1.5 1.5 0 00-1.442 1.086l-1.414 4.926a.75.75 0 00.826.95 28.897 28.897 0 0015.293-7.154.75.75 0 000-1.115A28.897 28.897 0 003.105 2.288z" />
          </svg>
        </button>
      </div>
    </form>
  )
}

function CameraIcon({ className = 'h-5 w-5 text-gray-500' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
    </svg>
  )
}

function MicIcon() {
  return (
    <svg className="relative h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
    </svg>
  )
}

function ImageIcon() {
  return (
    <svg className="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21zm10.5-11.25h.008v.008h-.008V9.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
    </svg>
  )
}
