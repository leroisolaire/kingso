import 'server-only'
import { db } from '@/lib/db/client'
import { distanceKm, geocode, type Point } from '@/lib/geo/geocode'
import { getCalendarState, isCalendarConnected, listChantierEvents, type ChantierEvent } from './calendar'
import { parisParts, parisTime } from './schedule'
import { caseSkill, inSector, parseSkillLevels, SKILL_LEVEL_LABELS, SKILLS, titleHasCode, type Skill, type TechnicianKind } from './skills'

// Intervenants proposés pour un dossier : compétence (produit du dossier), difficulté maximale, secteur, et poseurs
// sur un chantier proche (agenda des chantiers). Kingso propose seulement : le planning choisit.

const WINDOW_DAYS = 14
const NEAR_KM = 30
const MAX_GEOCODE = 80

/** Un chantier de l'intervenant (agenda des chantiers), situé par rapport au dossier. */
export interface ChantierInfo {
  /** Titre de l'événement dans l'agenda */
  title: string
  /** Commune du chantier (adresse retrouvée), sinon null */
  city: string | null
  /** Distance au dossier à vol d'oiseau (km) ; null si l'une des deux adresses est introuvable */
  km: number | null
  /** Jours du chantier (« mar. 4 nov. ») */
  days: string[]
  /** Horaires : « 8h – 17h », « journée » ; null sur plusieurs jours */
  hours: string | null
  /** Le chantier a lieu le jour choisi pour le rendez-vous */
  onDay: boolean
  /** Lien vers l'événement dans Google Agenda */
  link: string | null
}

export interface TechnicianSuggestion {
  id: string
  name: string
  kind: TechnicianKind
  /** Aucune réserve (compétence, niveau, secteur) */
  ok: boolean
  /** Niveau (1 à 5) dans la compétence du dossier ; 0 si inconnu */
  level: number
  strengths: string[]
  warnings: string[]
  /** Chantiers à moins de 30 km dans les 14 prochains jours (le jour choisi d'abord, puis les plus proches) */
  nearby: ChantierInfo[]
  /** Où il est le jour choisi pour le rendez-vous (tous ses chantiers ce jour-là, quelle que soit la distance) */
  onDay: ChantierInfo[]
  /** Repère agenda renseigné sur sa fiche (sinon ses chantiers ne peuvent pas être retrouvés) */
  hasCodes: boolean
}

export interface Suggestions {
  skill: string | null
  difficulty: number | null
  /** Commune du dossier */
  caseCity: string | null
  /** Jour choisi pour le rendez-vous (« mardi 4 novembre »), null si aucun */
  day: string | null
  /** Agenda des chantiers choisi et lu */
  chantiers: 'off' | 'ok' | 'no-address' | 'error'
  chantierError: string | null
  items: TechnicianSuggestion[]
}

// ── Adresse d'un chantier : champ Lieu, sinon la description ──
const STREET = /\b(rue|chemin|ch|avenue|av|bd|boulevard|route|rte|impasse|all[ée]e|place|traverse|lotissement|lot|quartier|lieu[- ]dit|cours|mont[ée]e|domaine|r[ée]sidence|hameau|zac|za|zi)\b/i

function stripHtml(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li)>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, '\'').replace(/&quot;/g, '"')
}

export function chantierAddress(e: Pick<ChantierEvent, 'location' | 'description'>): string | null {
  if (e.location) return e.location
  if (!e.description) return null
  // « Adresse : 12 rue… » → « 12 rue… »
  const lines = stripHtml(e.description).split('\n').map((l) => l.replace(/^[\p{L} ]{2,20}:\s*/u, '').trim()).filter(Boolean)
  const i = lines.findIndex((l) => /\b\d{5}\b/.test(l))
  if (i >= 0) {
    const line = lines[i]
    if (STREET.test(line) || i === 0) return line
    const prev = lines[i - 1]
    return STREET.test(prev) ? `${prev} ${line}` : line
  }
  return lines.find((l) => STREET.test(l)) ?? null
}

