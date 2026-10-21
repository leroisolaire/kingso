import type { Metadata } from 'next'
import ImportClient from './ImportClient'
import { getAllCategories } from '@/lib/db/queries/categories'

export const metadata: Metadata = { title: 'Importer des documents | Admin' }

export default async function ImportDocumentsPage() {
  const categories = await getAllCategories()
  return <ImportClient initialCategories={categories} />
}
