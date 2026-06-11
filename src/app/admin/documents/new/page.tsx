'use client'

import { useRouter } from 'next/navigation'
import DocumentForm from '@/components/admin/DocumentForm'
import { MOCK_CATEGORIES } from '@/lib/db/fixtures'
import type { Document } from '@/types/document'

export default function NewDocumentPage() {
  const router = useRouter()

  const handleSubmit = async (data: Omit<Document, 'id' | 'createdAt' | 'updatedAt'>) => {
    // TODO: Appeler POST /api/documents avec les données
    await fetch('/api/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    router.push('/admin/documents')
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Nouveau document</h1>
        <p className="mt-1 text-sm text-gray-500">Ajoutez un document à la base de connaissances Kingso.</p>
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <DocumentForm
          categories={MOCK_CATEGORIES}
          onSubmit={handleSubmit}
          onCancel={() => router.push('/admin/documents')}
        />
      </div>
    </div>
  )
}
