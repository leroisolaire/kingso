import 'server-only'
import { createHash } from 'node:crypto'
import type { NextRequest } from 'next/server'

export function getClientIp(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
}

/** Empreinte de l'IP (on ne stocke pas l'IP en clair) — sert aux limites par visiteur. */
export function hashIp(ip: string): string {
  return createHash('sha256').update(`${ip}:${process.env.SESSION_SECRET ?? ''}`).digest('hex').slice(0, 32)
}
