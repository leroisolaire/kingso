import type { Metadata } from 'next'
import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth/dal'
import { seesFullAgenda } from '@/lib/auth/permissions'
import { db } from '@/lib/db/client'
import { defaultDuration, isCalendarConnected, listAgendaEvents, type AgendaEvent } from '@/lib/sav/calendar'
import { formatPhone } from '@/lib/sav/phone'
import { parisParts, parisTime } from '@/lib/sav/schedule'
import { getTechnicians } from '@/lib/sav/technicians'
import { refreshSavTimers } from '@/lib/sav/timers'
import AutoRefresh from '../AutoRefresh'
import PlanningBoard, { type PlanningCase } from './PlanningBoard'

export const metadata: Metadata = { title: 'Planning SAV | Admin' }

const pad = (n: number) => String(n).padStart(2, '0')
const dayKey = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`

/** Lundi (date « calendrier », sans fuseau) de la semaine demandée, ou de la semaine en cours à Paris. */
function weekMonday(requested: string | undefined): Date {
  const m = requested && /^(\d{4})-(\d{2})-(\d{2})$/.exec(requested)
  const base = m
    ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
    : (() => { const p = parisParts(new Date()); return new Date(Date.UTC(p.year, p.month - 1, p.day)) })()
  const weekday = (base.getUTCDay() + 6) % 7 // lundi = 0
  return new Date(base.getTime() - weekday * 86_400_000)
}

export default async function PlanningPage({ searchParams }: { searchParams: Promise<{ semaine?: string }> }) {
  // Rendez-vous passés → « Retour technicien » avant d'afficher
  await refreshSavTimers().catch(() => 0)
  const { semaine } = await searchParams
  const monday = weekMonday(semaine)
  const days = Array.from({ length: 7 }, (_, i) => new Date(monday.getTime() + i * 86_400_000))
  const from = parisTime(monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate(), 0, 0)
  const end = days[6]
  const to = parisTime(end.getUTCFullYear(), end.getUTCMonth() + 1, end.getUTCDate(), 23, 59)
  const now = parisParts(new Date())
  const todayKey = `${now.year}-${pad(now.month)}-${pad(now.day)}`
  const user = await getCurrentUser()
  const full = seesFullAgenda(user.roles)

  const caseSelect = {
    id: true, number: true, status: true, customerName: true, phoneKey: true, callbackPhone: true, address: true, postalCode: true,
    city: true, summary: true, urgent: true, category: true, appointmentAt: true, appointmentMinutes: true, technicianId: true,
    planningEventId: true, equipment: true,
  } as const
  const [scheduled, toSchedule, technicians, minutes, connected] = await Promise.all([
    db.savCase.findMany({
      where: { appointmentAt: { gte: from, lte: to }, status: { in: ['SCHEDULED', 'TECH_REPORT', 'RESOLVED', 'CLOSED'] } },
      select: caseSelect,
      orderBy: { appointmentAt: 'asc' },
    }),
    db.savCase.findMany({
      where: { OR: [{ status: 'TO_SCHEDULE' }, { status: 'SCHEDULED', appointmentAt: null }] },
      select: caseSelect,
      orderBy: [{ urgent: 'desc' }, { receivedAt: 'asc' }],
      take: 100,
    }),
    getTechnicians(),
    defaultDuration().catch(() => 120),
    isCalendarConnected().catch(() => false),
  ])
  // Vue complète : les autres événements de l'agenda du planning (étiquettes, rendez-vous hors Kingso)
  let agenda: AgendaEvent[] = []
  let agendaError: string | null = null
  if (full && connected) {
    const refs = (await db.savCase.findMany({ where: { planningEventId: { not: null } }, select: { planningEventId: true } }))
      .map((c) => c.planningEventId!)
    agenda = await listAgendaEvents(from, to, refs).catch((e: unknown) => {
      agendaError = e instanceof Error ? e.message : String(e)
      return []
    })
  }

  const toCase = (c: (typeof scheduled)[number]): PlanningCase => ({
    id: c.id,
    number: c.number,
    status: c.status,
    name: c.customerName || formatPhone(c.phoneKey) || 'Client inconnu',
    phone: formatPhone(c.callbackPhone || c.phoneKey),
    place: [c.address, [c.postalCode, c.city].filter(Boolean).join(' ')].filter(Boolean).join(', '),
    city: c.city ?? '',
    summary: c.summary,
    equipment: c.equipment ?? '',
    urgent: c.urgent,
    start: c.appointmentAt?.toISOString() ?? null,
    minutes: c.appointmentMinutes ?? minutes,
    technicianId: c.technicianId,
    inAgenda: Boolean(c.planningEventId),
  })

  const weekLabel = `${days[0].toLocaleDateString('fr-FR', { timeZone: 'UTC', day: 'numeric', month: 'long' })} au ${days[6].toLocaleDateString('fr-FR', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' })}`
  const shift = (weeks: number) => dayKey(new Date(monday.getTime() + weeks * 7 * 86_400_000))

  return (
    <div className="mx-auto max-w-[96rem] space-y-4">
      <AutoRefresh />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Planning SAV</h1>
          <p className="mt-1 text-sm text-gray-500">
            {full
              ? 'Interventions SAV et autres événements de l’agenda du planning (en gris).'
              : 'Interventions SAV. Faites glisser un dossier à planifier sur un créneau, ou déplacez un rendez-vous.'}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Link href={`/admin/sav/planning?semaine=${shift(-1)}`} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50" aria-label="Semaine précédente">←</Link>
          <Link href="/admin/sav/planning" className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50">Aujourd&apos;hui</Link>
          <Link href={`/admin/sav/planning?semaine=${shift(1)}`} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50" aria-label="Semaine suivante">→</Link>
          <span className="ml-2 text-sm font-semibold text-gray-800">Semaine du {weekLabel}</span>
        </div>
      </div>
      {full && !connected && (
        <p className="rounded-lg bg-gray-50 px-4 py-2 text-xs text-gray-500">
          Agenda Google non connecté : seuls les rendez-vous SAV sont affichés. Connexion dans Réglages SAV.
        </p>
      )}
      {agendaError && <p className="rounded-lg bg-red-50 px-4 py-2 text-xs text-red-700">Agenda Google non lu : {agendaError}</p>}
      <PlanningBoard
        days={days.map((d) => ({
          key: dayKey(d),
          label: d.toLocaleDateString('fr-FR', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }),
          long: d.toLocaleDateString('fr-FR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }),
        }))}
        appointments={scheduled.map(toCase)}
        // Dossier remis « à planifier » : son ancienne date ne compte plus
        toSchedule={toSchedule.map((c) => ({ ...toCase(c), start: null }))}
        today={todayKey}
        technicians={technicians}
        agenda={agenda}
        defaultMinutes={minutes}
        currentUserId={user.id}
      />
    </div>
  )
}
