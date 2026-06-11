'use client'

import { useRouter } from 'next/navigation'
import FaqForm from '@/components/admin/FaqForm'
import { MOCK_CATEGORIES } from '@/lib/db/fixtures'
import type { Faq } from '@/types/faq'

export default function NewFaqPage() {
  const router = useRouter()

  const handleSubmit = async (data: Omit<Faq, 'id' | 'createdAt' | 'updatedAt'>) => {
    // TODO: POST /api/faq
    await fetch('/api/faq', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    router.push('/admin/faq')
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Nouvelle question FAQ</h1>
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <FaqForm
          categories={MOCK_CATEGORIES}
          onSubmit={handleSubmit}
          onCancel={() => router.push('/admin/faq')}
        />
      </div>
    </div>
  )
}
