import type { Metadata, Viewport } from 'next'
import { connection } from 'next/server'
import ChatWindow from '@/components/chat/ChatWindow'
import ChatAuthButton from '@/components/layout/ChatAuthButton'
import AssistantPageContent from '@/components/assistant/AssistantPageContent'
import { hasChatAccess } from '@/lib/auth/chatAccess'
import { getHomeAssistantSlug } from '@/lib/db/queries/assistants'

export const metadata: Metadata = {
  title: 'Kingso — Assistant Le Roi Solaire',
}

export const viewport: Viewport = {
  themeColor: '#ffffff',
  interactiveWidget: 'resizes-content',
}

export default async function HomePage() {
  // Lue à chaque visite (et non au build) : le chat d'accueil se choisit dans le back-office
  await connection()
  // Chat d'accueil configuré et actif dans le back-office : il devient la page d'accueil
  const homeSlug = await getHomeAssistantSlug()
  if (homeSlug) return <AssistantPageContent slug={homeSlug} />

  // Sinon, ancien assistant général (toujours disponible aussi sur /chat)
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
