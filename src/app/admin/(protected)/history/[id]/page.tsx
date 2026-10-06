import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import Badge from '@/components/ui/Badge'
import { getHistoryBySession, getUsedSources, type UsedSource } from '@/lib/db/queries/history'
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

function MessageExchange({ entry, sources }: { entry: HistoryEntry; sources: UsedSource[] }) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Utilisateur</p>
        <p className="text-gray-900">{entry.userMessage}</p>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-600">Kingso</p>
        <p className="text-gray-900">{entry.assistantMessage}</p>
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

  const sourcesByMessage = await Promise.all(entries.map((entry) => getUsedSources(entry.documentsUsed)))

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

      <div className="space-y-8">
        {entries.map((entry, i) => (
          <MessageExchange key={entry.id} entry={entry} sources={sourcesByMessage[i]} />
        ))}
      </div>
    </div>
  )
}
