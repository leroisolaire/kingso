import type { Metadata } from 'next'
import Header from '@/components/layout/Header'
import ChatWindow from '@/components/chat/ChatWindow'

export const metadata: Metadata = {
  title: 'Assistant',
}

export default function ChatPage() {
  return (
    <>
      <Header />
      <main className="flex flex-1 flex-col overflow-hidden">
        {/* ChatWindow est un Client Component qui gère tout l'état du chat */}
        <div className="flex flex-1 flex-col" style={{ height: 'calc(100vh - 64px)' }}>
          <ChatWindow />
        </div>
      </main>
    </>
  )
}
