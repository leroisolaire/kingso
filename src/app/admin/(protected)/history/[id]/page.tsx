import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import Badge from '@/components/ui/Badge'
import { getHistoryBySession, getUsedSources, getConversationMeta, type UsedSource } from '@/lib/db/queries/history'
import { getSignedUrls } from '@/lib/storage/attachments'
import type { Document } from '@/types/document'
import type { HistoryEntry } from '@/types/history'

export const metadata: Metadata = { title: 'Détail conversation | Admin' }

const TYPE_VARIANT: Record<Document['type'], 'public' | 'internal' | 'franchise'> = {
  PUBLIC: 'public',
  INTERNAL: 'internal',
  FRANCHISE: 'franchise',
}

interface Props {
  params: Promise<{ id: string }>
}

function MessageSources({ sources }: { sources: UsedSource[] }) {
  if (sources.length === 0) {
    return <Badge variant="neutral">Aucun document</Badge>
  }
  return (
    <div className="flex flex-wrap gap-2">
      {sources.map((source) => {
        if (source.deleted) {
          return <Badge key={source.id} variant="neutral">{source.title}</Badge>
        }
        if (source.kind === 'webpage') {
          return (
            <a key={source.id} href={source.url ?? undefined} target="_blank" rel="noopener noreferrer">
              <Badge variant="neutral">🌐 {source.title}</Badge>
            </a>
          )
        }
        return (
          <Link key={source.id} href={`/admin/documents/${source.id}`}>
            <Badge variant={source.type ? TYPE_VARIANT[source.type] : 'neutral'}>{source.title}</Badge>
          </Link>
        )
      })}
    </div>
  )
}

function MessageExchange({ entry, sources, photoUrls }: { entry: HistoryEntry; sources: UsedSource[]; photoUrls: Record<string, string> }) {
  const photos = entry.attachments ?? []
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Utilisateur</p>
        {photos.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {photos.map((path) =>
              photoUrls[path] ? (
                <a key={path} href={photoUrls[path]} target="_blank" rel="noopener noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photoUrls[path]} alt="Photo envoyée" className="h-32 w-32 rounded-lg object-cover ring-1 ring-gray-200" />
                </a>
              ) : (
                <Badge key={path} variant="neutral">Photo indisponible</Badge>
              ),
            )}
          </div>
        )}
        <p className="whitespace-pre-wrap text-gray-900">{entry.userMessage}</p>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-600">Kingso</p>
        <p className="whitespace-pre-wrap text-gray-900">{entry.assistantMessage}</p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Documents utilisés</p>
        <MessageSources sources={sources} />
      </div>

      <p className="text-right text-xs text-gray-400">
        {new Date(entry.createdAt).toLocaleString('fr-FR')}
      </p>
    </div>
  )
}

export default async function HistoryDetailPage({ params }: Props) {
  const { id: sessionToken } = await params
  const entries = await getHistoryBySession(sessionToken)

  if (entries.length === 0) notFound()

  const [sourcesByMessage, meta, photoUrls] = await Promise.all([
    Promise.all(entries.map((entry) => getUsedSources(entry.documentsUsed))),
    getConversationMeta(sessionToken),
    getSignedUrls(entries.flatMap((e) => e.attachments ?? [])),
  ])

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/admin/history" className="text-sm text-amber-600 hover:underline">
          ← Retour
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">
          Conversation ({entries.length} message{entries.length > 1 ? 's' : ''})
        </h1>
      </div>

      {meta.summary && <p className="-mt-3 mb-4 text-base font-medium text-gray-800">{meta.summary}</p>}

      {meta.assistant && (
        <p className="-mt-1 mb-6 text-sm text-gray-500">
          Chat : <Link href={`/admin/assistants/${meta.assistant.id}`} className="text-amber-600 hover:underline">{meta.assistant.name}</Link>
        </p>
      )}

      {meta.escalations.map((e) => (
        <div key={e.id} className="mb-6 rounded-xl border border-blue-200 bg-blue-50 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Demande SAV · {e.createdAt.toLocaleString('fr-FR')}</p>
          <p className="mt-2 font-medium text-gray-900">{e.firstName} {e.lastName}</p>
          <p className="text-sm text-gray-700">
            <a href={`tel:${e.phone.replace(/\s/g, '')}`} className="hover:underline">{e.phone}</a> · {e.postalCode}
            {e.email && <> · <a href={`mailto:${e.email}`} className="hover:underline">{e.email}</a></>}
          </p>
          <p className={`mt-2 text-xs ${e.emailSent ? 'text-green-700' : 'text-red-600'}`}>
            {e.emailSent ? '✓ Email envoyé au SAV' : `✗ Email non envoyé${e.emailError ? ` : ${e.emailError}` : ''}`}
          </p>
        </div>
      ))}

      <div className="space-y-8">
        {entries.map((entry, i) => (
          <MessageExchange key={entry.id} entry={entry} sources={sourcesByMessage[i]} photoUrls={photoUrls} />
        ))}
      </div>
    </div>
  )
}
