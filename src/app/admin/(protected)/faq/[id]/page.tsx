import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import FaqEditClient from './FaqEditClient'
import { getFaqById } from '@/lib/db/queries/faq'
import { getAllCategories } from '@/lib/db/queries/categories'

export const metadata: Metadata = { title: 'Éditer une FAQ | Admin' }

interface Props {
  params: Promise<{ id: string }>
}

export default async function FaqEditPage({ params }: Props) {
  const { id } = await params
  const [faq, categories] = await Promise.all([
    getFaqById(id),
    getAllCategories(),
  ])

  if (!faq) notFound()

  return <FaqEditClient faq={faq} categories={categories} />
}
