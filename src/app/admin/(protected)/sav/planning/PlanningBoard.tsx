'use client'

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { SavStatus } from '@prisma/client'
import Button from '@/components/ui/Button'
import { durationLabel } from '@/lib/sav/duration'
import { NO_TECH_COLOR, STATUS_LABELS, TECH_COLORS } from '@/lib/sav/status'
import DurationSelect from '../DurationSelect'

export interface PlanningCase {
  id: string
  number: number
  status: SavStatus
  name: string
  phone: string
  place: string
  city: string
  summary: string
  equipment: string
  urgent: boolean
  /** Début du rendez-vous (ISO), null pour un dossier à planifier */
  start: string | null
  minutes: number
  technicianId: string | null
  inAgenda: boolean
}

interface AgendaItem { id: string; title: string; start: string; end: string; allDay: boolean }
interface Day { key: string; label: string; long: string }

interface Props {
  days: Day[]
  today: string
  appointments: PlanningCase[]
  toSchedule: PlanningCase[]
  technicians: { id: string; name: string }[]
  agenda: AgendaItem[]
  defaultMinutes: number
  currentUserId: string
}

const HOUR_PX = 56
const SNAP = 15
const pad = (n: number) => String(n).padStart(2, '0')
const hhmm = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`

const parisFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})
/** Jour (AAAA-MM-JJ) et minute de la journée, heure de Paris. */
function paris(iso: string): { day: string; min: number } {
  const p = Object.fromEntries(parisFormat.formatToParts(new Date(iso)).map((x) => [x.type, x.value]))
  return { day: `${p.year}-${p.month}-${p.day}`, min: Number(p.hour) * 60 + Number(p.minute) }
}

interface Block {
  key: string
  day: string
  start: number
  end: number
  item: { kind: 'case'; c: PlanningCase } | { kind: 'agenda'; e: AgendaItem }
  lane: number
  lanes: number
}

/** Place côte à côte les rendez-vous qui se chevauchent. */
function layout(blocks: Omit<Block, 'lane' | 'lanes'>[]): Block[] {
  const out: Block[] = []
  const byDay = new Map<string, Omit<Block, 'lane' | 'lanes'>[]>()
  for (const b of blocks) byDay.set(b.day, [...(byDay.get(b.day) ?? []), b])
  for (const list of byDay.values()) {
    list.sort((a, b) => a.start - b.start || b.end - a.end)
    let cluster: Block[] = []
    let laneEnds: number[] = []
    let clusterEnd = -1
    const flush = () => { for (const b of cluster) b.lanes = laneEnds.length; out.push(...cluster); cluster = []; laneEnds = [] }
    for (const b of list) {
      if (b.start >= clusterEnd) flush()
      let lane = laneEnds.findIndex((end) => end <= b.start)
      if (lane === -1) { lane = laneEnds.length; laneEnds.push(b.end) } else laneEnds[lane] = b.end
      cluster.push({ ...b, lane, lanes: 1 })
      clusterEnd = Math.max(clusterEnd, b.end)
    }
    flush()
  }
  return out
}

export default function PlanningBoard({ days, today, appointments, toSchedule, technicians, agenda, defaultMinutes, currentUserId }: Props) {
  const router = useRouter()
  const [filter, setFilter] = useState<string>('all')
  const [selected, setSelected] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hover, setHover] = useState<{ day: string; min: number; minutes: number } | null>(null)
  const dragging = useRef<{ id: string; isNew: boolean; minutes: number; grab: number } | null>(null)

  const colorOf = (techId: string | null) => {
    const i = technicians.findIndex((t) => t.id === techId)
    return i === -1 ? NO_TECH_COLOR : TECH_COLORS[i % TECH_COLORS.length]
  }
  const techName = (id: string | null) => technicians.find((t) => t.id === id)?.name
  const isTechnician = technicians.some((t) => t.id === currentUserId)
  const visible = (c: PlanningCase) => filter === 'all' || (filter === 'none' ? !c.technicianId : c.technicianId === filter)

  const dayKeys = new Set(days.map((d) => d.key))
  const { blocks, allDay, startHour, endHour } = useMemo(() => {
    const raw: Omit<Block, 'lane' | 'lanes'>[] = []
    for (const c of appointments) {
      if (!c.start || !visible(c)) continue
      const p = paris(c.start)
      raw.push({ key: c.id, day: p.day, start: p.min, end: Math.min(24 * 60, p.min + c.minutes), item: { kind: 'case', c } })
    }
    const allDay: { day: string; e: AgendaItem }[] = []
    for (const e of agenda) {
      if (e.allDay) {
        // Journée entière : du jour de début au jour de fin (exclu)
        for (const d of days) if (d.key >= e.start.slice(0, 10) && d.key < e.end.slice(0, 10)) allDay.push({ day: d.key, e })
        continue
      }
      const s = paris(e.start)
      const en = paris(e.end)
      raw.push({ key: `g-${e.id}`, day: s.day, start: s.min, end: en.day === s.day ? Math.max(en.min, s.min + 15) : 24 * 60, item: { kind: 'agenda', e } })
    }
    const inWeek = raw.filter((b) => dayKeys.has(b.day))
    const startHour = Math.min(7, ...inWeek.map((b) => Math.floor(b.start / 60)))
    const endHour = Math.max(20, ...inWeek.map((b) => Math.ceil(b.end / 60)))
    return { blocks: layout(inWeek), allDay, startHour, endHour }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recalcul quand les données ou le filtre changent
  }, [appointments, agenda, filter, days])

  const allCases = [...appointments, ...toSchedule]
  const current = allCases.find((c) => c.id === selected) ?? null
  const unscheduled = toSchedule.filter((c) => filter === 'all' || visible(c))

  const post = async (caseId: string, payload: Record<string, unknown>) => {
    setBusy(true)
    setError(null)
    const res = await fetch(`/api/sav/cases/${caseId}/actions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    })
    const json = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setError(json.error ?? `Erreur ${res.status}`); return false }
    if (json.warning) setError(json.warning)
    router.refresh()
    return true
  }

  // ── Glisser-déposer ──
  const slotAt = (e: React.DragEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const y = e.clientY - rect.top - (dragging.current?.grab ?? 0)
    const raw = startHour * 60 + (y / HOUR_PX) * 60
    const snapped = Math.round(raw / SNAP) * SNAP
    return Math.max(startHour * 60, Math.min(endHour * 60 - SNAP, snapped))
  }
  const onDrop = async (e: React.DragEvent<HTMLDivElement>, day: string) => {
    e.preventDefault()
    const drag = dragging.current
    const min = slotAt(e)
    dragging.current = null
    setHover(null)
    if (!drag) return
    const ok = await post(drag.id, {
      action: 'schedule', day, time: hhmm(min),
      // Nouveau rendez-vous : durée par défaut ; rendez-vous déplacé : durée et technicien gardés
      ...(drag.isNew ? { durationMinutes: defaultMinutes } : {}),
    })
    if (ok && drag.isNew) setSelected(drag.id)
  }
  const startDrag = (e: React.DragEvent<HTMLElement>, c: PlanningCase, isNew: boolean) => {
    const rect = e.currentTarget.getBoundingClientRect()
    dragging.current = { id: c.id, isNew, minutes: isNew ? defaultMinutes : c.minutes, grab: isNew ? 0 : e.clientY - rect.top }
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', c.id)
  }

  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i)

  return (
    <div className="space-y-3">
      {/* Filtre par technicien */}
      <div className="flex flex-wrap items-center gap-1.5 text-sm">
        <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>Tous</FilterChip>
        {isTechnician && <FilterChip active={filter === currentUserId} onClick={() => setFilter(currentUserId)}>Mes interventions</FilterChip>}
        {technicians.map((t) => (
          <FilterChip key={t.id} active={filter === t.id} onClick={() => setFilter(t.id)}>
            <span className={`h-2.5 w-2.5 rounded-full ${colorOf(t.id).dot}`} /> {t.name}
          </FilterChip>
        ))}
        <FilterChip active={filter === 'none'} onClick={() => setFilter('none')}>
          <span className={`h-2.5 w-2.5 rounded-full ${NO_TECH_COLOR.dot}`} /> Sans technicien
        </FilterChip>
        {technicians.length === 0 && (
          <span className="text-xs text-gray-500">Aucun technicien : donnez le rôle « Technicien » dans Utilisateurs.</span>
        )}
        {busy && <span className="ml-auto text-xs text-gray-500">Enregistrement…</span>}
      </div>
      {error && <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* Dossiers à planifier */}
        <aside className="shrink-0 rounded-xl border border-gray-200 bg-white p-3 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:w-64 lg:overflow-y-auto">
          <h2 className="mb-1 text-sm font-semibold text-gray-900">À planifier ({unscheduled.length})</h2>
          <p className="mb-2 hidden text-xs text-gray-500 lg:block">Faites glisser un dossier sur un créneau, ou cliquez dessus.</p>
          {unscheduled.length === 0 ? (
            <p className="py-3 text-center text-xs text-gray-400">Aucune intervention à planifier.</p>
          ) : (
            <ul className="space-y-1.5">
              {unscheduled.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    draggable
                    onDragStart={(e) => startDrag(e, c, true)}
                    onDragEnd={() => { dragging.current = null; setHover(null) }}
                    onClick={() => setSelected(c.id)}
                    className="w-full cursor-grab rounded-lg border border-purple-200 bg-purple-50 px-2.5 py-2 text-left text-xs hover:border-purple-400 active:cursor-grabbing"
                  >
                    <span className="flex items-center gap-1.5">
                      {c.urgent && <span className="rounded bg-red-600 px-1 text-[10px] font-bold text-white">URGENT</span>}
                      <span className="font-semibold text-gray-900">{c.name}</span>
                    </span>
                    <span className="block text-gray-500">n° {c.number}{c.city ? ` · ${c.city}` : ''}</span>
                    <span className="mt-0.5 line-clamp-2 block text-gray-600">{c.summary}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <div className="min-w-0 flex-1">
          {/* Semaine (ordinateur) */}
          <div className="hidden overflow-x-auto rounded-xl border border-gray-200 bg-white md:block">
            <div className="grid min-w-[56rem]" style={{ gridTemplateColumns: '3.5rem repeat(7, minmax(0, 1fr))' }}>
              <div className="border-b border-gray-200" />
              {days.map((d) => (
                <div key={d.key} className={`border-b border-l border-gray-200 px-2 py-2 text-center text-xs font-semibold capitalize ${d.key === today ? 'bg-amber-50 text-amber-900' : 'text-gray-700'}`}>
                  {d.label}
                </div>
              ))}
              {allDay.length > 0 && (
                <>
                  <div className="border-b border-gray-200 px-1 py-1 text-right text-[10px] text-gray-400">journée</div>
                  {days.map((d) => (
                    <div key={d.key} className="space-y-0.5 border-b border-l border-gray-200 p-1">
                      {allDay.filter((a) => a.day === d.key).map((a) => (
                        <p key={a.e.id} className="truncate rounded bg-gray-200 px-1.5 py-0.5 text-[11px] text-gray-700" title={a.e.title}>{a.e.title}</p>
                      ))}
                    </div>
                  ))}
                </>
              )}
              {/* Heures */}
              <div className="relative" style={{ height: hours.length * HOUR_PX }}>
                {hours.map((h, i) => (
                  <span key={h} className="absolute right-1.5 -translate-y-1/2 text-[10px] text-gray-400" style={{ top: i * HOUR_PX }}>{i ? `${h}h` : ''}</span>
                ))}
              </div>
              {days.map((d) => (
                <div
                  key={d.key}
                  className={`relative border-l border-gray-200 ${d.key === today ? 'bg-amber-50/40' : ''}`}
                  style={{ height: hours.length * HOUR_PX }}
                  onDragOver={(e) => { if (!dragging.current) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setHover({ day: d.key, min: slotAt(e), minutes: dragging.current.minutes }) }}
                  onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setHover(null) }}
                  onDrop={(e) => onDrop(e, d.key)}
                >
                  {hours.map((h, i) => (
                    <div key={h} className="absolute inset-x-0 border-t border-gray-100" style={{ top: i * HOUR_PX }} />
                  ))}
                  {hover?.day === d.key && (
                    <div
                      className="pointer-events-none absolute inset-x-1 z-20 rounded-md border-2 border-dashed border-amber-500 bg-amber-100/60 px-1.5 text-[11px] font-semibold text-amber-900"
                      style={{ top: ((hover.min - startHour * 60) / 60) * HOUR_PX, height: (hover.minutes / 60) * HOUR_PX }}
                    >
                      {hhmm(hover.min)} – {hhmm(hover.min + hover.minutes)}
                    </div>
                  )}
                  {blocks.filter((b) => b.day === d.key).map((b) => {
                    const style = {
                      top: ((b.start - startHour * 60) / 60) * HOUR_PX,
                      height: Math.max(20, ((b.end - b.start) / 60) * HOUR_PX - 2),
                      left: `calc(${(b.lane / b.lanes) * 100}% + 2px)`,
                      width: `calc(${100 / b.lanes}% - 4px)`,
                    }
                    if (b.item.kind === 'agenda') {
                      return (
                        <div key={b.key} style={style} title={b.item.e.title}
                          className="pointer-events-none absolute overflow-hidden rounded-md border border-gray-300 bg-gray-100/90 px-1.5 py-0.5 text-[11px] text-gray-600">
                          <span className="font-medium">{hhmm(b.start)}</span> {b.item.e.title}
                        </div>
                      )
                    }
                    const c = b.item.c
                    const done = c.status === 'RESOLVED' || c.status === 'CLOSED'
                    const report = c.status === 'TECH_REPORT'
                    const color = colorOf(c.technicianId)
                    return (
                      <button
                        key={b.key}
                        type="button"
                        style={style}
                        draggable={!done}
                        onDragStart={(e) => startDrag(e, c, false)}
                        onDragEnd={() => { dragging.current = null; setHover(null) }}
                        onClick={() => setSelected(c.id)}
                        title={`${c.name} — ${c.summary}`}
                        className={`absolute z-10 overflow-hidden rounded-md border-l-4 px-1.5 py-0.5 text-left text-[11px] leading-tight shadow-sm hover:z-30 hover:shadow-md ${color.block} ${report ? 'ring-2 ring-orange-500' : ''} ${done ? 'opacity-50' : 'cursor-grab active:cursor-grabbing'}`}
                      >
                        <span className="block font-semibold">{hhmm(b.start)} {c.name}</span>
                        <span className="block truncate opacity-80">{c.city}{techName(c.technicianId) ? ` · ${techName(c.technicianId)}` : ''}</span>
                        {report && <span className="block font-semibold text-orange-700">Retour à faire</span>}
                        {done && <span className="block">✓ {STATUS_LABELS[c.status]}</span>}
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Liste par jour (mobile) */}
          <div className="space-y-3 md:hidden">
            {days.map((d) => {
              const items = blocks.filter((b) => b.day === d.key)
              const dayAll = allDay.filter((a) => a.day === d.key)
              return (
                <section key={d.key} className="rounded-xl border border-gray-200 bg-white">
                  <h3 className={`border-b border-gray-100 px-3 py-2 text-sm font-semibold capitalize ${d.key === today ? 'bg-amber-50 text-amber-900' : 'text-gray-800'}`}>
                    {d.long}{d.key === today ? ' · aujourd’hui' : ''}
                  </h3>
                  {items.length === 0 && dayAll.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-gray-400">Rien de prévu.</p>
                  ) : (
                    <ul className="divide-y divide-gray-100">
                      {dayAll.map((a) => <li key={a.e.id} className="px-3 py-2 text-xs text-gray-500">Journée · {a.e.title}</li>)}
                      {items.map((b) => b.item.kind === 'agenda' ? (
                        <li key={b.key} className="px-3 py-2 text-xs text-gray-500">{hhmm(b.start)} – {hhmm(b.end)} · {b.item.e.title}</li>
                      ) : (
                        <li key={b.key}>
                          <button type="button" onClick={() => b.item.kind === 'case' && setSelected(b.item.c.id)} className="flex w-full items-start gap-2 px-3 py-2.5 text-left">
                            <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${colorOf(b.item.c.technicianId).dot}`} />
                            <span className="min-w-0 flex-1 text-sm">
                              <span className="font-semibold text-gray-900">{hhmm(b.start)} – {hhmm(b.end)} · {b.item.c.name}</span>
                              <span className="block text-xs text-gray-500">
                                {b.item.c.city}{techName(b.item.c.technicianId) ? ` · ${techName(b.item.c.technicianId)}` : ' · sans technicien'}
                              </span>
                              {b.item.c.status === 'TECH_REPORT' && <span className="block text-xs font-semibold text-orange-700">Retour technicien à faire</span>}
                              {(b.item.c.status === 'RESOLVED' || b.item.c.status === 'CLOSED') && <span className="block text-xs text-green-700">✓ {STATUS_LABELS[b.item.c.status]}</span>}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )
            })}
          </div>
        </div>
      </div>

      {current && (
        <CasePanel
          key={`${current.id}-${current.start}-${current.minutes}-${current.technicianId}`}
          c={current}
          technicians={technicians}
          defaultMinutes={defaultMinutes}
          defaultDay={days.find((d) => d.key === today)?.key ?? days[0].key}
          busy={busy}
          onClose={() => setSelected(null)}
          onPost={(payload) => post(current.id, payload)}
        />
      )}
    </div>
  )
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 ${active ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-gray-700 ring-gray-300 hover:bg-gray-50'}`}
    >
      {children}
    </button>
  )
}

/** Détail d'un rendez-vous ou d'un dossier à planifier : date, durée, technicien. */
function CasePanel({ c, technicians, defaultMinutes, defaultDay, busy, onClose, onPost }: {
  c: PlanningCase
  technicians: { id: string; name: string }[]
  defaultMinutes: number
  defaultDay: string
  busy: boolean
  onClose: () => void
  onPost: (payload: Record<string, unknown>) => Promise<boolean>
}) {
  const at = c.start ? paris(c.start) : null
  const [day, setDay] = useState(at?.day ?? defaultDay)
  const [time, setTime] = useState(at ? hhmm(at.min) : '09:00')
  const [minutes, setMinutes] = useState(c.start ? c.minutes : defaultMinutes)
  const [tech, setTech] = useState(c.technicianId ?? '')
  const done = c.status === 'RESOLVED' || c.status === 'CLOSED'
  const changed = !c.start || day !== at?.day || time !== hhmm(at.min) || minutes !== c.minutes || tech !== (c.technicianId ?? '')

  const save = async () => {
    const ok = await onPost({ action: 'schedule', day, time, durationMinutes: minutes, technicianId: tech || null })
    if (ok && !c.start) onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-gray-500">Dossier n° {c.number} · {STATUS_LABELS[c.status]}</p>
            <h2 className="text-lg font-bold text-gray-900">{c.name}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-gray-500 hover:bg-gray-100" aria-label="Fermer">✕</button>
        </div>
        <dl className="space-y-1 text-sm">
          {c.phone && <div><dt className="inline text-gray-500">Téléphone : </dt><dd className="inline"><a href={`tel:${c.phone.replace(/\s/g, '')}`} className="font-medium text-amber-700">{c.phone}</a></dd></div>}
          {c.place && (
            <div>
              <dt className="inline text-gray-500">Adresse : </dt>
              <dd className="inline">
                <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.place)}`} target="_blank" rel="noreferrer" className="text-sky-700 hover:underline">{c.place}</a>
              </dd>
            </div>
          )}
          {c.equipment && <div><dt className="inline text-gray-500">Équipement : </dt><dd className="inline">{c.equipment}</dd></div>}
        </dl>
        <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm text-gray-700">{c.summary}</p>
        {c.status === 'TECH_REPORT' && (
          <p className="mt-3 rounded-lg bg-orange-100 px-3 py-2 text-sm font-semibold text-orange-900">Intervention passée : retour du technicien à faire dans le dossier.</p>
        )}

        {!done && (
          <div className="mt-4 space-y-2 rounded-lg bg-gray-50 p-3">
            <p className="text-sm font-semibold text-gray-900">{c.start ? 'Rendez-vous' : 'Planifier'}</p>
            <div className="flex flex-wrap gap-2">
              <input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm" />
              <input type="time" value={time} step={900} onChange={(e) => setTime(e.target.value)} className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm" />
            </div>
            <label className="flex items-center justify-between gap-2 text-sm text-gray-600">
              Durée
              <DurationSelect value={minutes} onChange={setMinutes} className="py-1.5" />
            </label>
            <label className="flex items-center justify-between gap-2 text-sm text-gray-600">
              Technicien
              <select value={tech} onChange={(e) => setTech(e.target.value)} className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900">
                <option value="">Aucun</option>
                {technicians.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button type="button" size="sm" onClick={save} loading={busy} disabled={busy || !day || !time || !changed}>
                {c.start ? 'Enregistrer' : 'Planifier'}
              </Button>
              {c.start && c.status === 'SCHEDULED' && (
                <Button type="button" size="sm" variant="ghost" disabled={busy}
                  onClick={() => confirm('Retirer ce rendez-vous et remettre le dossier « à planifier » ?') && onPost({ action: 'status', status: 'TO_SCHEDULE' }).then((ok) => ok && onClose())}>
                  Déprogrammer
                </Button>
              )}
            </div>
            {c.start && <p className="text-xs text-gray-500">Durée actuelle : {durationLabel(c.minutes)}{c.inAgenda ? ' · dans Google Agenda' : ''}</p>}
          </div>
        )}
        <Link href={`/admin/sav/${c.id}`} className="mt-4 inline-flex w-full items-center justify-center rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-800 hover:bg-gray-50">
          Ouvrir le dossier
        </Link>
      </div>
    </div>
  )
}
