import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import AssistantEditor from '@/components/admin/AssistantEditor'
import { getAssistantById } from '@/lib/db/queries/assistants'
import { getAllCategories } from '@/lib/db/queries/categories'
import { db } from '@/lib/db/client'

export const metadata: Metadata = { title: 'Modifier un chat | Admin' }

interface Props {
  params: Promise<{ id: string }>
}

export default async function EditAssistantPage({ params }: Props) {
  const { id } = await params
  const [assistant, categories, webSources] = await Promise.all([
    getAssistantById(id),
    getAllCategories(),
    db.webSource.findMany({ select: { id: true, name: true, url: true }, orderBy: { name: 'asc' } }),
  ])
  if (!assistant) notFound()

  return <AssistantEditor assistant={assistant} categories={categories} webSources={webSources} />
}
