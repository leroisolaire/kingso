import 'server-only'
import type { Prisma } from '@prisma/client'
import { isOAuthConfigured, oauthTokenRequest } from '@/lib/auth/googleOAuth'
import { seal, unseal } from '@/lib/auth/sealed'
import { db } from '@/lib/db/client'
import { DEFAULT_DURATION_MINUTES, isValidDuration } from './duration'
import { formatPhone } from './phone'

export { DEFAULT_DURATION_MINUTES }

// Planning des interventions dans Google Agenda : un compte Google autorisé une fois (Réglages SAV), un agenda
// choisi (en test : l'agenda de Xavier ; plus tard : l'agenda partagé du planning). Le bouton « Ajouter au planning »
// d'un dossier planifié crée l'événement ; ensuite, un changement de date le déplace, et un dossier qui n'est plus
// planifié le retire. Lien dossier → événement gardé dans SavCase.planningEventId (« idAgenda idÉvénement »).

export const CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
].join(' ')
export const CALENDAR_STATE_COOKIE = 'calendar_oauth_state'
const STATE_KEY = 'savCalendar'
const SEAL = 'calendar'
const TZ = 'Europe/Paris'

export interface CalendarState {
  /** Compte Google connecté */
  email?: string
  /** Jeton de rafraîchissement, chiffré */
  token?: string
  calendarId?: string
  calendarName?: string
  durationMinutes?: number
  connectedAt?: string
  connectedBy?: string | null
  error?: string | null
}

export interface CalendarOption { id: string; name: string; primary: boolean }

export async function getCalendarState(): Promise<CalendarState> {
  const row = await db.appSetting.findUnique({ where: { key: STATE_KEY } })
  return (row?.value as CalendarState | null) ?? {}
}
async function saveState(patch: Partial<CalendarState>): Promise<CalendarState> {
  const next = { ...(await getCalendarState()), ...patch }
  const value = next as unknown as Prisma.InputJsonValue
  await db.appSetting.upsert({ where: { key: STATE_KEY }, create: { key: STATE_KEY, value }, update: { value } })
  return next
}

export { isOAuthConfigured }

// ── Connexion (OAuth) ──
export function calendarAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID ?? '',
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: CALENDAR_SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

async function calendarFetch<T>(accessToken: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  if (res.status === 204) return undefined as T
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const error = new Error(`Google Agenda ${res.status} : ${json.error?.message ?? 'erreur'}`) as Error & { status?: number }
    error.status = res.status
    throw error
  }
  return json as T
}

async function fetchCalendars(accessToken: string): Promise<CalendarOption[]> {
  const res = await calendarFetch<{ items?: { id: string; summary: string; summaryOverride?: string; primary?: boolean }[] }>(
    accessToken, '/users/me/calendarList?minAccessRole=writer&maxResults=100')
  return (res.items ?? []).map((c) => ({ id: c.id, name: c.summaryOverride || c.summary, primary: Boolean(c.primary) }))
}

/** Fin de la connexion : garde le jeton (chiffré) ; l'agenda principal du compte est choisi par défaut. */
export async function completeCalendarConnection(code: string, redirectUri: string, author: string | null) {
  const tokens = await oauthTokenRequest({ code, redirect_uri: redirectUri, grant_type: 'authorization_code' })
  if (!tokens.refresh_token) throw new Error('Google n\'a pas fourni d\'accès durable : recommencez la connexion.')
  const calendars = await fetchCalendars(tokens.access_token)
  const primary = calendars.find((c) => c.primary)
  if (!primary) throw new Error('Aucun agenda modifiable sur ce compte.')
  const current = await getCalendarState()
  // Reconnexion du même compte : on garde l'agenda choisi s'il existe toujours
  const keep = current.calendarId && calendars.find((c) => c.id === current.calendarId)
  await saveState({
    email: primary.id,
    token: seal(SEAL, tokens.refresh_token),
    calendarId: keep ? keep.id : primary.id,
    calendarName: keep ? keep.name : primary.name,
    connectedAt: new Date().toISOString(),
    connectedBy: author,
    error: null,
  })
}

