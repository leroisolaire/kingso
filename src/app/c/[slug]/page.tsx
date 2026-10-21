import type { Metadata, Viewport } from 'next'
import { notFound, redirect } from 'next/navigation'
import AssistantChat from '@/components/assistant/AssistantChat'
import PasswordGate from '@/components/assistant/PasswordGate'
import { resolveAssistant } from '@/lib/assistants/resolve'
import type { PublicAssistant } from '@/types/assistant'

interface Props {
  params: Promise<{ slug: string }>
}

export const viewport: Viewport = {
  themeColor: '#ffffff',
  // Android : le clavier redimensionne la page au lieu de la recouvrir
  interactiveWidget: 'resizes-content',
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const resolved = await resolveAssistant(slug)
  if (resolved.kind === 'ok' || resolved.kind === 'locked') {
    return {
      title: resolved.assistant.name,
      description: `Kingso, l'assistant Le Roi Solaire — ${resolved.assistant.name}`,
      robots: { index: false, follow: false },
    }
  }
  return { title: 'Assistant' }
}

export default async function AssistantPage({ params }: Props) {
  const { slug } = await params
  const resolved = await resolveAssistant(slug)

  if (resolved.kind === 'redirect') redirect(`/c/${resolved.slug}`)
  if (resolved.kind === 'not-found') notFound()
  if (resolved.kind === 'locked') return <PasswordGate slug={resolved.assistant.slug} name={resolved.assistant.name} />

  const { assistant, isPreview } = resolved
  const publicAssistant: PublicAssistant = {
    slug: assistant.slug,
    name: assistant.name,
    audience: assistant.audience,
    welcomeMessage: assistant.welcomeMessage,
    startButtons: assistant.startButtons,
    suggestedQuestions: assistant.suggestedQuestions,
    escalationEnabled: assistant.escalationEnabled,
    attachmentsEnabled: assistant.attachmentsEnabled,
    isPreview,
  }

  return <AssistantChat assistant={publicAssistant} />
}
