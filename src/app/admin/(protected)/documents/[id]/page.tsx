import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import DocumentEditClient from './DocumentEditClient'
import { getDocumentById } from '@/lib/db/queries/documents'
import { getAllCategories } from '@/lib/db/queries/categories'
import { getAssistantsUsingCategory } from '@/lib/db/queries/assistants'

export const metadata: Metadata = { title: 'Éditer un document | Admin' }

interface Props {
  params: Promise<{ id: string }>
}

export default async function DocumentEditPage({ params }: Props) {
  const { id } = await params
  const [document, categories] = await Promise.all([
    getDocumentById(id),
    getAllCategories(),
  ])

  if (!document) notFound()

  const usedBy = await getAssistantsUsingCategory(document.categoryId, document.type)

  return (
    <>
      <p className="mx-auto mb-4 max-w-2xl rounded-lg bg-white px-4 py-2.5 text-sm text-gray-600 ring-1 ring-gray-200">
        <span className="font-medium text-gray-900">Utilisé par : </span>
        {usedBy.length > 0
          ? usedBy.map((a, i) => (
              <span key={a.id}>
                {i > 0 && ', '}
                <Link href={`/admin/assistants/${a.id}`} className="text-amber-600 hover:underline">{a.name}</Link>
              </span>
            ))
          : 'aucun chat (vérifiez la catégorie et la visibilité)'}
      </p>
      <DocumentEditClient document={document} categories={categories} />
    </>
  )
}
