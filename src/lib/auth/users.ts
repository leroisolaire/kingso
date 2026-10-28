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

/** Identifiant d'un compte à mot de passe (personne sans compte Google) : un email quelconque ou un nom de connexion. */
export function normalizeLogin(value: unknown): string | null {
  const login = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(login)) return login
  return /^[a-z0-9][a-z0-9._-]{2,49}$/.test(login) ? login : null
}

export const MIN_PASSWORD_LENGTH = 10

export function passwordError(value: unknown): string | null {
  if (typeof value !== 'string' || value.length < MIN_PASSWORD_LENGTH) return `Mot de passe trop court : ${MIN_PASSWORD_LENGTH} caractères minimum.`
  if (value.length > 200) return 'Mot de passe trop long.'
  return null
}

/** Compte qui peut se connecter avec Google (adresse du domaine). */
export function isGoogleEmail(email: string): boolean {
  return normalizeEmail(email) !== null
}

/** Il doit toujours rester au moins un Super admin actif. */
export async function otherActiveSuperAdmins(userId: string): Promise<number> {
  return db.user.count({ where: { id: { not: userId }, active: true, roles: { has: 'SUPER_ADMIN' } } })
}
