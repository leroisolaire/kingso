import type { Metadata } from 'next'
import Link from 'next/link'
import AssistantChat from '@/components/assistant/AssistantChat'
import { findAssistantBySlug } from '@/lib/db/queries/assistants'
import { getCaseByToken } from '@/lib/sav/caseAccess'
import type { PublicAssistant } from '@/types/assistant'

// Lien personnel envoyé au client par email : le chat connaît déjà son dossier SAV
export const metadata: Metadata = { title: 'Kingso — Le Roi Solaire', robots: { index: false, follow: false } }

export default async function CasePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const savCase = await getCaseByToken(token)
  const { assistant } = savCase?.assistant ? await findAssistantBySlug(savCase.assistant.slug) : { assistant: null }

  if (!savCase || !assistant) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-[#f7f6f4] p-6 text-center text-gray-800">
        <div className="max-w-sm space-y-3">
          <p className="text-lg font-semibold">Ce lien n&apos;est plus valide.</p>
          <p className="text-sm text-gray-500">Kingso, l&apos;assistant de Le Roi Solaire, reste disponible pour vous aider.</p>
          <Link href="/" className="inline-block rounded-full bg-[#e73e11] px-5 py-2.5 text-sm font-semibold text-white">Ouvrir Kingso</Link>
        </div>
      </main>
    )
  }

  const welcome = [
    'Bonjour, je suis Kingso, l\'assistant de Le Roi Solaire.',
    `Vous nous avez laissé un message${savCase.emailProblem ? ` concernant ${savCase.emailProblem}` : ''}. Je vais vous aider à résoudre ce problème, pas à pas.`,
  ].join('\n\n')

  const publicAssistant: PublicAssistant = {
    slug: assistant.slug,
    name: assistant.name,
    audience: assistant.audience,
    welcomeMessage: welcome,
    startButtons: [],
    suggestedQuestions: [],
    escalationEnabled: false, // remplacé par le bouton « Être rappelé » (coordonnées déjà connues)
    attachmentsEnabled: assistant.attachmentsEnabled,
    isPreview: false,
  }

  return (
    <AssistantChat
      assistant={publicAssistant}
      initialQuestion={savCase.clientQuestion ?? undefined}
      caseMode={{ token, resolved: savCase.status === 'RESOLVED' }}
    />
  )
}
