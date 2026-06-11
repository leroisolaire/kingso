import Link from 'next/link'
import Table from '@/components/ui/Table'
import Badge from '@/components/ui/Badge'
import type { HistoryEntry } from '@/types/history'

interface HistoryTableProps {
  entries: HistoryEntry[]
}

export default function HistoryTable({ entries }: HistoryTableProps) {
  return (
    <Table
      data={entries}
      emptyMessage="Aucune conversation enregistrée."
      columns={[
        {
          key: 'userMessage',
          header: 'Question',
          render: (entry) => (
            <span className="line-clamp-1 max-w-xs text-gray-900">{entry.userMessage}</span>
          ),
        },
        {
          key: 'assistantMessage',
          header: 'Réponse',
          render: (entry) => (
            <span className="line-clamp-1 max-w-sm text-gray-600">{entry.assistantMessage}</span>
          ),
        },
        {
          key: 'docs',
          header: 'Docs utilisés',
          render: (entry) => (
            <Badge variant={entry.documentsUsed.length > 0 ? 'public' : 'neutral'}>
              {entry.documentsUsed.length} doc(s)
            </Badge>
          ),
        },
        {
          key: 'createdAt',
          header: 'Date',
          render: (entry) => new Date(entry.createdAt).toLocaleDateString('fr-FR'),
        },
        {
          key: 'actions',
          header: '',
          className: 'w-16 text-right',
          render: (entry) => (
            <Link
              href={`/admin/history/${entry.id}`}
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