const pad = (n: number) => String(n).padStart(2, '0')
const dayKey = (d: Date) => { const p = parisParts(d); return `${p.year}-${pad(p.month)}-${pad(p.day)}` }
const dayLabel = (key: string) => new Date(`${key}T12:00:00Z`).toLocaleDateString('fr-FR', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' })

/** Jours (AAAA-MM-JJ, heure de Paris) couverts par un événement. */
function eventDays(e: ChantierEvent): string[] {
  const days: string[] = []
  if (e.allDay) {
    for (let d = new Date(`${e.start}T12:00:00Z`); d.toISOString().slice(0, 10) < e.end.slice(0, 10) && days.length < 31; d = new Date(d.getTime() + 86_400_000)) {
      days.push(d.toISOString().slice(0, 10))
    }
    return days.length ? days : [e.start.slice(0, 10)]
  }
  const last = dayKey(new Date(new Date(e.end).getTime() - 60_000))
  for (let d = new Date(e.start); days.length < 31; d = new Date(d.getTime() + 86_400_000)) {
    const k = dayKey(d)
    days.push(k)
    if (k >= last) break
  }
  return days
}

/** Géocode plusieurs adresses, 5 à la fois (la plupart sont déjà connues). */
async function geocodeAll(queries: string[]): Promise<Map<string, Point | null>> {
  const out = new Map<string, Point | null>()
  const list = [...new Set(queries)].slice(0, MAX_GEOCODE)
  for (let i = 0; i < list.length; i += 5) {
    const chunk = list.slice(i, i + 5)
    const points = await Promise.all(chunk.map((q) => geocode(q).catch(() => null)))
    chunk.forEach((q, j) => out.set(q, points[j]))
  }
  return out
}

const hm = (min: number) => `${Math.floor(min / 60)}h${min % 60 ? String(min % 60).padStart(2, '0') : ''}`
const parisMinute = (d: Date) => { const p = parisParts(d); return p.hour * 60 + p.minute }

/** Horaires d'un chantier sur un seul jour (« 8h – 17h »), « journée », ou null sur plusieurs jours. */
function eventHours(e: ChantierEvent, days: string[]): string | null {
  if (days.length > 1) return null
  if (e.allDay) return 'journée'
  return `${hm(parisMinute(new Date(e.start)))} – ${hm(parisMinute(new Date(e.end)))}`
}

/** Commune d'une adresse géocodée (« 10 Rue … 13400 Aubagne » → « Aubagne »). */
const cityOf = (label: string | null | undefined) => (label ? label.match(/\b\d{5}\s+(.+)$/)?.[1] ?? label : null)

/**
 * `day` (AAAA-MM-JJ) : jour envisagé pour le rendez-vous (date choisie dans le planning) ; par défaut celui du
 * rendez-vous du dossier. Les chantiers de ce jour-là sont mis en avant.
 */
export async function suggestTechnicians(caseId: string, day?: string | null): Promise<Suggestions> {
  const c = await db.savCase.findUniqueOrThrow({
    where: { id: caseId },
    select: { product: true, difficulty: true, address: true, postalCode: true, city: true, appointmentAt: true },
  })
  const techs = await db.technician.findMany({ where: { active: true }, orderBy: { createdAt: 'asc' } })
  const skill = caseSkill(c.product)
  const chosenDay = day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : c.appointmentAt ? dayKey(c.appointmentAt) : null

  // Chantiers des intervenants qui ont un repère dans l'agenda : proches du dossier, et le jour choisi
  const nearby = new Map<string, ChantierInfo[]>()
  const onDay = new Map<string, ChantierInfo[]>()
  let chantiers: Suggestions['chantiers'] = 'off'
  let chantierError: string | null = null
  let caseCity = c.city
  const state = await getCalendarState()
  const withCodes = techs.filter((t) => t.agendaCodes.length)
  if (state.chantierCalendarId && withCodes.length && (await isCalendarConnected().catch(() => false))) {
    try {
      const casePoint = await geocode([c.address, c.postalCode, c.city].filter(Boolean).join(' '))
      caseCity = c.city || cityOf(casePoint?.label)
      const now = parisParts(new Date())
      const today = parisTime(now.year, now.month, now.day, 0, 0)
      const dayStart = chosenDay ? parisTime(Number(chosenDay.slice(0, 4)), Number(chosenDay.slice(5, 7)), Number(chosenDay.slice(8, 10)), 0, 0) : null
      // 14 prochains jours, étendus au jour choisi s'il est plus loin (ou passé)
      const from = dayStart && dayStart < today ? dayStart : today
      const to = new Date(Math.max(today.getTime() + WINDOW_DAYS * 86_400_000, dayStart ? dayStart.getTime() + 86_400_000 : 0))
      const events = await listChantierEvents(from, to)
      // Rendez-vous SAV créés par Kingso (si l'agenda des chantiers est aussi celui du planning) : ignorés
      const savRefs = new Set((await db.savCase.findMany({ where: { planningEventId: { not: null } }, select: { planningEventId: true } }))
        .map((x) => x.planningEventId!.split(' ')[1]))
      const relevant = events
        .filter((e) => !savRefs.has(e.id))
        .map((e) => ({ e, address: chantierAddress(e), techIds: withCodes.filter((t) => t.agendaCodes.some((code) => titleHasCode(e.title, code))).map((t) => t.id) }))
        .filter((x) => x.techIds.length)
      const points = await geocodeAll(relevant.map((x) => x.address).filter((a): a is string => Boolean(a)))
      for (const { e, address, techIds } of relevant) {
        const point = address ? points.get(address) ?? null : null
        const km = point && casePoint ? Math.round(distanceKm(casePoint, point)) : null
        const keys = eventDays(e)
        const info: ChantierInfo = {
          title: e.title,
          city: cityOf(point?.label) ?? null,
          km,
          days: keys.map(dayLabel),
          hours: eventHours(e, keys),
          onDay: Boolean(chosenDay && keys.includes(chosenDay)),
          link: e.link,
        }
        const recent = keys.some((k) => k >= dayKey(today))
        for (const id of techIds) {
          if (info.onDay) onDay.set(id, [...(onDay.get(id) ?? []), info])
          if (km !== null && km <= NEAR_KM && recent) nearby.set(id, [...(nearby.get(id) ?? []), info])
        }
      }
      chantiers = casePoint ? 'ok' : 'no-address'
    } catch (e) {
      chantiers = 'error'
      chantierError = e instanceof Error ? e.message : String(e)
    }
  }

  const items = techs.map((t): TechnicianSuggestion => {
    const strengths: string[] = []
    const warnings: string[] = []
    // Niveau dans la compétence du dossier (1 à 5), comparé à la difficulté du dossier
    const levels = parseSkillLevels(t.skills, t.maxDifficulty)
    let level = 0
    if (skill) {
      if (!(skill in levels)) {
        warnings.push(t.skills.length ? `pas la compétence ${SKILLS[skill]}` : 'compétences non renseignées')
      } else {
        level = levels[skill] ?? 0
        if (!level) strengths.push(`${SKILLS[skill]} (niveau à noter)`)
        else if (c.difficulty && level < c.difficulty) warnings.push(`${SKILLS[skill]} : niveau ${level}/5, difficulté ${c.difficulty}`)
        else strengths.push(`${SKILLS[skill]} ★${level} · ${SKILL_LEVEL_LABELS[level]}`)
      }
    }
    const sector = inSector(t.sector, c.postalCode, c.city)
    if (sector === true) strengths.push(`secteur ${t.sector}`)
    if (sector === false) warnings.push('hors de son secteur')
    const near = (nearby.get(t.id) ?? []).sort((a, b) => Number(b.onDay) - Number(a.onDay) || (a.km ?? 999) - (b.km ?? 999)).slice(0, 5)
    const day = (onDay.get(t.id) ?? []).sort((a, b) => (a.km ?? 999) - (b.km ?? 999))
    return { id: t.id, name: t.name, kind: t.kind, ok: warnings.length === 0, level, strengths, warnings, nearby: near, onDay: day, hasCodes: t.agendaCodes.length > 0 }
  })
  const rank = (s: TechnicianSuggestion) => [
    s.ok ? 0 : 1,
    // Sur un chantier proche le jour choisi d'abord
    s.onDay.some((n) => n.km !== null && n.km <= NEAR_KM) ? 0 : 1,
    -s.level,
    s.nearby[0]?.km ?? 999,
    -s.strengths.length,
  ]
  items.sort((a, b) => {
    const ra = rank(a)
    const rb = rank(b)
    for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] - rb[i]
    return a.name.localeCompare(b.name, 'fr')
  })
  return {
    skill: skill ? SKILLS[skill as Skill] : null,
    difficulty: c.difficulty,
    caseCity,
    day: chosenDay ? new Date(`${chosenDay}T12:00:00Z`).toLocaleDateString('fr-FR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }) : null,
    chantiers,
    chantierError,
    items,
  }
}
