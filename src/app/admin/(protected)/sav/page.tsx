import type { Metadata } from 'next'
import Link from 'next/link'
import { after } from 'next/server'
import { getCurrentUser } from '@/lib/auth/dal'
import { canAccess, savTabsFor } from '@/lib/auth/permissions'
import { db } from '@/lib/db/client'
import { defaultDuration, isCalendarConnected } from '@/lib/sav/calendar'
import { checkMailboxIfStale } from '@/lib/sav/gmail'
import { formatPhone } from '@/lib/sav/phone'
import { formatAppointment, formatParisDate } from '@/lib/sav/schedule'
import { getSavSettings } from '@/lib/sav/settings'
import { CATEGORY_COLORS, CATEGORY_LABELS, SAV_TABS, SOURCE_LABELS } from '@/lib/sav/status'
import { CHAT_REQUEST_WHERE } from '@/lib/sav/chatRequests'
import { ratingShort } from '@/lib/sav/rating'
import { kingsoPresence, PRESENCE_STYLES } from '@/lib/sav/presence'
import { refreshSavTimers } from '@/lib/sav/timers'
import { savSearchWhere } from '@/lib/sav/search'
import AutoRefresh from './AutoRefresh'
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

/** Photos du dossier (client et technicien) : repère dans la liste. */
const photoCount = (c: { techPhotos: string[]; messages: { photos: string[] }[] }) =>
  c.techPhotos.length + c.messages.reduce((n, m) => n + m.photos.length, 0)

