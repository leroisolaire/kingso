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
          className: 'w-32 text-right',
          render: (doc) => (
            <div className="flex items-center justify-end gap-3">
              {doc.fileUrl && (
                <a
                  href={doc.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-gray-400 hover:text-amber-600"
                  title="Voir le fichier original"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                </a>
              )}
              <Link href={`/admin/documents/${doc.id}`} className="text-sm text-amber-600 hover:underline">
                Éditer
              </Link>
            </div>
          ),
        },
      ]}
    />
  )
}
