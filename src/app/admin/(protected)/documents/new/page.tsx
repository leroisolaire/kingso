import { getAllCategories } from '@/lib/db/queries/categories'
import NewDocumentClient from './NewDocumentClient'

export default async function NewDocumentPage() {
  const categories = await getAllCategories()
  return <NewDocumentClient categories={categories} />
}
