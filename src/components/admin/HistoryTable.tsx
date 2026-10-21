import Link from 'next/link'
import Table from '@/components/ui/Table'
import Badge from '@/components/ui/Badge'
import type { ConversationSummary } from '@/lib/db/queries/history'

interface HistoryTableProps {
  conversations: ConversationSummary[]
}

export default function HistoryTable({ conversations }: HistoryTableProps) {
  return (
    <Table
      data={conversations}
      emptyMessage="Aucune conversation enregistrée."
      columns={[
        {
          key: 'summary',
          header: 'Conversation',
          render: (c) => (
            <Link href={`/admin/history/${c.sessionToken}`} className="block max-w-xl">
              {c.summary ? (
                <span className="line-clamp-2 font-medium text-gray-900">{c.summary}</span>
              ) : (
                <span className="line-clamp-1 text-gray-700">
                  {c.firstMessage}
                  <span className="ml-2 text-xs italic text-gray-400">(résumé en cours)</span>
                </span>
              )}
            </Link>
          ),
        },
        {
          key: 'assistantName',
          header: 'Chat',
          render: (c) => (
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="text-gray-600">{c.assistantName ?? 'Assistant général'}</span>
              {c.photoCount > 0 && <Badge variant="neutral">📷 {c.photoCount}</Badge>}
              {c.hasEscalation && <Badge variant="internal">Demande SAV</Badge>}
            </span>
          ),
        },
        {
          key: 'messageCount',
          header: 'Messages',
          render: (c) => (
            <Badge variant={c.messageCount > 1 ? 'public' : 'neutral'}>{c.messageCount}</Badge>
          ),
        },
        {
          key: 'lastCreatedAt',
          header: 'Dernière activité',
          render: (c) => new Date(c.lastCreatedAt).toLocaleString('fr-FR'),
        },
        {
          key: 'actions',
          header: '',
          className: 'w-16 text-right',
          render: (c) => (
            <Link
              href={`/admin/history/${c.sessionToken}`}
              className="text-sm text-amber-600 hover:underline"
            >
              Voir
            </Link>
          ),
        },
      ]}
    />
  )
}
