import type { ChatMessage as ChatMessageType } from '@/types/chat'

interface ChatMessageProps {
  message: ChatMessageType
}

export default function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'USER'

  return (
    <div className={['flex gap-3', isUser ? 'flex-row-reverse' : 'flex-row'].join(' ')}>
      <div
        className={[
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
          isUser ? 'bg-gray-200 text-gray-700' : 'bg-amber-500 text-white',
        ].join(' ')}
      >
        {isUser ? 'V' : 'K'}
      </div>

      <div className={['flex max-w-[75%] flex-col gap-1', isUser ? 'items-end' : 'items-start'].join(' ')}>
        <div
          className={[
            'rounded-2xl px-4 py-2.5 text-sm leading-6',
            isUser
              ? 'bg-amber-500 text-white rounded-tr-sm'
              : 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm shadow-sm',
          ].join(' ')}
        >
          {message.content}
        </div>

        {!isUser && message.documentsUsed && message.documentsUsed.length > 0 && (
          <p className="text-xs text-gray-400">
            Source : {message.documentsUsed.length} document(s)
          </p>
        )}
      </div>
    </div>
  )
}
