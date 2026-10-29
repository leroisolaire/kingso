import type { Metadata } from 'next'
import Link from 'next/link'
import AutoRefresh from '@/app/admin/(protected)/sav/AutoRefresh'
import { logout } from '@/lib/auth/actions'
import { getCurrentUser } from '@/lib/auth/dal'
import { db } from '@/lib/db/client'
import { formatPhone } from '@/lib/sav/phone'
import { ratingShort } from '@/lib/sav/rating'
import { formatParisDate, parisParts } from '@/lib/sav/schedule'
import { TECH_OUTCOMES, type TechOutcome } from '@/lib/sav/status'

// Interventions d'un technicien, pensée pour le téléphone (hors du back-office, dont le menu prend la largeur).
// Chaque intervention s'ouvre sur la même fiche que celle des poseurs (/i/…), avec le retour et sa modification.
export const metadata: Metadata = { title: 'Mes interventions | Kingso' }
export const dynamic = 'force-dynamic'

const DONE_DAYS = 7
const pad = (n: number) => String(n).padStart(2, '0')
const dayKey = (d: Date) => { const p = parisParts(d); return `${p.year}-${pad(p.month)}-${pad(p.day)}` }
const time = (d: Date) => d.toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' })
const dayLabel = (d: Date) => d.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long' })

type Item = {
  id: string; number: number; status: string; customerName: string | null; city: string | null; address: string | null; postalCode: string | null
  summary: string; phoneKey: string | null; callbackPhone: string | null; appointmentAt: Date | null; appointmentMinutes: number | null
  urgency: number | null; difficulty: number | null; urgent: boolean; techOutcome: string | null; techReportAt: Date | null
}

