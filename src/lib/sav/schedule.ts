// Heure d'envoi des emails au client (heure de Paris).
import type { SavSettings } from './settings'

const TZ = 'Europe/Paris'

/** Composantes de la date à l'heure de Paris. */
function parisParts(date: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false,
    }).formatToParts(date).map((p) => [p.type, p.value]),
  )
  return {
    year: Number(parts.year), month: Number(parts.month), day: Number(parts.day),
    hour: Number(parts.hour) % 24, minute: Number(parts.minute),
    weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday),
  }
}

/** Décalage de Paris par rapport à UTC à cet instant (ms) : +1 h l'hiver, +2 h l'été. */
function parisOffset(date: Date): number {
  const p = parisParts(date)
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - Math.floor(date.getTime() / 60_000) * 60_000
}

/** Date correspondant à « jour J à hh:mm, heure de Paris » (changements d'heure compris). */
export function parisTime(year: number, month: number, day: number, hour: number, minute: number): Date {
  const wall = Date.UTC(year, month - 1, day, hour, minute)
  const first = wall - parisOffset(new Date(wall))
  return new Date(wall - parisOffset(new Date(first)))
}

const randomMinutes = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1))

/**
 * Prochaine heure d'envoi autorisée à partir de `from` :
 * « Kingso peut aider » tous les jours de 8 h à l'heure limite (21 h), les autres emails en heures de bureau.
 */
function nextAllowed(from: Date, selfHelp: boolean, s: SavSettings): Date {
  let t = from
  for (let i = 0; i < 8; i++) {
    const p = parisParts(t)
    const start = s.officeStartHour
    const end = selfHelp ? s.selfHelpLastHour : s.officeEndHour
    const workday = selfHelp || (p.weekday >= 1 && p.weekday <= 5)
    if (workday && p.hour >= start && p.hour < end) return t
    if (workday && p.hour < start) return parisTime(p.year, p.month, p.day, start, randomMinutes(0, 20))
    // Après l'heure limite, ou jour non ouvré : le lendemain à l'ouverture
    const next = new Date(parisTime(p.year, p.month, p.day, 12, 0).getTime() + 24 * 3600_000)
    const n = parisParts(next)
    t = parisTime(n.year, n.month, n.day, start, randomMinutes(0, 20))
  }
  return t
}

/** Heure d'envoi prévue pour un message reçu à `receivedAt` (environ 30 min après, avec une petite variation). */
export function plannedSendTime(receivedAt: Date, selfHelp: boolean, s: SavSettings): Date {
  const delay = s.sendDelayMinutes + randomMinutes(-5, 10)
  return nextAllowed(new Date(receivedAt.getTime() + delay * 60_000), selfHelp, s)
}

/** Heure d'envoi effective au moment de la validation : jamais dans le passé, toujours dans une plage autorisée. */
export function effectiveSendTime(planned: Date | null, selfHelp: boolean, s: SavSettings): Date {
  const soon = new Date(Date.now() + randomMinutes(1, 3) * 60_000)
  const base = planned && planned > soon ? planned : soon
  return nextAllowed(base, selfHelp, s)
}

export function formatParisDate(date: Date, withTime = false): string {
  return date.toLocaleString('fr-FR', {
    timeZone: TZ, day: 'numeric', month: 'long',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  })
}
