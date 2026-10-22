import type { Metadata } from 'next'
import Link from 'next/link'
import type { Prisma } from '@prisma/client'
import ReviewButton from './ReviewButton'
import { db } from '@/lib/db/client'
import { getRatingStats } from '@/lib/db/queries/history'

export const metadata: Metadata = { title: 'À améliorer | Admin' }

type Tab = 'unanswered' | 'negative'

interface Props {
  searchParams: Promise<{ tab?: string; show?: string }>
}

export default async function QualityPage({ searchParams }: Props) {
  const params = await searchParams
  const tab: Tab = params.tab === 'negative' ? 'negative' : 'unanswered'
  const showAll = params.show === 'all'

  const tabWhere: Record<Tab, Prisma.HistoryWhereInput> = {
    unanswered: { unanswered: true },
    negative: { rating: -1 },
  }
  const [entries, openUnanswered, openNegative, { up: thumbsUp, down: thumbsDown }] = await Promise.all([
    db.history.findMany({
      where: { ...tabWhere[tab], ...(showAll ? {} : { reviewedAt: null }) },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { assistant: { select: { name: true } } },
    }),
    db.history.count({ where: { unanswered: true, reviewedAt: null } }),
    db.history.count({ where: { rating: -1, reviewedAt: null } }),
    getRatingStats(30),
  ])

  const tabLink = (t: Tab, label: string, count: number) => (
    <Link
      href={`/admin/quality?tab=${t}${showAll ? '&show=all' : ''}`}
      className={`rounded-full px-4 py-1.5 text-sm ${tab === t ? 'bg-slate-900 text-white' : 'bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50'}`}
    >
      {label} {count > 0 && <span className={`ml-1 rounded-full px-1.5 text-xs ${tab === t ? 'bg-white/20' : 'bg-red-100 text-red-700'}`}>{count}</span>}
    </Link>
  )

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">À améliorer</h1>
        <p className="mt-1 text-sm text-gray-500">
          Les questions auxquelles Kingso n&apos;a pas trouvé de réponse dans la documentation, et les réponses jugées pas utiles par les clients.
          Complétez la documentation (Drive) ou les consignes du chat, puis marquez l&apos;échange comme traité.
        </p>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-2xl font-bold text-gray-900">{openUnanswered}</p>
          <p className="text-sm text-gray-500">question(s) sans réponse à traiter</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-2xl font-bold text-gray-900">{openNegative}</p>
          <p className="text-sm text-gray-500">réponse(s) 👎 à traiter</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-2xl font-bold text-gray-900">
            {thumbsUp + thumbsDown > 0 ? `${Math.round((thumbsUp / (thumbsUp + thumbsDown)) * 100)} %` : '—'}
          </p>
          <p className="text-sm text-gray-500">de réponses utiles sur 30 jours ({thumbsUp} 👍 · {thumbsDown} 👎)</p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {tabLink('unanswered', 'Questions sans réponse', openUnanswered)}
        {tabLink('negative', 'Réponses notées 👎', openNegative)}
        <Link href={`/admin/quality?tab=${tab}${showAll ? '' : '&show=all'}`} className="ml-auto text-sm text-amber-600 hover:underline">
          {showAll ? 'Masquer les échanges traités' : 'Afficher aussi les échanges traités'}
        </Link>
      </div>

      {entries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-gray-500">
          {tab === 'unanswered' ? 'Aucune question sans réponse à traiter. 🎉' : 'Aucune réponse notée 👎 à traiter. 🎉'}
        </div>
      ) : (
        <ul className="space-y-3">
          {entries.map((e) => (
            <li key={e.id} className={`rounded-xl border bg-white p-4 shadow-sm ${e.reviewedAt ? 'border-gray-100 opacity-60' : 'border-gray-200'}`}>
              <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400">
                <span>{e.createdAt.toLocaleString('fr-FR')}</span>
                <span>{e.assistant?.name ?? 'Assistant général'}</span>
                {e.rating === -1 && <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-700">👎</span>}
                {e.unanswered && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">sans réponse</span>}
                {e.reviewedAt && <span className="text-green-700">✓ traité le {e.reviewedAt.toLocaleDateString('fr-FR')}</span>}
              </div>
              <p className="whitespace-pre-wrap font-medium text-gray-900">{e.userMessage}</p>
              <details className="mt-2">
                <summary className="cursor-pointer text-sm text-gray-500">Réponse de Kingso</summary>
                <p className="mt-2 whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-sm text-gray-700">{e.assistantMessage}</p>
              </details>
              <div className="mt-3 flex items-center justify-between gap-3">
                <Link href={`/admin/history/${encodeURIComponent(e.sessionToken)}`} className="text-sm text-amber-600 hover:underline">
                  Voir la conversation
                </Link>
                <ReviewButton historyId={e.id} reviewed={Boolean(e.reviewedAt)} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
