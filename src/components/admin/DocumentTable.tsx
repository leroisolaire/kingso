import Link from 'next/link'
import Badge from '@/components/ui/Badge'
import Table from '@/components/ui/Table'
import type { Document } from '@/types/document'

const typeLabelMap: Record<Document['type'], { label: string; variant: 'public' | 'internal' | 'franchise' }> = {
  PUBLIC: { label: 'Public', variant: 'public' },
  INTERNAL: { label: 'Interne', variant: 'internal' },
  FRANCHISE: { label: 'Franchisé', variant: 'franchise' },
}

interface DocumentTableProps {
  documents: Document[]
}

export default function DocumentTable({ documents }: DocumentTableProps) {
  return (
    <Table
      data={documents}
      emptyMessage="Aucun document. Cliquez sur « Ajouter » pour commencer."
      columns={[
        {
          key: 'title',
          header: 'Titre',
          render: (doc) => (
            <Link href={`/admin/documents/${doc.id}`} className="font-medium text-gray-900 hover:text-amber-600">
              {doc.title}
            </Link>
          ),
        },
        {
          key: 'type',
          header: 'Type',
          render: (doc) => (
            <Badge variant={typeLabelMap[doc.type].variant}>{typeLabelMap[doc.type].label}</Badge>
          ),
        },
        {
          key: 'updatedAt',
          header: 'Mis à jour',
          render: (doc) => new Date(doc.updatedAt).toLocaleDateString('fr-FR'),
        },
        {
          key: 'actions',
          header: '',
          className: 'w-16 text-right',
          render: (doc) => (
            <Link
              href={`/admin/documents/${doc.id}`}
              className="text-sm text-amber-600 hover:underline"
            >
              Éditer
            </Link>
          ),
        },
      ]}
    />
  )
}