export async function disconnectCalendar() {
  const state = await getCalendarState()
  if (state.token) {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(unseal(SEAL, state.token))}`, { method: 'POST' }).catch(() => null)
  }
  await saveState({ token: undefined, email: undefined })
}

async function accessToken(): Promise<string | null> {
  const state = await getCalendarState()
  if (!state.token || !isOAuthConfigured()) return null
  const tokens = await oauthTokenRequest({ refresh_token: unseal(SEAL, state.token), grant_type: 'refresh_token' })
  return tokens.access_token
}

/** Durée proposée par défaut à la planification (réglage de l'agenda du planning). */
export async function defaultDuration(): Promise<number> {
  return (await getCalendarState()).durationMinutes ?? DEFAULT_DURATION_MINUTES
}

export async function isCalendarConnected(): Promise<boolean> {
  const state = await getCalendarState()
  return Boolean(state.token && state.calendarId && isOAuthConfigured())
}

export async function listCalendars(): Promise<CalendarOption[]> {
  const token = await accessToken()
  return token ? fetchCalendars(token) : []
}

export async function updateCalendarSettings(input: { calendarId?: string; durationMinutes?: number }) {
  const patch: Partial<CalendarState> = {}
  if (input.calendarId) {
    const calendar = (await listCalendars()).find((c) => c.id === input.calendarId)
    if (!calendar) throw new Error('Agenda introuvable ou non modifiable avec ce compte.')
    patch.calendarId = calendar.id
    patch.calendarName = calendar.name
  }
  if (input.durationMinutes !== undefined) {
    if (!isValidDuration(input.durationMinutes)) {
      throw new Error('Durée invalide (15 min à 12 h).')
    }
    patch.durationMinutes = input.durationMinutes
  }
  await saveState(patch)
}

// ── Événements ──
function parseRef(ref: string | null): { calendarId: string; eventId: string } | null {
  if (!ref) return null
  const [calendarId, eventId] = ref.split(' ')
  return calendarId && eventId ? { calendarId, eventId } : null
}

/** Lien direct vers l'événement dans Google Agenda (même forme que le « htmlLink » de Google). */
export function planningEventLink(ref: string | null): string | null {
  const parsed = parseRef(ref)
  if (!parsed) return null
  return `https://www.google.com/calendar/event?eid=${Buffer.from(`${parsed.eventId} ${parsed.calendarId}`).toString('base64url')}`
}

type CaseForEvent = Prisma.SavCaseGetPayload<{ include: { client: true; technician: { select: { name: true; email: true } } } }>

