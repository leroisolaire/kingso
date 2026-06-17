'use client'

import { useRouter } from 'next/navigation'
import DocumentForm from '@/components/admin/DocumentForm'
import type { Document } from '@/types/document'
import type { Category } from '@/types/category'

export default function NewDocumentClient({ categories }: { categories: Category[] }) {
  const router = useRouter()

  const handleSubmit = async (data: Omit<Document, 'id' | 'createdAt' | 'updatedAt'>) => {
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
          categories={categories}
          onSubmit={handleSubmit}
          onCancel={() => router.push('/admin/documents')}
        />
      </div>
    </div>
  )
}
