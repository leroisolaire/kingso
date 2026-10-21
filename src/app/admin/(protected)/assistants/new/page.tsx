import type { Metadata } from 'next'
import AssistantEditor from '@/components/admin/AssistantEditor'
import { getAllCategories } from '@/lib/db/queries/categories'
import { db } from '@/lib/db/client'

export const metadata: Metadata = { title: 'Nouveau chat | Admin' }

export default async function NewAssistantPage() {
  const [categories, webSources] = await Promise.all([
    getAllCategories(),
    db.webSource.findMany({ select: { id: true, name: true, url: true }, orderBy: { name: 'asc' } }),
  ])
  return <AssistantEditor categories={categories} webSources={webSources} />
}
