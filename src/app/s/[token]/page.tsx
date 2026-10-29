import type { Metadata } from 'next'
import Link from 'next/link'
import AssistantChat from '@/components/assistant/AssistantChat'
import { findAssistantBySlug } from '@/lib/db/queries/assistants'
import { caseAssistantSlug, getCaseByToken } from '@/lib/sav/caseAccess'
import { caseLinkMode } from '@/lib/sav/linkMode'
import type { PublicAssistant } from '@/types/assistant'

// Lien personnel envoyé au client par email : le chat connaît déjà son dossier SAV
export const metadata: Metadata = { title: 'Kingso — Le Roi Solaire', robots: { index: false, follow: false } }

export default async function CasePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const savCase = await getCaseByToken(token)
  // Chat du dossier, sinon le chat PAC : le lien marche toujours
  const slug = savCase ? await caseAssistantSlug(savCase) : null
  const { assistant } = slug ? await findAssistantBySlug(slug) : { assistant: null }

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

  // « Kingso peut aider » : dépannage pas à pas ; sinon : compléter le dossier pour l'équipe (photos, précisions)
  const mode = caseLinkMode(savCase)
  const welcome = [
    'Bonjour, je suis Kingso, l\'assistant de Le Roi Solaire.',
    mode === 'help'
      ? `Vous nous avez laissé un message${savCase.emailProblem ? ` concernant ${savCase.emailProblem}` : ''}. Je vais vous aider à résoudre ce problème, pas à pas.`
      : `Votre demande SAV n° ${savCase.number}${savCase.emailProblem ? ` concernant ${savCase.emailProblem}` : ''} est bien enregistrée : notre équipe va vous recontacter. Pour l'aider à préparer la suite, vous pouvez compléter votre dossier ici, avec des photos et quelques précisions.`,
  ].join('\n\n')

  const publicAssistant: PublicAssistant = {
    slug: assistant.slug,
    name: assistant.name,
    audience: assistant.audience,
    welcomeMessage: welcome,
    startButtons: [],
    suggestedQuestions: [],
    escalationEnabled: false, // remplacé par le bouton « Être rappelé » (coordonnées déjà connues)
    attachmentsEnabled: true, // photos toujours possibles : elles complètent le dossier
    isPreview: false,
  }

  return (
    <AssistantChat
      assistant={publicAssistant}
      initialQuestion={savCase.clientQuestion ?? undefined}
      caseMode={{ token, resolved: savCase.status === 'RESOLVED', mode }}
    />
  )
}
