'use client'

import { useRouter } from 'next/navigation'
import DocumentForm from '@/components/admin/DocumentForm'
import type { Document } from '@/types/document'
import type { Category } from '@/types/category'

interface Props {
  document: Document
  categories: Category[]
}

export default function DocumentEditClient({ document, categories }: Props) {
  const router = useRouter()

  const handleSubmit = async (data: Omit<Document, 'id' | 'createdAt' | 'updatedAt'>) => {
    // TODO: Appeler PUT /api/documents/[id]
    await fetch(`/api/documents/${document.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    router.push('/admin/documents')
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Éditer le document</h1>
        <p className="mt-1 truncate text-sm text-gray-500">{document.title}</p>
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <DocumentForm
          document={document}
          categories={categories}
          onSubmit={handleSubmit}
          onCancel={() => router.push('/admin/documents')}
        />
      </div>
    </div>
  )
}
