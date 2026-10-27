import type { Metadata } from 'next'
import Link from 'next/link'
import { after } from 'next/server'
import { getCurrentUser } from '@/lib/auth/dal'
import { savTabsFor } from '@/lib/auth/permissions'
import { db } from '@/lib/db/client'
import { checkMailboxIfStale } from '@/lib/sav/gmail'
import { formatPhone } from '@/lib/sav/phone'
import { formatParisDate } from '@/lib/sav/schedule'
import { getSavSettings } from '@/lib/sav/settings'
import { CATEGORY_COLORS, CATEGORY_LABELS, SAV_TABS } from '@/lib/sav/status'
import { refreshSavTimers } from '@/lib/sav/timers'
import NewCaseForm from './NewCaseForm'
import StatusSelect from './StatusSelect'

export const metadata: Metadata = { title: 'Espace SAV | Admin' }

function emailState(c: { email: string | null; emailTemplate: string | null; emailSentAt: Date | null; emailError: string | null }) {
  if (c.emailError && !c.emailSentAt) return { label: 'Erreur d\'envoi', cls: 'text-red-600' }
  if (c.emailSentAt) return c.emailSentAt > new Date()
    ? { label: `Programmé ${formatParisDate(c.emailSentAt, true)}`, cls: 'text-sky-700' }
    : { label: 'Email envoyé', cls: 'text-green-700' }
  if (c.emailTemplate && c.email) return { label: 'Email à valider', cls: 'text-amber-700 font-semibold' }
  if (!c.email) return { label: 'Pas d\'email', cls: 'font-medium text-gray-500' }
  return { label: '', cls: '' }
}

export default async function SavPage({ searchParams }: { searchParams: Promise<{ onglet?: string }> }) {
  // Passages automatiques en « À rappeler » (pas de clic, pas de nouvelles) avant d'afficher les listes
  await refreshSavTimers().catch(() => 0)
  // Nouveaux messages du répondeur dans la boîte kingso@ (s'ils n'ont pas déjà été relevés par la notification Gmail)
  after(() => checkMailboxIfStale().catch(() => null))
  const { onglet } = await searchParams
  const user = await getCurrentUser()
  const isSuperAdmin = user.roles.includes('SUPER_ADMIN')
  // Le Planning ne voit que les interventions à planifier et planifiées
  const allowedTabs = savTabsFor(user.roles)
  const tabs = allowedTabs ? SAV_TABS.filter((t) => allowedTabs.includes(t.key)) : SAV_TABS
  const canHandleCalls = !allowedTabs
  const tab = tabs.find((t) => t.key === onglet) ?? tabs[0]
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
        {isSuperAdmin && (
          <Link href="/admin/sav/reglages" className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
            Réglages et modèles d&apos;email
          </Link>
        )}
      </div>

      {settings.paused && canHandleCalls && (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Les envois d&apos;emails sont <strong>en pause</strong> : les dossiers sont créés et les emails préparés, mais rien ne part.
          {isSuperAdmin && <>{' '}<Link href="/admin/sav/reglages" className="underline">Activer les envois</Link></>}
        </p>
      )}

      {canHandleCalls && <NewCaseForm />}

      <nav className="flex gap-1 overflow-x-auto border-b border-gray-200">
        {tabs.map((t) => {
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
              <li key={c.id} className="flex flex-col hover:bg-gray-50 sm:flex-row sm:items-start">
                <Link href={`/admin/sav/${c.id}`} className="flex min-w-0 flex-1 flex-col gap-1.5 px-4 pt-3 sm:flex-row sm:items-start sm:gap-4 sm:pb-3">
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
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                      <span className={`rounded-md px-2 py-0.5 font-semibold ring-1 ${CATEGORY_COLORS[c.category]}`}>{CATEGORY_LABELS[c.category]}</span>
                      {!c.clientId && c.source !== 'CHAT' && (
                        <span className="rounded-md bg-yellow-100 px-2 py-0.5 font-semibold text-yellow-900 ring-1 ring-yellow-400">Client non identifié</span>
                      )}
                      {c.urgent && c.urgentReason && <span className="font-medium text-red-700">⚠ {c.urgentReason}</span>}
                    </div>
                  </div>
                </Link>
                {/* En dehors du lien : changer le statut sans ouvrir le dossier */}
                <div className="flex shrink-0 flex-row items-center gap-3 px-4 pb-3 pt-1.5 text-xs sm:flex-col sm:items-end sm:gap-1 sm:pl-0 sm:pt-3">
                  <StatusSelect caseId={c.id} status={c.status} />
                  {mail.label && <span className={mail.cls}>{mail.label}</span>}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
