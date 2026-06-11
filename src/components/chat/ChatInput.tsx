'use client'

import { useState, KeyboardEvent, FormEvent } from 'react'

interface ChatInputProps {
  onSend: (message: string) => void
  disabled?: boolean
}

export default function ChatInput({ onSend, disabled = false }: ChatInputProps) {
  const [value, setValue] = useState('')

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setValue('')
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e as unknown as FormEvent)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-3">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Posez votre question à Kingso…"
        disabled={disabled}
        rows={1}
        className="glass-input flex-1 resize-none rounded-2xl px-5 py-3.5 text-sm text-white outline-none transition-all"
        style={{
          maxHeight: 120,
          overflowY: 'auto',
          color: '#fff',
          caretColor: '#e73e11',
        }}
        /* placeholder couleur via CSS inline trick */
        onFocus={e => e.currentTarget.style.borderColor = 'rgba(231,62,17,0.4)'}
        onBlur={e  => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)'}
      />

      <button
        type="submit"
        disabled={!value.trim() || disabled}
        aria-label="Envoyer"
        className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl transition-all disabled:opacity-30 disabled:cursor-not-allowed"
        style={{
          background: value.trim() && !disabled ? '#e73e11' : 'rgba(231,62,17,0.3)',
          boxShadow: value.trim() && !disabled ? '0 0 20px rgba(231,62,17,0.4)' : 'none',
        }}
      >
        <svg className="h-5 w-5 text-white" viewBox="0 0 20 20" fill="currentColor">
          <path d="M3.105 2.288a.75.75 0 00-.826.95l1.414 4.926A1.5 1.5 0 005.135 9.25h6.115a.75.75 0 010 1.5H5.135a1.5 1.5 0 00-1.442 1.086l-1.414 4.926a.75.75 0 00.826.95 28.897 28.897 0 0015.293-7.154.75.75 0 000-1.115A28.897 28.897 0 003.105 2.288z" />
        </svg>
      </button>
    </form>
  )
}
