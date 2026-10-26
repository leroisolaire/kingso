import type { Metadata, Viewport } from 'next'
import AssistantPageContent from '@/components/assistant/AssistantPageContent'
import { resolveAssistant } from '@/lib/assistants/resolve'

interface Props {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ q?: string | string[] }>
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

export default async function AssistantPage({ params, searchParams }: Props) {
  const [{ slug }, { q }] = await Promise.all([params, searchParams])
  return <AssistantPageContent slug={slug} question={typeof q === 'string' ? q : undefined} />
}
