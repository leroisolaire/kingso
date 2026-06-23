import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import Badge from '@/components/ui/Badge'
import { getHistoryById } from '@/lib/db/queries/history'

export const metadata: Metadata = { title: 'Détail conversation | Admin' }

interface Props {
  params: Promise<{ id: string }>
}

export default async function HistoryDetailPage({ params }: Props) {
  const { id } = await params
  const entry = await getHistoryById(id)

  if (!entry) notFound()

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/admin/history" className="text-sm text-amber-600 hover:underline">
          ← Retour
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Détail de la conversation</h1>
      </div>

      <div className="space-y-4">
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
          {entry.documentsUsed.length === 0 ? (
            <Badge variant="neutral">Aucun document</Badge>
          ) : (
            <div className="flex flex-wrap gap-2">
              {entry.documentsUsed.map((docId) => (
                <Badge key={docId} variant="internal">{docId}</Badge>
              ))}
            </div>
          )}
        </div>

        <p className="text-right text-xs text-gray-400">
          {new Date(entry.createdAt).toLocaleString('fr-FR')}
        </p>
      </div>
    </div>
  )
}
