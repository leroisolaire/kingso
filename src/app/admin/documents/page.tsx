import type { Metadata } from 'next'
import Link from 'next/link'
import DocumentTable from '@/components/admin/DocumentTable'
import Button from '@/components/ui/Button'
import { getAllDocuments } from '@/lib/db/queries/documents'

export const metadata: Metadata = { title: 'Documents | Admin' }

export default async function DocumentsPage() {
  const documents = await getAllDocuments()

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Documents</h1>
          <p className="mt-1 text-sm text-gray-500">{documents.length} document(s) dans la base</p>
        </div>
        <Link href="/admin/documents/new">
          <Button>+ Ajouter</Button>
        </Link>
      </div>

      <DocumentTable documents={documents} />
    </div>
  )
}
