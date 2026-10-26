import { notFound, redirect } from 'next/navigation'
import AssistantChat from '@/components/assistant/AssistantChat'
import PasswordGate from '@/components/assistant/PasswordGate'
import { resolveAssistant } from '@/lib/assistants/resolve'
import { getHomeTiles } from '@/lib/db/queries/assistants'
import type { PublicAssistant } from '@/types/assistant'

/** Contenu d'une page de chat (kingso.fr/{slug}, ou kingso.fr pour le chat d'accueil). */
export default async function AssistantPageContent({ slug, question }: { slug: string; question?: string }) {
  const resolved = await resolveAssistant(slug)

  if (resolved.kind === 'redirect') redirect(`/${resolved.slug}`)
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
  // Le chat d'accueil affiche les tuiles des chats proposés et oriente la 1re question
  const tiles = assistant.isHome ? await getHomeTiles() : []

  return <AssistantChat assistant={publicAssistant} tiles={tiles} initialQuestion={question?.slice(0, 2000)} />
}
