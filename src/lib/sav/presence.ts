// Présence du client sur son chat Kingso (lien personnel), pour les pastilles de l'espace SAV.
// Sans dépendance serveur.

/** Sans signal depuis plus longtemps : le client n'est plus sur sa page */
export const ONLINE_MS = 2 * 60_000

export interface PresenceInput {
  lastSeenAt: Date | null
  linkOpenedAt: Date | null
  messages: number
  resolvedByClient: boolean
}

export interface Presence {
  tone: 'online' | 'left' | 'resolved'
  label: string
}

function ago(date: Date, now: number): string {
  const min = Math.round((now - date.getTime()) / 60_000)
  if (min < 1) return 'à l\'instant'
  if (min < 60) return `il y a ${min} min`
  if (min < 24 * 60) return `il y a ${Math.round(min / 60)} h`
  return `le ${date.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'short' })}`
}

export function kingsoPresence(p: PresenceInput, now = Date.now()): Presence | null {
  const msgs = p.messages > 0 ? `${p.messages} message${p.messages > 1 ? 's' : ''}` : 'n\'a rien écrit'
  if (p.lastSeenAt && now - p.lastSeenAt.getTime() < ONLINE_MS) {
    return { tone: 'online', label: `En ligne avec Kingso · ${p.messages > 0 ? msgs : 'n\'a pas encore écrit'}` }
  }
  if (p.resolvedByClient) return { tone: 'resolved', label: `Résolu par le client avec Kingso${p.messages ? ` · ${msgs}` : ''}` }
  const seen = p.lastSeenAt ?? p.linkOpenedAt
  if (!seen) return null
  return { tone: 'left', label: `A quitté Kingso ${ago(seen, now)} · ${msgs}` }
}

export const PRESENCE_STYLES: Record<Presence['tone'], { dot: string; cls: string }> = {
  online: { dot: 'bg-green-500 animate-pulse', cls: 'bg-green-50 text-green-800 ring-green-300' },
  left: { dot: 'bg-gray-400', cls: 'bg-indigo-50 text-indigo-800 ring-indigo-200' },
  resolved: { dot: 'bg-green-600', cls: 'bg-green-50 text-green-800 ring-green-300' },
}
