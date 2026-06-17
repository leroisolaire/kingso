'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import MascotDisplay from '@/components/mascot/MascotDisplay'
import VideoPreloader from '@/components/mascot/VideoPreloader'
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

/* ── URLs cliquables ── */
const URL_REGEX = /(https?:\/\/[^\s]+)/g

function MessageText({ content }: { content: string }) {
  const parts = (content ?? '').split(URL_REGEX)
  return (
    <>
      {parts.map((part, i) =>
        URL_REGEX.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer"
            className="text-[#e73e11] underline underline-offset-2 hover:opacity-75 transition-opacity">
            {part.replace(/^https?:\/\//, '')}
          </a>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  )
}

/* ── Message Kingso — style éditorial ── */
function KingsoMessage({ message, index, total }: { message: ChatMessage; index: number; total: number }) {
  const isFaded = total > 4 && index < total - 3
  const hasUrl = message.documentsUsed && message.documentsUsed.length > 0

  return (
    <div
      className={`message-in transition-opacity duration-500 ${isFaded ? 'opacity-40' : 'opacity-100'}`}
      style={{ opacity: 0, animationDelay: `${Math.min(index * 0.04, 0.2)}s` }}
    >
      <div className="flex items-center gap-2.5 mb-3">
        <Image
          src="/kingso-avatar.png"
          alt="Kingso"
          width={28}
          height={28}
          className="rounded-full object-cover ring-2 ring-[#e73e11]/20 shrink-0"
        />
        <span className="text-xs font-semibold tracking-wide uppercase" style={{ color: '#e73e11' }}>
          Kingso
        </span>
        <span className="text-[10px] text-gray-300 font-light">
          {new Date(message.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      <div className="pl-9">
        <div
          className="rounded-2xl bg-white px-5 py-4 text-[15px] leading-relaxed text-gray-800"
          style={{
            borderLeft: '3px solid #e73e11',
            boxShadow: '0 1px 12px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)',
          }}
        >
          <MessageText content={message.content} />
        </div>

        {hasUrl && (
          <p className="mt-2 flex items-center gap-1.5 text-[11px] text-gray-400">
            <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {message.documentsUsed!.length} source{message.documentsUsed!.length > 1 ? 's' : ''} consultée{message.documentsUsed!.length > 1 ? 's' : ''}
          </p>
        )}
      </div>
    </div>
  )
}

/* ── Message utilisateur — pill épuré ── */
function UserMessage({ message, index, total }: { message: ChatMessage; index: number; total: number }) {
  const isFaded = total > 4 && index < total - 3

  return (
    <div
      className={`message-in flex justify-end transition-opacity duration-500 ${isFaded ? 'opacity-40' : 'opacity-100'}`}
      style={{ opacity: 0, animationDelay: `${Math.min(index * 0.04, 0.2)}s` }}
    >
      <div
        className="max-w-[72%] rounded-2xl rounded-br-sm px-4 py-3 text-[14px] leading-relaxed text-white"
        style={{ background: '#e73e11' }}
      >
        {message.content}
      </div>
    </div>
  )
}

/* ── Indicateur de frappe éditorial ── */
function TypingIndicator() {
  return (
    <div>
      <div className="flex items-center gap-2.5 mb-3">
        <Image
          src="/kingso-avatar.png"
          alt="Kingso"
          width={28}
          height={28}
          className="rounded-full object-cover ring-2 ring-[#e73e11]/20 shrink-0"
        />
        <span className="text-xs font-semibold tracking-wide uppercase" style={{ color: '#e73e11' }}>
          Kingso
        </span>
      </div>
      <div className="pl-9">
        <div
          className="inline-flex items-center gap-1.5 rounded-2xl bg-white px-5 py-4"
          style={{
            borderLeft: '3px solid #e73e11',
            boxShadow: '0 1px 12px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)',
          }}
        >
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-2 w-2 rounded-full"
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

  useEffect(() => {
    if (mascotState === 'happy') {
      setShowFlash(true)
      const t = setTimeout(() => setShowFlash(false), 1400)
      return () => clearTimeout(t)
    }
  }, [mascotState])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  return (
    <div className="absolute inset-0 flex overflow-hidden bg-white">
      <VideoPreloader />

      {/* ════════════════════════════════
          PANEL KINGSO — Desktop gauche
      ════════════════════════════════ */}
      <div className="hidden lg:flex lg:w-[44%] flex-col relative flex-shrink-0 bg-white self-stretch">
        {showFlash && (
          <div
            className="absolute inset-0 pointer-events-none z-20"
            style={{
              background: 'radial-gradient(ellipse at 50% 65%, rgba(231,62,17,0.07) 0%, transparent 65%)',
              animation: 'kingso-flash 1.4s ease-out forwards',
            }}
          />
        )}

        <div className="relative z-10 flex flex-1 flex-col items-center justify-center">
          <MascotDisplay state={mascotState} size={640} />

          <div className="mt-1 text-center space-y-1.5">
            <h1
              className="font-black tracking-tight text-gray-900"
              style={{ fontSize: 'clamp(2.8rem, 4.5vw, 4.5rem)', lineHeight: 1, letterSpacing: '-0.03em', fontFamily: 'var(--font-montserrat)' }}
            >
              Kingso
            </h1>
            <p className="text-[11px] font-semibold tracking-[0.22em] uppercase" style={{ color: '#e73e11' }}>
              Assistant Le Roi Solaire
            </p>

            <div className="flex items-center justify-center gap-2 pt-1">
              <div
                className="h-2 w-2 rounded-full transition-colors duration-700"
                style={{ backgroundColor: STATE_DOT_COLOR[mascotState], boxShadow: `0 0 6px ${STATE_DOT_COLOR[mascotState]}` }}
              />
              <span className="text-xs text-gray-400 transition-all duration-500" style={{ fontFamily: 'var(--font-montserrat)' }}>
                {STATE_LABEL[mascotState]}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Séparateur */}
      <div className="hidden lg:block w-px flex-shrink-0 bg-gray-100" />

      {/* ════════════════════════════════
          PANEL CHAT — droite + mobile
      ════════════════════════════════ */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden" style={{ background: '#f7f6f4' }}>

        {/* Kingso mobile */}
        <div
          className="lg:hidden relative flex-shrink-0 flex flex-col items-center overflow-hidden bg-white border-b border-gray-100"
          style={{ height: '58dvh', paddingTop: '8px', paddingBottom: '10px' }}
        >
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
              <h1 className="text-4xl font-black text-gray-900 tracking-tight" style={{ fontFamily: 'var(--font-montserrat)' }}>Kingso</h1>
              <div className="flex items-center justify-center gap-2 mt-2 mb-3">
                <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: STATE_DOT_COLOR[mascotState] }} />
                <span className="text-base font-medium text-gray-500" style={{ fontFamily: 'var(--font-montserrat)' }}>{STATE_LABEL[mascotState]}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Zone messages */}
        <div className="flex-1 overflow-y-auto px-5 lg:px-8 py-6 space-y-6 min-h-0 light-scroll">
          {messages.length === 0 && (
            <div className="flex h-full flex-col justify-center py-8">
              <div>
                <div className="flex items-center gap-2.5 mb-3">
                  <Image
                    src="/kingso-avatar.png"
                    alt="Kingso"
                    width={28}
                    height={28}
                    className="rounded-full object-cover ring-2 ring-[#e73e11]/20 shrink-0"
                  />
                  <span className="text-xs font-semibold tracking-wide uppercase" style={{ color: '#e73e11' }}>Kingso</span>
                </div>
                <div className="pl-9">
                  <div
                    className="rounded-2xl bg-white px-5 py-4 text-[15px] leading-relaxed text-gray-700"
                    style={{
                      borderLeft: '3px solid #e73e11',
                      boxShadow: '0 1px 12px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)',
                      maxWidth: '480px',
                    }}
                  >
                    Bonjour ! Je suis Kingso, votre assistant Le Roi Solaire. Posez-moi vos questions — je réponds uniquement depuis notre documentation officielle.
                  </div>
                </div>
              </div>
            </div>
          )}

          {messages.map((msg, i) =>
            msg.role === 'ASSISTANT' ? (
              <KingsoMessage key={msg.id} message={msg} index={i} total={messages.length} />
            ) : (
              <UserMessage key={msg.id} message={msg} index={i} total={messages.length} />
            )
          )}

          {isTyping && <TypingIndicator />}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="flex-shrink-0 px-4 lg:px-8 py-4 bg-white border-t border-gray-100">
          <ChatInput onSend={sendMessage} disabled={isTyping} onFocus={handleInteraction} />
        </div>
      </div>
    </div>
  )
}
