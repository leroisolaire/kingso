'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import MascotDisplay from '@/components/mascot/MascotDisplay'
import ChatInput from './ChatInput'
import { useChat } from '@/hooks/useChat'
import type { ChatMessage, MascotState } from '@/types/chat'

const STATE_LABEL: Record<MascotState, string> = {
  idle:     'En ligne',
  thinking: 'Kingso réfléchit…',
  talking:  'Kingso répond…',
  happy:    'Kingso a répondu !',
  wave:     'Bonjour !',
  bored:    'Kingso s\'ennuie…',
  confused: 'Kingso ne sait pas…',
}

const STATE_DOT_COLOR: Record<MascotState, string> = {
  idle:     '#22c55e',
  thinking: '#e73e11',
  talking:  '#e73e11',
  happy:    '#22c55e',
  wave:     '#22c55e',
  bored:    '#94a3b8',
  confused: '#94a3b8',
}


/* ── Bulle de message ── */
function MessageBubble({
  message,
  index,
  total,
}: {
  message: ChatMessage
  index: number
  total: number
}) {
  const isUser = message.role === 'USER'
  // Anciens messages légèrement estompés pour donner de la profondeur
  const isFaded = total > 4 && index < total - 3

  return (
    <div
      className={[
        'flex items-end gap-3 message-in transition-opacity duration-500',
        isUser ? 'flex-row-reverse' : 'flex-row',
        isFaded ? 'opacity-40' : 'opacity-100',
      ].join(' ')}
      style={{ opacity: 0, animationDelay: `${Math.min(index * 0.04, 0.2)}s` }}
    >
      <div className={['flex flex-col gap-1.5 max-w-[75%]', isUser ? 'items-end' : 'items-start'].join(' ')}>
        {/* Bulle */}
        <div className="relative">
          {/* Queue gauche — Kingso (pointe vers Kingso à gauche) */}
          {!isUser && (
            <div
              className="absolute -left-2 top-4"
              style={{
                width: 0, height: 0,
                borderTop:    '7px solid transparent',
                borderBottom: '7px solid transparent',
                borderRight:  '9px solid #1e0e06',
              }}
            />
          )}
          {/* Queue droite — utilisateur */}
          {isUser && (
            <div
              className="absolute -right-2 top-4"
              style={{
                width: 0, height: 0,
                borderTop:    '7px solid transparent',
                borderBottom: '7px solid transparent',
                borderLeft:   '9px solid #e73e11',
              }}
            />
          )}

          <div
            className={[
              'rounded-2xl px-4 py-3 text-sm leading-relaxed',
              isUser
                ? 'text-white rounded-br-sm'
                : 'text-white/90 rounded-bl-sm',
            ].join(' ')}
            style={
              isUser
                ? { background: '#e73e11' }
                : { background: '#1e0e06', border: '1px solid rgba(231,62,17,0.18)' }
            }
          >
            {message.content}
          </div>
        </div>

        {/* Sources */}
        {!isUser && message.documentsUsed && message.documentsUsed.length > 0 && (
          <p className="text-xs text-white/25 flex items-center gap-1 ml-1">
            <span>📄</span>
            {message.documentsUsed.length} source(s) consultée(s)
          </p>
        )}
      </div>
    </div>
  )
}

