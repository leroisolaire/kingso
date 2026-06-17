'use client'

import { useState, KeyboardEvent, FormEvent, ChangeEvent, useRef } from 'react'

interface ChatInputProps {
  onSend: (message: string) => void
  disabled?: boolean
  onFocus?: () => void
}

export default function ChatInput({ onSend, disabled = false, onFocus }: ChatInputProps) {
  const [value, setValue] = useState('')
  const [focused, setFocused] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setValue('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e as unknown as FormEvent)
    }
  }

  const handleInput = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }

  const active = value.trim() && !disabled

  return (
    <form onSubmit={handleSubmit}>
      <div
        className="flex items-end gap-3 rounded-2xl px-4 py-3 transition-all duration-200"
        style={{
          background: '#fff',
          border: focused ? '1.5px solid #e73e11' : '1.5px solid #e5e5e5',
          boxShadow: focused
            ? '0 0 0 4px rgba(231,62,17,0.08), 0 2px 12px rgba(0,0,0,0.06)'
            : '0 1px 8px rgba(0,0,0,0.06)',
        }}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onFocus={() => { setFocused(true); onFocus?.() }}
          onBlur={() => setFocused(false)}
          placeholder="Posez votre question à Kingso…"
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none bg-transparent text-sm text-gray-800 outline-none placeholder:text-gray-400 leading-relaxed"
          style={{
            maxHeight: 120,
            overflowY: 'auto',
            caretColor: '#e73e11',
          }}
        />

        <button
          type="submit"
          disabled={!active}
          aria-label="Envoyer"
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
          style={{
            background: active ? '#e73e11' : '#f0f0f0',
            boxShadow: active ? '0 2px 10px rgba(231,62,17,0.35)' : 'none',
            transform: active ? 'scale(1)' : 'scale(0.95)',
          }}
        >
          <svg
            className="h-4 w-4 transition-colors"
            style={{ color: active ? '#fff' : '#aaa' }}
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path d="M3.105 2.288a.75.75 0 00-.826.95l1.414 4.926A1.5 1.5 0 005.135 9.25h6.115a.75.75 0 010 1.5H5.135a1.5 1.5 0 00-1.442 1.086l-1.414 4.926a.75.75 0 00.826.95 28.897 28.897 0 0015.293-7.154.75.75 0 000-1.115A28.897 28.897 0 003.105 2.288z" />
          </svg>
        </button>
      </div>

      <p className="mt-2 text-center text-[10px] text-gray-300">
        Kingso répond uniquement depuis la documentation officielle Le Roi Solaire.
      </p>
    </form>
  )
}
