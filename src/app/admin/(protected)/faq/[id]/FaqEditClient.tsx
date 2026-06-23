'use client'

import { useRouter } from 'next/navigation'
import FaqForm from '@/components/admin/FaqForm'
import type { Faq } from '@/types/faq'
import type { Category } from '@/types/category'

interface Props {
  faq: Faq
  categories: Category[]
}

export default function FaqEditClient({ faq, categories }: Props) {
  const router = useRouter()

  const handleSubmit = async (data: Omit<Faq, 'id' | 'createdAt' | 'updatedAt'>) => {
    // TODO: PUT /api/faq/[id]
    await fetch(`/api/faq/${faq.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    router.push('/admin/faq')
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Éditer la question</h1>
        <p className="mt-1 truncate text-sm text-gray-500">{faq.question}</p>
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <FaqForm
          faq={faq}
          categories={categories}
          onSubmit={handleSubmit}
          onCancel={() => router.push('/admin/faq')}
        />
      </div>
    </div>
  )
}
