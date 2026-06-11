import type { Metadata } from 'next'
import Link from 'next/link'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import { getAllFaqs } from '@/lib/db/queries/faq'

export const metadata: Metadata = { title: 'FAQ | Admin' }

export default async function AdminFaqPage() {
  const faqs = await getAllFaqs()

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">FAQ</h1>
          <p className="mt-1 text-sm text-gray-500">{faqs.length} question(s)</p>
        </div>
        <Link href="/admin/faq/new">
          <Button>+ Ajouter</Button>
        </Link>
      </div>

      <div className="space-y-2">
        {faqs.map((faq) => (
          <div
            key={faq.id}
            className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
          >
            <div className="flex-1 min-w-0">
              <p className="truncate font-medium text-gray-900">{faq.question}</p>
              <p className="mt-0.5 truncate text-sm text-gray-500">{faq.answer}</p>
            </div>
            <Badge variant={faq.published ? 'published' : 'draft'}>
              {faq.published ? 'Publié' : 'Brouillon'}
            </Badge>
            <Link
              href={`/admin/faq/${faq.id}`}
              className="shrink-0 text-sm text-amber-600 hover:underline"
            >
              Éditer
            </Link>
          </div>
        ))}
      </div>
    </div>
  )
}