function eventBody(c: CaseForEvent, start: Date, durationMinutes: number) {
  const end = new Date(start.getTime() + durationMinutes * 60_000)
  const name = c.customerName || c.client?.name || 'Client'
  const phone = formatPhone(c.callbackPhone || c.phoneKey)
  const place = [c.address, [c.postalCode, c.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  const admin = `${process.env.KINGSO_PUBLIC_URL ?? 'https://www.kingso.fr'}/admin/sav/${c.id}`
  const details = [
    `Dossier SAV n° ${c.number}`,
    phone ? `Téléphone : ${phone}` : null,
    c.equipment ? `Équipement : ${c.equipment}` : null,
    c.errorCode ? `Code erreur : ${c.errorCode}` : null,
    c.client?.contract ? `Contrat : ${c.client.contract}` : null,
    c.technician ? `Technicien : ${c.technician.name || c.technician.email}` : null,
  ].filter(Boolean)
  const description = [details.join('\n'), c.summary, `Dossier Kingso : ${admin}`].filter(Boolean).join('\n\n')
  return {
    summary: `SAV n°${c.number} – ${name}${c.city ? ` – ${c.city}` : ''}`,
    location: place || undefined,
    description,
    start: { dateTime: start.toISOString(), timeZone: TZ },
    end: { dateTime: end.toISOString(), timeZone: TZ },
  }
}

export type SyncResult = 'added' | 'updated' | 'removed' | 'unchanged'

/**
 * Accorde l'agenda au dossier : dossier planifié avec une date → événement créé (si `create`) ou mis à jour ;
 * dossier qui n'est plus planifié → événement retiré. Sans agenda connecté : rien.
 */
export async function syncCaseEvent(caseId: string, options: { create?: boolean; remove?: boolean } = {}): Promise<SyncResult> {
  const c = await db.savCase.findUniqueOrThrow({
    where: { id: caseId },
    include: { client: true, technician: { select: { name: true, email: true } } },
  })
  const ref = parseRef(c.planningEventId)
  // Intervention passée (retour technicien, résolu) ou dossier clos : l'événement reste dans l'agenda, comme trace
  if (!options.remove && (c.status === 'TECH_REPORT' || c.status === 'RESOLVED' || c.status === 'CLOSED')) return 'unchanged'
  const wanted = !options.remove && c.status === 'SCHEDULED' && c.appointmentAt !== null
  if (!ref && !(wanted && options.create)) return 'unchanged'

  const state = await getCalendarState()
  const token = await accessToken()
  if (!token || !state.calendarId) {
    if (options.create) throw new Error('Aucun agenda connecté : connectez-le dans Réglages SAV.')
    return 'unchanged'
  }
  const path = (r: { calendarId: string; eventId: string }) => `/calendars/${encodeURIComponent(r.calendarId)}/events/${encodeURIComponent(r.eventId)}`

  if (!wanted) {
    if (!ref) return 'unchanged'
    await calendarFetch(token, path(ref), { method: 'DELETE' }).catch((e: { status?: number }) => {
      if (e.status !== 404 && e.status !== 410) throw e // déjà supprimé à la main dans l'agenda : rien à faire
    })
    await db.savCase.update({ where: { id: caseId }, data: { planningEventId: null } })
    return 'removed'
  }

  const body = eventBody(c, c.appointmentAt!, c.appointmentMinutes ?? state.durationMinutes ?? DEFAULT_DURATION_MINUTES)
  if (ref) {
    try {
      await calendarFetch(token, path(ref), { method: 'PATCH', body: JSON.stringify(body) })
      return 'updated'
    } catch (e) {
      const status = (e as { status?: number }).status
      if (status !== 404 && status !== 410) throw e
      // Événement supprimé à la main dans l'agenda : on le recrée seulement sur demande
      if (!options.create) {
        await db.savCase.update({ where: { id: caseId }, data: { planningEventId: null } })
        return 'removed'
      }
    }
  }
  const created = await calendarFetch<{ id: string }>(token, `/calendars/${encodeURIComponent(state.calendarId)}/events`, {
    method: 'POST', body: JSON.stringify(body),
  })
  await db.savCase.update({ where: { id: caseId }, data: { planningEventId: `${state.calendarId} ${created.id}` } })
  return 'added'
}

export interface AgendaEvent {
  id: string
  title: string
  start: string
  end: string
  allDay: boolean
}

/**
 * Événements de l'agenda du planning sur une période (vue complète du planning) : tous sauf ceux créés par Kingso,
 * déjà affichés comme dossiers. Rien si l'agenda n'est pas connecté.
 */
export async function listAgendaEvents(from: Date, to: Date, exclude: string[] = []): Promise<AgendaEvent[]> {
  const state = await getCalendarState()
  const token = await accessToken()
  if (!token || !state.calendarId) return []
  const params = new URLSearchParams({
    timeMin: from.toISOString(), timeMax: to.toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: '250',
  })
  const res = await calendarFetch<{ items?: {
    id: string; summary?: string; status?: string
    start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string }
  }[] }>(token, `/calendars/${encodeURIComponent(state.calendarId)}/events?${params}`)
  const skip = new Set(exclude.map((ref) => parseRef(ref)?.eventId).filter(Boolean))
  return (res.items ?? [])
    .filter((e) => e.status !== 'cancelled' && !skip.has(e.id) && (e.start?.dateTime || e.start?.date))
    .map((e) => ({
      id: e.id,
      title: e.summary || '(sans titre)',
      allDay: !e.start?.dateTime,
      start: e.start?.dateTime ?? e.start!.date!,
      end: e.end?.dateTime ?? e.end?.date ?? e.start?.dateTime ?? e.start!.date!,
    }))
}
