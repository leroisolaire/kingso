import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import DocumentEditClient from './DocumentEditClient'
import { getDocumentById } from '@/lib/db/queries/documents'
import { getAllCategories } from '@/lib/db/queries/categories'

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

  return <DocumentEditClient document={document} categories={categories} />
}
