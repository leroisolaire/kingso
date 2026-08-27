import type { Metadata } from 'next'
import ChatWindow from '@/components/chat/ChatWindow'
import ChatAuthButton from '@/components/layout/ChatAuthButton'
import { hasChatAccess } from '@/lib/auth/chatAccess'

export const metadata: Metadata = {
  title: 'Kingso — Assistant Le Roi Solaire',
}

export default async function HomePage() {
  const authenticated = await hasChatAccess()

  return (
    <main className="absolute inset-0 overflow-hidden">
      <div className="absolute top-4 right-4 z-30">
        <ChatAuthButton authenticated={authenticated} />
      </div>
      <ChatWindow />
    </main>
  )
}