function Card({ c, highlight }: { c: Item; highlight?: 'todo' }) {
  const phone = formatPhone(c.callbackPhone || c.phoneKey)
  const place = [c.address, [c.postalCode, c.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  const end = c.appointmentAt && c.appointmentMinutes ? new Date(c.appointmentAt.getTime() + c.appointmentMinutes * 60_000) : null
  const outcome = c.techOutcome && c.techOutcome in TECH_OUTCOMES ? TECH_OUTCOMES[c.techOutcome as TechOutcome] : null
  const rating = ratingShort(c.urgency, c.difficulty)
  return (
    <li className={`overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ${highlight === 'todo' ? 'ring-2 ring-orange-400' : 'ring-gray-200'}`}>
      <Link href={`/admin/interventions/${c.id}`} className="block p-4 active:bg-gray-50">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          {c.appointmentAt && <span className="font-bold text-gray-900">{time(c.appointmentAt)}{end ? ` – ${time(end)}` : ''}</span>}
          {c.urgent && <span className="rounded bg-red-600 px-1.5 text-[11px] font-bold text-white">URGENT</span>}
          {rating && <span className="text-gray-600">{rating}</span>}
          <span className="ml-auto text-xs text-gray-400">n° {c.number}</span>
        </p>
        <p className="mt-1 text-base font-semibold text-gray-900">{c.customerName || 'Client'}{c.city ? <span className="font-normal text-gray-600"> · {c.city}</span> : null}</p>
        <p className="mt-0.5 line-clamp-2 text-sm text-gray-600">{c.summary}</p>
        {highlight === 'todo' && <p className="mt-2 inline-block rounded-lg bg-orange-100 px-2 py-1 text-sm font-semibold text-orange-900">Retour à faire →</p>}
        {outcome && !highlight && (
          <p className="mt-2 text-sm text-gray-700">{outcome.icon} {outcome.label}{c.techReportAt ? <span className="text-gray-400"> · le {formatParisDate(c.techReportAt, true)}</span> : null}</p>
        )}
      </Link>
      {(phone || place) && (
        <div className="flex border-t border-gray-100 text-sm font-semibold">
          {phone && <a href={`tel:${phone.replace(/\s/g, '')}`} className="flex-1 py-3 text-center text-emerald-700 active:bg-gray-50">📞 Appeler</a>}
          {place && (
            <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`} target="_blank" rel="noreferrer"
              className="flex-1 border-l border-gray-100 py-3 text-center text-sky-700 active:bg-gray-50">📍 Itinéraire</a>
          )}
        </div>
      )}
    </li>
  )
}

function Group({ title, items, highlight, empty }: { title: string; items: Item[]; highlight?: 'todo'; empty?: string }) {
  if (!items.length && !empty) return null
  return (
    <section className="space-y-2">
      <h2 className="px-1 text-sm font-semibold uppercase tracking-wide text-gray-500">{title}{items.length ? ` (${items.length})` : ''}</h2>
      {items.length ? <ul className="space-y-2">{items.map((c) => <Card key={c.id} c={c} highlight={highlight} />)}</ul> : <p className="px-1 text-sm text-gray-400">{empty}</p>}
    </section>
  )
}

export default async function InterventionsPage({ searchParams }: { searchParams: Promise<{ intervenant?: string }> }) {
  const { intervenant } = await searchParams
  const user = await getCurrentUser()
  const staff = user.roles.some((r) => r === 'SUPER_ADMIN' || r === 'SAV' || r === 'PLANNING')
  const mine = await db.technician.findUnique({ where: { userId: user.id }, select: { id: true, name: true } })
  // Le SAV et le planning peuvent regarder la liste de n'importe quel intervenant
  const technicians = staff ? await db.technician.findMany({ where: { active: true }, select: { id: true, name: true, kind: true }, orderBy: { createdAt: 'asc' } }) : []
  const tech = (staff && intervenant ? technicians.find((t) => t.id === intervenant) : null) ?? mine

  const now = new Date()
  const since = new Date(now.getTime() - DONE_DAYS * 86_400_000)
  const cases: Item[] = tech ? await db.savCase.findMany({
    where: { technicianId: tech.id, OR: [{ status: { in: ['SCHEDULED', 'TECH_REPORT'] } }, { techReportAt: { gte: since } }] },
    select: {
      id: true, number: true, status: true, customerName: true, city: true, address: true, postalCode: true, summary: true, phoneKey: true,
      callbackPhone: true, appointmentAt: true, appointmentMinutes: true, urgency: true, difficulty: true, urgent: true, techOutcome: true, techReportAt: true,
    },
    orderBy: [{ appointmentAt: { sort: 'asc', nulls: 'last' } }],
  }) : []

  const today = dayKey(now)
  const active = cases.filter((c) => c.status === 'SCHEDULED' || c.status === 'TECH_REPORT')
  const isPast = (c: Item) => Boolean(c.appointmentAt && c.appointmentAt.getTime() + (c.appointmentMinutes ?? 0) * 60_000 < now.getTime())
  const todo = active.filter((c) => c.status === 'TECH_REPORT' || (isPast(c) && dayKey(c.appointmentAt!) < today))
  const todayList = active.filter((c) => !todo.includes(c) && c.appointmentAt && dayKey(c.appointmentAt) === today)
  const upcoming = active.filter((c) => !todo.includes(c) && c.appointmentAt && dayKey(c.appointmentAt) > today)
  const undated = active.filter((c) => !c.appointmentAt && c.status === 'SCHEDULED')
  const done = cases.filter((c) => !active.includes(c)).sort((a, b) => (b.techReportAt?.getTime() ?? 0) - (a.techReportAt?.getTime() ?? 0))
  // À venir : regroupés par jour
  const byDay = new Map<string, Item[]>()
  for (const c of upcoming) byDay.set(dayKey(c.appointmentAt!), [...(byDay.get(dayKey(c.appointmentAt!)) ?? []), c])

  return (
    <main className="min-h-dvh bg-[#f7f6f4] text-gray-900">
      <AutoRefresh seconds={60} />
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#e73e11]">Le Roi Solaire · SAV</p>
            <h1 className="truncate text-lg font-bold">{tech && tech.id !== mine?.id ? `Interventions de ${tech.name}` : 'Mes interventions'}</h1>
          </div>
          <Link href="/admin/sav" className="shrink-0 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700">Espace SAV</Link>
          <form action={logout}>
            <button type="submit" className="shrink-0 rounded-lg px-2 py-1.5 text-sm text-gray-500" aria-label="Déconnexion">⏻</button>
          </form>
        </div>
      </header>

      <div className="mx-auto max-w-lg space-y-5 px-4 py-4">
        {staff && technicians.length > 0 && (
          <nav className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 text-sm">
            {technicians.map((t) => (
              <Link key={t.id} href={`/admin/interventions?intervenant=${t.id}`}
                className={`shrink-0 rounded-full px-3 py-1.5 ring-1 ${t.id === tech?.id ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-gray-700 ring-gray-300'}`}>
                {t.name}{t.kind === 'POSEUR' ? ' (poseur)' : ''}
              </Link>
            ))}
          </nav>
        )}

        {!tech ? (
          <p className="rounded-2xl bg-white p-5 text-sm text-gray-600 shadow-sm ring-1 ring-gray-200">
            {staff ? 'Choisissez un intervenant ci-dessus.' : 'Votre compte n’est relié à aucune fiche intervenant : demandez au SAV de la créer (page Intervenants).'}
          </p>
        ) : (
          <>
            <Group title="Retours à faire" items={todo} highlight="todo" />
            <Group title={`Aujourd’hui · ${dayLabel(now)}`} items={todayList} empty="Aucune intervention aujourd’hui." />
            {[...byDay.entries()].map(([key, items]) => <Group key={key} title={dayLabel(items[0].appointmentAt!)} items={items} />)}
            <Group title="Date à confirmer" items={undated} />
            <Group title={`Faites ces ${DONE_DAYS} derniers jours`} items={done} />
            {!active.length && !done.length && <p className="text-center text-sm text-gray-400">Aucune intervention prévue pour l’instant.</p>}
          </>
        )}
      </div>
    </main>
  )
}
