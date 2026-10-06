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
          key: 'firstMessage',
          header: 'Première question',
          render: (c) => (
            <span className="line-clamp-1 max-w-sm text-gray-900">{c.firstMessage}</span>
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
