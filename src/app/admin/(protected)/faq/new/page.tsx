import { getAllCategories } from '@/lib/db/queries/categories'
import NewFaqClient from './NewFaqClient'

export default async function NewFaqPage() {
  const categories = await getAllCategories()
  return <NewFaqClient categories={categories} />
}
