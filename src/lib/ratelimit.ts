interface RateEntry {
  count: number
  resetAt: number
}

// Stockage en mémoire par IP — réinitialisé au redémarrage du serveur
const store = new Map<string, RateEntry>()

const WINDOW_MS = 60_000  // 1 minute
const MAX_REQUESTS = 15   // max 15 messages par minute par IP

export function checkRateLimit(ip: string): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now()
  const entry = store.get(ip)

  if (!entry || now > entry.resetAt) {
    store.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    return { allowed: true, remaining: MAX_REQUESTS - 1, resetIn: WINDOW_MS }
  }

  if (entry.count >= MAX_REQUESTS) {
    return { allowed: false, remaining: 0, resetIn: entry.resetAt - now }
  }

  entry.count++
  return { allowed: true, remaining: MAX_REQUESTS - entry.count, resetIn: entry.resetAt - now }
}
