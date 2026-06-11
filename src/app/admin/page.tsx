import type { Metadata } from 'next'
import StatsCard from '@/components/admin/StatsCard'
import { getAllDocuments } from '@/lib/db/queries/documents'
import { getAllCategories } from '@/lib/db/queries/categories'
import { getAllFaqs } from '@/lib/db/queries/faq'
import { getAllHistory } from '@/lib/db/queries/history'

export const metadata: Metadata = { title: 'Tableau de bord | Admin' }

export default async function AdminDashboardPage() {
  const [documents, categories, faqs, history] = await Promise.all([
    getAllDocuments(),
    getAllCategories(),
    getAllFaqs(),
    getAllHistory(),
  ])

  const stats = [
    { label: 'Documents', value: documents.length, icon: '📄', trend: `${documents.filter((d) => d.type === 'PUBLIC').length} publics` },
    { label: 'Catégories', value: categories.length, icon: '⊟' },
    { label: 'FAQ', value: faqs.length, icon: '?', trend: `${faqs.filter((f) => f.published).length} publiées` },
    { label: 'Conversations', value: history.length, icon: '⊙', trend: 'ce mois' },
  ]

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Tableau de bord</h1>
        <p className="mt-1 text-sm text-gray-500">Vue d&apos;ensemble de la plateforme Kingso</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <StatsCard key={s.label} {...s} />
        ))}
      </div>

      <div className="mt-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-semibold text-gray-900">Dernières conversations</h2>
        <div className="space-y-3">
          {history.slice(0, 3).map((entry) => (
            <div key={entry.id} className="flex items-start gap-3 rounded-lg bg-gray-50 p-3">
              <span className="mt-0.5 text-base">💬</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900">{entry.userMessage}</p>
                <p className="truncate text-xs text-gray-500">{entry.assistantMessage}</p>
              </div>
              <span className="shrink-0 text-xs text-gray-400">
                {new Date(entry.createdAt).toLocaleDateString('fr-FR')}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
