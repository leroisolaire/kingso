import type { Metadata } from 'next'
import Link from 'next/link'
import { db } from '@/lib/db/client'
import { formatPhone } from '@/lib/sav/phone'
import { formatParisDate } from '@/lib/sav/schedule'
import { getSavSettings } from '@/lib/sav/settings'
import { CATEGORY_LABELS, SAV_TABS, STATUS_COLORS, STATUS_LABELS } from '@/lib/sav/status'
import { refreshSavTimers } from '@/lib/sav/timers'
import NewCaseForm from './NewCaseForm'

export const metadata: Metadata = { title: 'Espace SAV | Admin' }

function emailState(c: { email: string | null; emailTemplate: string | null; emailSentAt: Date | null; emailError: string | null }) {
  if (c.emailError && !c.emailSentAt) return { label: 'Erreur d\'envoi', cls: 'text-red-600' }
  if (c.emailSentAt) return c.emailSentAt > new Date()
    ? { label: `Programmé ${formatParisDate(c.emailSentAt, true)}`, cls: 'text-sky-700' }
    : { label: 'Email envoyé', cls: 'text-green-700' }
  if (c.emailTemplate && c.email) return { label: 'Email à valider', cls: 'text-amber-700 font-semibold' }
  if (!c.email) return { label: 'Pas d\'email', cls: 'text-gray-400' }
  return { label: '', cls: '' }
}

export default async function SavPage({ searchParams }: { searchParams: Promise<{ onglet?: string }> }) {
  // Passages automatiques en « À rappeler » (pas de clic, pas de nouvelles) avant d'afficher les listes
  await refreshSavTimers().catch(() => 0)
  const { onglet } = await searchParams
  const tab = SAV_TABS.find((t) => t.key === onglet) ?? SAV_TABS[0]
  const done = tab.statuses.some((s) => s === 'RESOLVED' || s === 'CLOSED')

  const [counts, cases, settings] = await Promise.all([
    db.savCase.groupBy({ by: ['status'], _count: true }),
    db.savCase.findMany({
      where: { status: { in: tab.statuses } },
      // Files de travail : urgents d'abord, puis les plus anciens ; dossiers terminés : les plus récents
      orderBy: done ? [{ updatedAt: 'desc' }] : [{ urgent: 'desc' }, { receivedAt: 'asc' }],
      take: 200,
      include: { _count: { select: { messages: true } } },
    }),
    getSavSettings(),
  ])
  const countFor = (statuses: string[]) => counts.filter((c) => statuses.includes(c.status)).reduce((n, c) => n + c._count, 0)

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Espace SAV</h1>
          <p className="mt-1 text-sm text-gray-500">
            Messages du répondeur et demandes des chats : Kingso les lit, les trie, prépare l&apos;email au client et propose de le dépanner.
          </p>
        </div>
        <Link href="/admin/sav/reglages" className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
          Réglages et modèles d&apos;email
        </Link>
      </div>

      {settings.paused && (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Les envois d&apos;emails sont <strong>en pause</strong> : les dossiers sont créés et les emails préparés, mais rien ne part.{' '}
          <Link href="/admin/sav/reglages" className="underline">Activer les envois</Link>
        </p>
      )}

      <NewCaseForm />

      <nav className="flex gap-1 overflow-x-auto border-b border-gray-200">
        {SAV_TABS.map((t) => {
          const n = countFor(t.statuses)
          const active = t.key === tab.key
          return (
            <Link
              key={t.key}
              href={`/admin/sav?onglet=${t.key}`}
              className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm ${active ? 'border-amber-500 font-semibold text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
            >
              {t.label}
              {n > 0 && <span className="ml-1.5 rounded-full bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">{n}</span>}
            </Link>
          )
        })}
      </nav>

      {cases.length === 0 ? (
        <p className="py-10 text-center text-sm text-gray-400">Aucun dossier ici.</p>
      ) : (
        <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
          {cases.map((c) => {
            const mail = emailState(c)
            return (
              <li key={c.id}>
                <Link href={`/admin/sav/${c.id}`} className="flex flex-col gap-1.5 px-4 py-3 hover:bg-gray-50 sm:flex-row sm:items-start sm:gap-4">
                  <div className="w-28 shrink-0 text-xs text-gray-400">
                    <span className="font-semibold text-gray-700">n° {c.number}</span>
                    <br />
                    {formatParisDate(c.receivedAt, true)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {c.urgent && <span className="rounded bg-red-600 px-1.5 py-0.5 text-xs font-bold text-white">URGENT</span>}
                      <span className="font-medium text-gray-900">{c.customerName || formatPhone(c.phoneKey) || 'Client inconnu'}</span>
                      {c.city && <span className="text-sm text-gray-500">· {c.city}</span>}
                      {c._count.messages > 1 && <span className="text-xs text-orange-700">{c._count.messages} messages</span>}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-sm text-gray-600">{c.summary}</p>
                    <p className="mt-1 text-xs text-gray-400">
                      {CATEGORY_LABELS[c.category]}
                      {c.urgentReason && c.urgent ? ` · ${c.urgentReason}` : ''}
                      {!c.clientId && c.source !== 'CHAT' ? ' · client non identifié' : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-row gap-3 text-xs sm:flex-col sm:items-end sm:gap-1">
                    <span className={`rounded-full px-2 py-0.5 ${STATUS_COLORS[c.status]}`}>{STATUS_LABELS[c.status]}</span>
                    {mail.label && <span className={mail.cls}>{mail.label}</span>}
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