/* ── Indicateur "Kingso écrit" ── */
function TypingBubble() {
  return (
    <div className="flex items-end gap-3">
      <div
        className="rounded-2xl rounded-bl-sm px-4 py-3.5"
        style={{ background: '#1e0e06', border: '1px solid rgba(231,62,17,0.18)' }}
      >
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-2.5 w-2.5 rounded-full"
              style={{
                background: '#e73e11',
                animation: `typing-dot 1.3s ease-in-out ${i * 0.22}s infinite`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════
   COMPOSANT PRINCIPAL
══════════════════════════════════════════ */
export default function ChatWindow() {
  const { messages, isTyping, mascotState, sendMessage, handleInteraction } = useChat()
  const [showFlash, setShowFlash] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Flash orange quand Kingso répond
  useEffect(() => {
    if (mascotState === 'happy') {
      setShowFlash(true)
      const t = setTimeout(() => setShowFlash(false), 1400)
      return () => clearTimeout(t)
    }
  }, [mascotState])

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  return (
    <div className="absolute inset-0 flex overflow-hidden" style={{ background: '#080503' }}>

      {/* ════════════════════════════════
          PANEL KINGSO — Desktop gauche — fond blanc
      ════════════════════════════════ */}
      <div className="hidden lg:flex lg:w-[46%] flex-col relative flex-shrink-0 bg-white self-stretch">
        {/* Flash réponse orange subtil */}
        {showFlash && (
          <div
            className="absolute inset-0 pointer-events-none z-20"
            style={{
              background: 'radial-gradient(ellipse at 50% 65%, rgba(231,62,17,0.08) 0%, transparent 65%)',
              animation: 'kingso-flash 1.4s ease-out forwards',
            }}
          />
        )}

        {/* Nav haut */}
        <div className="relative z-10 px-8 pt-7" />

        {/* Kingso centré verticalement */}
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center">
          <MascotDisplay state={mascotState} size={680} />

          <div className="mt-1 text-center space-y-1">
            <h1
              className="font-black tracking-tight text-gray-900"
              style={{ fontSize: 'clamp(3rem, 5vw, 5rem)', lineHeight: 1, letterSpacing: '-0.03em' }}
            >
              Kingso
            </h1>
            <p className="text-xs font-medium tracking-[0.2em] uppercase"
               style={{ color: '#e73e11' }}>
              Assistant Le Roi Solaire
            </p>

            <div className="flex items-center justify-center gap-2 pt-1">
              <div
                className="h-2 w-2 rounded-full transition-colors duration-700"
                style={{
                  backgroundColor: STATE_DOT_COLOR[mascotState],
                  boxShadow: `0 0 7px ${STATE_DOT_COLOR[mascotState]}`,
                }}
              />
              <span className="text-xs text-gray-400 transition-all duration-500">
                {STATE_LABEL[mascotState]}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Séparateur vertical */}
      <div className="hidden lg:block w-px flex-shrink-0 bg-gray-100" />

      {/* ════════════════════════════════
          PANEL CHAT — droite + tout mobile
      ════════════════════════════════ */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">

        {/* ── Kingso mobile — en haut — fond blanc ── */}
        <div
          className="lg:hidden relative flex-shrink-0 flex flex-col items-center overflow-hidden bg-white border-b border-gray-100"
          style={{ height: '48dvh', paddingTop: '8px' }}
        >
          {/* Flash mobile subtil */}
          {showFlash && (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: 'radial-gradient(ellipse at 50% 80%, rgba(231,62,17,0.07) 0%, transparent 60%)',
                animation: 'kingso-flash 1.4s ease-out forwards',
              }}
            />
          )}

          <div className="relative z-10 flex flex-col items-center gap-2">
            <MascotDisplay state={mascotState} size={300} />
            <div className="text-center">
              <h1 className="text-4xl font-black text-gray-900 tracking-tight">Kingso</h1>
              <div className="flex items-center justify-center gap-1.5 mt-1" style={{ marginBottom: '5px' }}>
                <div className="h-2 w-2 rounded-full"
                     style={{ backgroundColor: STATE_DOT_COLOR[mascotState] }} />
                <span className="text-sm text-gray-400">{STATE_LABEL[mascotState]}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Zone messages ── */}
        <div className="flex-1 overflow-y-auto dark-scroll px-5 lg:px-8 py-6 space-y-4 min-h-0">
          {messages.length === 0 && (
            <div className="flex h-full flex-col justify-center py-8">
              <div className="flex items-end gap-3">
                <div className="flex flex-col gap-1.5 max-w-[80%]">
                  <span className="text-xs font-semibold ml-1" style={{ color: '#e73e11' }}>Kingso</span>
                  <div
                    className="relative rounded-2xl rounded-bl-sm px-5 py-4 text-sm leading-relaxed text-white/90"
                    style={{ background: '#1e0e06', border: '1px solid rgba(231,62,17,0.2)' }}
                  >
                    <div
                      className="absolute -left-2 top-4"
                      style={{
                        width: 0, height: 0,
                        borderTop:    '7px solid transparent',
                        borderBottom: '7px solid transparent',
                        borderRight:  '9px solid #1e0e06',
                      }}
                    />
                    Bonjour ! Je suis Kingso, votre assistant Le Roi Solaire. Posez-moi vos questions — je réponds uniquement depuis notre documentation officielle.
                  </div>
                </div>
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              index={i}
              total={messages.length}
            />
          ))}

          {isTyping && <TypingBubble />}
          <div ref={bottomRef} />
        </div>

        {/* ── Barre de saisie ── */}
        <div
          className="flex-shrink-0 px-4 lg:px-8 py-4"
          style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
        >
          <ChatInput onSend={sendMessage} disabled={isTyping} onFocus={handleInteraction} />
        </div>
      </div>
    </div>
  )
}
