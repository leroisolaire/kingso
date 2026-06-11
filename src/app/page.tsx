import type { Metadata } from 'next'
import ChatWindow from '@/components/chat/ChatWindow'

export const metadata: Metadata = {
  title: 'Kingso — Assistant Le Roi Solaire',
}

export default function HomePage() {
  return (
    <main className="absolute inset-0 overflow-hidden">
      <ChatWindow />
    </main>
  )
}
