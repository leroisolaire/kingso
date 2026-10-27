import 'server-only'
import type { UserRole } from '@prisma/client'
import { db } from '@/lib/db/client'
import { getSession, type SessionUser } from '@/lib/auth/dal'
import { LOGIN_DOMAIN, ROLE_LABELS } from '@/lib/auth/permissions'

// Gestion des comptes du back-office (réservée au Super admin).

export async function requireSuperAdmin(): Promise<SessionUser | null> {
  const session = await getSession()
  return session?.roles.includes('SUPER_ADMIN') ? session : null
}

export function parseRoles(value: unknown): UserRole[] | null {
  if (!Array.isArray(value)) return null
  const roles = [...new Set(value.filter((r): r is UserRole => typeof r === 'string' && r in ROLE_LABELS))]
  return roles
}

export function normalizeEmail(value: unknown): string | null {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.endsWith(`@${LOGIN_DOMAIN}`) ? email : null
}

/** Il doit toujours rester au moins un Super admin actif. */
export async function otherActiveSuperAdmins(userId: string): Promise<number> {
  return db.user.count({ where: { id: { not: userId }, active: true, roles: { has: 'SUPER_ADMIN' } } })
}
