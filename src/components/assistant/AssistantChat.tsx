'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import MascotDisplay from '@/components/mascot/MascotDisplay'
import VideoPreloader from '@/components/mascot/VideoPreloader'
import Composer from './Composer'
import EscalationCard from './EscalationCard'
import { useAssistantChat, type AssistantMessage } from '@/hooks/useAssistantChat'
import type { MascotState } from '@/types/chat'
import type { PublicAssistant } from '@/types/assistant'

const STATE_LABEL: Record<MascotState, string> = {
  idle: 'En ligne',
  thinking: 'Kingso réfléchit…',
  talking: 'Kingso répond…',
  happy: 'En ligne',
  wave: 'En ligne',
  bored: 'En ligne',
  confused: 'En ligne',
}

const URL_REGEX = /(https?:\/\/[^\s]+)/g

function MessageText({ content }: { content: string }) {
  return (
    <>
      {content.split(URL_REGEX).map((part, i) =>
        i % 2 === 1 ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="break-all text-[#e73e11] underline underline-offset-2">
            {part.replace(/^https?:\/\//, '')}
          </a>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  )
}

function KingsoAvatar() {
  return (
    <Image src="/kingso-avatar.png" alt="" width={28} height={28} className="h-7 w-7 shrink-0 rounded-full object-cover ring-2 ring-[#e73e11]/20" />
  )
}

function KingsoBubble({ children, error, footer }: { children: React.ReactNode; error?: boolean; footer?: React.ReactNode }) {
  return (
    <div className="message-in flex items-start gap-2.5" style={{ opacity: 0 }}>
      <KingsoAvatar />
      <div className="flex min-w-0 max-w-[88%] flex-col items-start gap-1 sm:max-w-[80%]">
        <div
          className={`min-w-0 whitespace-pre-wrap rounded-2xl rounded-tl-md px-4 py-3 text-[15px] leading-relaxed ${error ? 'bg-red-50 text-red-700' : 'bg-white text-gray-800'}`}
          style={error ? undefined : { boxShadow: '0 1px 10px rgba(0,0,0,0.05), 0 0 0 1px rgba(0,0,0,0.04)' }}
        >
          {children}
        </div>
        {footer}
      </div>
    </div>
  )
}

/** 👍 / 👎 sous une réponse de Kingso (un 2e appui retire l'avis). */
function RatingButtons({ rating, onRate }: { rating: 1 | -1 | null; onRate: (value: 1 | -1) => void }) {
  const button = (value: 1 | -1, label: string, path: string) => {
    const active = rating === value
    return (
      <button
        type="button"
        onClick={() => onRate(value)}
        aria-label={label}
        aria-pressed={active}
        className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
          active ? (value === 1 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600') : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
        }`}
      >
        <svg className="h-[18px] w-[18px]" fill={active ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d={path} />
        </svg>
      </button>
    )
  }
  return (
    <div className="flex items-center gap-0.5">
      {button(1, 'Réponse utile', 'M6.633 10.25c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 012.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 00.322-1.672V2.75a.75.75 0 01.75-.75 2.25 2.25 0 012.25 2.25c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282m0 0h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 01-2.649 7.521c-.388.482-.987.729-1.605.729H13.48c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 00-1.423-.23H5.904m10.598-9.75H14.25M5.904 18.5c.083.205.173.405.27.602.197.4-.078.898-.523.898h-.908c-.889 0-1.713-.518-1.972-1.368a12 12 0 01-.521-3.507c0-1.553.295-3.036.831-4.398C3.387 9.953 4.167 9.5 5 9.5h1.053c.472 0 .745.556.5.96a8.958 8.958 0 00-1.302 4.665c0 1.194.232 2.333.654 3.375z')}
      {button(-1, 'Réponse pas utile', 'M7.498 15.25H4.372c-1.026 0-1.945-.694-2.054-1.715a12.137 12.137 0 01-.068-1.285c0-2.848.992-5.464 2.649-7.521C5.287 4.247 5.886 4 6.504 4h4.016a4.5 4.5 0 011.423.23l3.114 1.04a4.5 4.5 0 001.423.23h1.294M7.498 15.25c.618 0 .991.724.725 1.282A7.471 7.471 0 007.5 19.75 2.25 2.25 0 009.75 22a.75.75 0 00.75-.75v-.633c0-.573.11-1.14.322-1.672.304-.76.93-1.33 1.653-1.715a9.04 9.04 0 002.86-2.4c.498-.634 1.226-1.08 2.032-1.08h.384m-10.253 1.5H9.7m8.075-9.75c.01.05.027.1.05.148.593 1.2.925 2.55.925 3.977 0 1.487-.36 2.89-.999 4.125m.023-8.25c-.076-.365.183-.75.575-.75h.908c.889 0 1.713.518 1.972 1.368.339 1.11.521 2.287.521 3.507 0 1.553-.295 3.036-.831 4.398-.306.774-1.086 1.227-1.918 1.227h-1.053c-.472 0-.745-.556-.5-.96a8.95 8.95 0 00.303-.54')}
    </div>
  )
}

function UserBubble({ message }: { message: AssistantMessage }) {
  return (
    <div className="message-in flex flex-col items-end gap-1.5" style={{ opacity: 0 }}>
      {message.thumbnails && message.thumbnails.length > 0 && (
        <div className="flex max-w-[85%] flex-wrap justify-end gap-1.5">
          {message.thumbnails.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={src} alt={`Photo ${i + 1}`} className="h-28 w-28 rounded-2xl object-cover ring-1 ring-black/5" />
          ))}
        </div>
      )}
      {message.content && (
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-[#e73e11] px-4 py-3 text-[15px] leading-relaxed text-white sm:max-w-[75%]">
          {message.content}
        </div>
      )}
    </div>
  )
}

function TypingBubble() {
  return (
    <div className="flex items-start gap-2.5">
      <KingsoAvatar />
      <div className="inline-flex items-center gap-1.5 rounded-2xl rounded-tl-md bg-white px-4 py-4" style={{ boxShadow: '0 1px 10px rgba(0,0,0,0.05), 0 0 0 1px rgba(0,0,0,0.04)' }}>
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-2 w-2 rounded-full bg-[#e73e11]" style={{ animation: `typing-dot 1.3s ease-in-out ${i * 0.22}s infinite` }} />
        ))}
      </div>
    </div>
  )
}

/**
 * Hauteur réellement visible : sur iOS, le clavier recouvre la page sans la redimensionner.
 * On cale le chat sur le viewport visible pour garder la saisie au-dessus du clavier.
 */
function useVisualViewportHeight() {
  const [height, setHeight] = useState<number | null>(null)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const update = () => {
      setHeight(vv.height)
      window.scrollTo(0, 0)
    }
    update()
    vv.addEventListener('resize', update)
    return () => vv.removeEventListener('resize', update)
  }, [])
  return height
}

export default function AssistantChat({ assistant }: { assistant: PublicAssistant }) {
  const {
    messages, isTyping, mascotState, hydrated,
    escalationOffered, escalationSent, limitReached, canRetry,
    sendMessage, retryFailed, rateMessage, submitEscalation, handleInteraction, resetConversation,
  } = useAssistantChat(assistant.slug)
  // La carte SAV s'ouvre quand Kingso la propose ; le client peut la fermer puis la rouvrir
  const [dismissedOfferId, setDismissedOfferId] = useState<string | null>(null)
  const [cardOpenedManually, setCardOpenedManually] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const viewportHeight = useVisualViewportHeight()

  const latestOfferId = [...messages].reverse().find((m) => m.offerEscalation)?.id ?? null
  const cardVisible = cardOpenedManually || (latestOfferId !== null && latestOfferId !== dismissedOfferId)
  const closeCard = () => {
    setDismissedOfferId(latestOfferId)
    setCardOpenedManually(false)
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, isTyping, cardVisible])

  const userMessageCount = messages.filter((m) => m.role === 'USER').length
  const showStartButtons = hydrated && messages.length === 0 && assistant.startButtons.length > 0
  const showSuggestions = hydrated && !isTyping && !limitReached && assistant.suggestedQuestions.length > 0
    && (assistant.startButtons.length === 0 || userMessageCount >= 1) && userMessageCount < 4
  const showEscalationLink = assistant.escalationEnabled && escalationOffered && !cardVisible && !escalationSent

  const send = (text: string, images: Parameters<typeof sendMessage>[1] = []) => {
    handleInteraction()
    sendMessage(text, images)
  }

  return (
    <div
      className="fixed inset-x-0 top-0 flex h-dvh overflow-hidden bg-white text-gray-900"
      style={viewportHeight ? { height: viewportHeight } : undefined}
    >
      <VideoPreloader />

      {/* ── Panneau Kingso (ordinateur) ── */}
      <aside className="relative hidden flex-col items-center justify-center border-r border-gray-100 bg-white lg:flex lg:w-[42%] xl:w-[44%]">
        <MascotDisplay state={mascotState} size={520} />
        <div className="mt-1 space-y-1.5 text-center">
          <h1 className="font-black tracking-tight text-gray-900" style={{ fontSize: 'clamp(2.6rem, 4vw, 4rem)', lineHeight: 1, letterSpacing: '-0.03em', fontFamily: 'var(--font-montserrat)' }}>
            Kingso
          </h1>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#e73e11]">{assistant.name}</p>
          <p className="flex items-center justify-center gap-2 pt-1 text-xs text-gray-400">
            <span className={`h-2 w-2 rounded-full ${mascotState === 'thinking' || mascotState === 'talking' ? 'bg-[#e73e11]' : 'bg-green-500'}`} />
            {STATE_LABEL[mascotState]}
          </p>
        </div>
      </aside>

      {/* ── Conversation ── */}
      <div className="flex min-w-0 flex-1 flex-col bg-[#f7f6f4]">
        {/* En-tête mobile compact : laisse un maximum de place à la conversation */}
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-gray-100 bg-white px-3 sm:px-5" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-white lg:hidden">
            <MascotDisplay state={mascotState} size={48} />
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-base font-bold text-gray-900 lg:hidden" style={{ fontFamily: 'var(--font-montserrat)' }}>Kingso</p>
            <p className="hidden truncate text-base font-semibold text-gray-900 lg:block">{assistant.name}</p>
            <p className="flex items-center gap-1.5 truncate text-xs text-gray-500">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${mascotState === 'thinking' || mascotState === 'talking' ? 'bg-[#e73e11]' : 'bg-green-500'}`} />
              <span className="lg:hidden">{assistant.name} · </span>{STATE_LABEL[mascotState]}
            </p>
          </div>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => {
                // Effacer la conversation ne doit jamais se faire par erreur
                if (!window.confirm("Commencer une nouvelle conversation ?\n\nL'échange actuel sera effacé de cet écran.")) return
                closeCard()
                resetConversation()
              }}
              className="flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-gray-200 px-3 text-sm text-gray-600 hover:bg-gray-50 active:bg-gray-100"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              <span className="sm:hidden">Nouvelle</span>
              <span className="hidden sm:inline">Nouvelle conversation</span>
            </button>
          )}
        </header>

        {assistant.isPreview && (
          <div className="shrink-0 bg-amber-100 px-4 py-1.5 text-center text-xs font-medium text-amber-800">
            Mode aperçu admin — les messages ne sont pas limités
          </div>
        )}

        {/* Messages */}
        <main className="light-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-5 sm:px-6 lg:px-10">
          <div className="mx-auto flex max-w-2xl flex-col gap-5">
            <KingsoBubble>
              <MessageText content={assistant.welcomeMessage} />
            </KingsoBubble>

            {showStartButtons && (
              <div className="message-in flex flex-col gap-2.5 pl-9 sm:flex-row sm:flex-wrap" style={{ opacity: 0 }}>
                {assistant.startButtons.map((label) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => send(label)}
                    className="min-h-12 rounded-2xl border-2 border-[#e73e11]/20 bg-white px-5 py-3 text-left text-base font-semibold text-gray-900 shadow-sm transition-colors hover:border-[#e73e11] active:border-[#e73e11] active:bg-[#e73e11]/5 sm:text-center"
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            {messages.map((m, i) =>
              m.role === 'USER' ? (
                <UserBubble key={m.id} message={m} />
              ) : (
                <KingsoBubble key={m.id} error={m.isError} footer={m.historyId && !m.isError ? (
                  <RatingButtons rating={m.rating ?? null} onRate={(value) => rateMessage(m.id, value)} />
                ) : undefined}>
                  <MessageText content={m.content} />
                  {m.isError && canRetry && i === messages.length - 1 && !isTyping && (
                    <button
                      type="button"
                      onClick={retryFailed}
                      className="mt-3 flex h-10 items-center gap-2 rounded-full bg-[#e73e11] px-4 text-sm font-semibold text-white"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                      </svg>
                      Réessayer
                    </button>
                  )}
                </KingsoBubble>
              ),
            )}

            {isTyping && <TypingBubble />}

            {assistant.escalationEnabled && (cardVisible || escalationSent) && (
              <div className="sm:pl-9">
                <EscalationCard sent={escalationSent} onSubmit={submitEscalation} onClose={closeCard} />
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        </main>

        {/* Saisie */}
        <footer className="shrink-0 border-t border-gray-100 bg-white px-3 pt-2.5 sm:px-6 lg:px-10" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          <div className="mx-auto max-w-2xl">
            {(showSuggestions || showEscalationLink) && (
              <div className="-mx-3 mb-2.5 flex gap-2 overflow-x-auto px-3 pb-0.5 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
                {showEscalationLink && (
                  <button
                    type="button"
                    onClick={() => setCardOpenedManually(true)}
                    className="h-10 shrink-0 rounded-full bg-[#e73e11] px-4 text-sm font-semibold text-white"
                  >
                    Transmettre au SAV
                  </button>
                )}
                {showSuggestions && assistant.suggestedQuestions.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => send(q)}
                    className="h-10 shrink-0 whitespace-nowrap rounded-full border border-gray-200 bg-white px-4 text-sm text-gray-700 transition-colors hover:border-[#e73e11] hover:text-[#e73e11] active:bg-gray-50"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            {limitReached ? (
              <p className="py-3 text-center text-sm text-gray-500">
                Limite de messages atteinte pour aujourd&apos;hui. Merci de revenir demain.
              </p>
            ) : (
              <Composer
                onSend={send}
                disabled={isTyping || !hydrated}
                attachmentsEnabled={assistant.attachmentsEnabled}
                onFocus={handleInteraction}
              />
            )}
            <p className="mt-1.5 text-center text-[10px] text-gray-400">
              Kingso répond à partir de la documentation Le Roi Solaire.
            </p>
          </div>
        </footer>
      </div>
    </div>
  )
}