export default async function SavPage({ searchParams }: { searchParams: Promise<{ onglet?: string; q?: string; origine?: string }> }) {
  // Passages automatiques en « À rappeler » (pas de clic, pas de nouvelles) avant d'afficher les listes
  await refreshSavTimers().catch(() => 0)
  // Nouveaux messages du répondeur dans la boîte kingso@ (s'ils n'ont pas déjà été relevés par la notification Gmail)
  after(() => checkMailboxIfStale().catch(() => null))
  const { onglet, q: rawQuery, origine } = await searchParams
  const query = (rawQuery ?? '').trim().slice(0, 100)
  const search = query ? savSearchWhere(query) : null
  const user = await getCurrentUser()
  const isSuperAdmin = user.roles.includes('SUPER_ADMIN')
  // Le Planning ne voit que les interventions à planifier et planifiées
  const allowedTabs = savTabsFor(user.roles)
  const tabs = allowedTabs ? SAV_TABS.filter((t) => allowedTabs.includes(t.key)) : SAV_TABS
  const canHandleCalls = !allowedTabs
  const tab = tabs.find((t) => t.key === onglet) ?? tabs[0]
  const done = tab.statuses.some((s) => s === 'RESOLVED' || s === 'CLOSED')
  // Recherche : dans tous les dossiers visibles par l'utilisateur, quel que soit l'onglet
  const visibleStatuses = [...new Set(tabs.flatMap((t) => t.statuses))]
  // Filtre « Demandes des chats » (formulaire « Transmettre au SAV »), combiné aux onglets
  const chatOnly = origine === 'chat' && !search
  const originWhere = chatOnly ? CHAT_REQUEST_WHERE : {}
  const tabHref = (key: string, chat = chatOnly) => `/admin/sav?onglet=${key}${chat ? '&origine=chat' : ''}`

  const [counts, chatCount, cases, settings, calendarConnected, defaultMinutes] = await Promise.all([
    db.savCase.groupBy({ by: ['status'], where: originWhere, _count: true }),
    db.savCase.count({ where: { AND: [CHAT_REQUEST_WHERE, { status: { in: visibleStatuses } }] } }),
    db.savCase.findMany({
      where: search ? { AND: [{ status: { in: visibleStatuses } }, search] } : { AND: [{ status: { in: tab.statuses } }, originWhere] },
      // Files de travail : les plus urgents d'abord (note de 1 à 5), puis les plus anciens ; dossiers terminés et recherche : les plus récents
      // Onglet « Planifiés » : par date de rendez-vous (dossiers sans date en tête, à compléter)
      orderBy: search ? [{ receivedAt: 'desc' }]
        : done ? [{ updatedAt: 'desc' }]
        : tab.statuses.every((s) => s === 'SCHEDULED' || s === 'TECH_REPORT') ? [{ appointmentAt: { sort: 'asc', nulls: 'first' } }]
        : [{ urgency: { sort: 'desc', nulls: 'last' } }, { urgent: 'desc' }, { receivedAt: 'asc' }],
      take: search ? 100 : 200,
      include: { _count: { select: { messages: true } }, technician: { select: { name: true } }, messages: { select: { photos: true } } },
    }),
    getSavSettings(),
    isCalendarConnected().catch(() => false),
    defaultDuration().catch(() => 120),
  ])
  const countFor = (statuses: string[]) => counts.filter((c) => statuses.includes(c.status)).reduce((n, c) => n + c._count, 0)

  // Échanges avec Kingso : nombre de messages par conversation, et dossiers résolus par le client lui-même
  const tokens = cases.map((c) => c.chatSessionToken).filter((t): t is string => Boolean(t))
  const [messageCounts, resolvedEvents] = await Promise.all([
    tokens.length ? db.history.groupBy({ by: ['sessionToken'], where: { sessionToken: { in: tokens } }, _count: true }) : Promise.resolve([]),
    db.savEvent.findMany({ where: { caseId: { in: cases.map((c) => c.id) }, kind: 'RESOLVED_BY_CLIENT' }, select: { caseId: true } }),
  ])
  const presenceOf = new Map(cases.map((c) => [c.id, kingsoPresence({
    lastSeenAt: c.lastSeenAt,
    linkOpenedAt: c.linkOpenedAt,
    messages: messageCounts.find((m) => m.sessionToken === c.chatSessionToken)?._count ?? 0,
    resolvedByClient: c.status === 'RESOLVED' && resolvedEvents.some((e) => e.caseId === c.id),
  })]))
  // Clients en ligne en tête de liste
  const sorted = [...cases].sort((a, b) => Number(presenceOf.get(b.id)?.tone === 'online') - Number(presenceOf.get(a.id)?.tone === 'online'))

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <AutoRefresh />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Espace SAV</h1>
          <p className="mt-1 text-sm text-gray-500">
            Messages du répondeur et demandes des chats : Kingso les lit, les trie, prépare l&apos;email au client et propose de le dépanner.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
        <Link href="/admin/sav/planning" className="rounded-lg bg-sky-700 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-800">
          📅 Planning
        </Link>
        {canAccess(user.roles, '/admin/sav/intervenants') && (
          <Link href="/admin/sav/intervenants" className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
            ⚒ Intervenants
          </Link>
        )}
        {isSuperAdmin && (
          <Link href="/admin/sav/reglages" className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
            Réglages et modèles d&apos;email
          </Link>
        )}
        </div>
      </div>

      {settings.paused && canHandleCalls && (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Les envois d&apos;emails sont <strong>en pause</strong> : les dossiers sont créés et les emails préparés, mais rien ne part.
          {isSuperAdmin && <>{' '}<Link href="/admin/sav/reglages" className="underline">Activer les envois</Link></>}
        </p>
      )}

      {canHandleCalls && <NewCaseForm />}

      <form action="/admin/sav" className="flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Rechercher : nom, commune, téléphone, n° de dossier, email, code erreur…"
          className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
        />
        <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">Rechercher</button>
      </form>

      <nav className="flex gap-1 overflow-x-auto border-b border-gray-200">
        {tabs.map((t) => {
          const n = countFor(t.statuses)
          const active = !search && t.key === tab.key
          return (
            <Link
              key={t.key}
              href={tabHref(t.key)}
              className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm ${active ? 'border-amber-500 font-semibold text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
            >
              {t.label}
              {n > 0 && <span className="ml-1.5 rounded-full bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">{n}</span>}
            </Link>
          )
        })}
      </nav>

      {!search && chatCount > 0 && (
        <div className="flex flex-wrap gap-2 text-sm">
          <Link href={tabHref(tab.key, false)} className={`rounded-full px-3 py-1 ring-1 ${!chatOnly ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-gray-600 ring-gray-300 hover:bg-gray-50'}`}>
            Tous les dossiers
          </Link>
          <Link href={tabHref(tab.key, true)} className={`rounded-full px-3 py-1 ring-1 ${chatOnly ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-gray-600 ring-gray-300 hover:bg-gray-50'}`}>
            💬 Demandes des chats <span className="opacity-70">({chatCount})</span>
          </Link>
        </div>
      )}

      {search && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <p className="text-gray-700">
            {cases.length === 0 ? 'Aucun dossier' : `${cases.length}${cases.length === 100 ? '+' : ''} dossier${cases.length > 1 ? 's' : ''}`} pour « <strong>{query}</strong> », tous statuts confondus
          </p>
          <Link href={tabHref(tab.key)} className="text-amber-700 hover:underline">Effacer la recherche</Link>
        </div>
      )}

      {cases.length === 0 ? (
        !search && <p className="py-10 text-center text-sm text-gray-400">Aucun dossier ici.</p>
      ) : (
        <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
          {sorted.map((c) => {
            const mail = emailState(c)
            const presence = presenceOf.get(c.id)
            return (
              <li key={c.id} className="flex flex-col hover:bg-gray-50 sm:flex-row sm:items-start">
                <Link href={search ? `/admin/sav/${c.id}?q=${encodeURIComponent(query)}` : `/admin/sav/${c.id}?depuis=${tab.key}`} className="flex min-w-0 flex-1 flex-col gap-1.5 px-4 pt-3 sm:flex-row sm:items-start sm:gap-4 sm:pb-3">
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
                    {c.status === 'SCHEDULED' && (
                      <p className={`mt-1 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm font-semibold ring-1 ${c.appointmentAt ? 'bg-sky-50 text-sky-900 ring-sky-300' : 'bg-red-50 text-red-700 ring-red-300'}`}>
                        <span aria-hidden="true">📅</span>
                        {c.appointmentAt ? `Intervention ${formatAppointment(c.appointmentAt, c.appointmentMinutes ?? defaultMinutes)}` : 'Planifié sans date : saisissez la date du rendez-vous'}
                        {c.planningEventId && <span className="font-medium text-green-700">· ✓ au planning</span>}
                        {c.technician && <span className="font-medium text-gray-700">· 👷 {c.technician.name}</span>}
                      </p>
                    )}
                    {c.status === 'TECH_REPORT' && (
                      <p className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-orange-100 px-2.5 py-1 text-sm font-semibold text-orange-900 ring-1 ring-orange-300">
                        <span aria-hidden="true">🛠</span>
                        Retour technicien attendu{c.appointmentAt ? ` — intervention du ${formatAppointment(c.appointmentAt)}` : ''}
                        {c.technician && <span className="font-medium">· 👷 {c.technician.name}</span>}
                      </p>
                    )}
                    {c.techOutcome === 'QUOTE' && c.status === 'TO_CALL' && (
                      <p className="mt-1 inline-flex rounded-lg bg-amber-50 px-2.5 py-1 text-sm font-semibold text-amber-900 ring-1 ring-amber-300">📄 Devis à faire</p>
                    )}
                    {c.techOutcome === 'REVISIT' && c.status === 'TO_SCHEDULE' && (
                      <p className="mt-1 inline-flex rounded-lg bg-purple-50 px-2.5 py-1 text-sm font-semibold text-purple-900 ring-1 ring-purple-300">🔁 À repasser</p>
                    )}
                    {c.techOutcome === 'ABSENT' && c.status === 'TO_CALL' && (
                      <p className="mt-1 inline-flex rounded-lg bg-orange-50 px-2.5 py-1 text-sm font-semibold text-orange-900 ring-1 ring-orange-300">🚪 Client absent à l&apos;intervention</p>
                    )}
                    <p className="mt-0.5 line-clamp-2 text-sm text-gray-600">{c.summary}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                      <span className={`rounded-md px-2 py-0.5 font-semibold ring-1 ${CATEGORY_COLORS[c.category]}`}>{CATEGORY_LABELS[c.category]}</span>
                      <span className="rounded-md bg-gray-50 px-2 py-0.5 text-gray-600 ring-1 ring-gray-200">{SOURCE_LABELS[c.source]}</span>
                      {ratingShort(c.urgency, c.difficulty) && (
                        <span className="rounded-md bg-white px-2 py-0.5 font-medium text-gray-800 ring-1 ring-gray-300" title="Urgence · difficulté (sur 5)">{ratingShort(c.urgency, c.difficulty)}</span>
                      )}
                      {photoCount(c) > 0 && (
                        <span className="rounded-md bg-amber-50 px-2 py-0.5 font-medium text-amber-900 ring-1 ring-amber-300">📷 {photoCount(c)} photo{photoCount(c) > 1 ? 's' : ''}</span>
                      )}
                      {!c.clientId && c.source !== 'CHAT' && (
                        <span className="rounded-md bg-yellow-100 px-2 py-0.5 font-semibold text-yellow-900 ring-1 ring-yellow-400">Client non identifié</span>
                      )}
                      {presence && (
                        <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 font-medium ring-1 ${PRESENCE_STYLES[presence.tone].cls}`}>
                          <span className={`h-2 w-2 rounded-full ${PRESENCE_STYLES[presence.tone].dot}`} />
                          {presence.label}
                        </span>
                      )}
                      {c.urgent && c.urgentReason && <span className="font-medium text-red-700">⚠ {c.urgentReason}</span>}
                    </div>
                  </div>
                </Link>
                {/* En dehors du lien : changer le statut sans ouvrir le dossier */}
                <div className="flex shrink-0 flex-row items-center gap-3 px-4 pb-3 pt-1.5 text-xs sm:flex-col sm:items-end sm:gap-1 sm:pl-0 sm:pt-3">
                  <StatusSelect caseId={c.id} status={c.status} appointmentAt={c.appointmentAt?.toISOString() ?? null}
                    appointmentMinutes={c.appointmentMinutes} defaultMinutes={defaultMinutes}
                    canAddToPlanning={calendarConnected && c.status === 'SCHEDULED' && Boolean(c.appointmentAt) && !c.planningEventId} />
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
