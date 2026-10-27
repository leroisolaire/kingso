import 'server-only'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { decrypt } from '@/lib/auth/session'
import type { UserRole } from '@/lib/auth/permissions'
import { db } from '@/lib/db/client'

export interface SessionUser {
  userId: string
  email: string
  name: string | null
  roles: UserRole[]
}

/**
 * Session valide = cookie signé ET compte toujours actif, avec au moins un rôle, et même version de session
 * (changer les rôles ou désactiver un compte ferme ses sessions ouvertes). Vérifié à chaque requête.
 */
export const getSession = cache(async (): Promise<SessionUser | null> => {
  const cookie = (await cookies()).get('session')?.value
  const payload = await decrypt(cookie)
  if (!payload?.userId) return null
  const user = await db.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, email: true, name: true, roles: true, active: true, sessionVersion: true },
  })
  if (!user || !user.active || user.roles.length === 0 || (payload.v ?? 0) !== user.sessionVersion) return null
  return { userId: user.id, email: user.email, name: user.name, roles: user.roles }
})

export const verifySession = cache(async (): Promise<SessionUser> => {
  const session = await getSession()
  // Cookie encore présent mais refusé : il est effacé avant le retour à la page de connexion
  if (!session) redirect('/api/auth/logout?raison=session')
  return session
})

export const getCurrentUser = cache(async () => {
  const session = await verifySession()
  return { id: session.userId, email: session.email, name: session.name, roles: session.roles }
})

/** Accès réservé à certains rôles (Super admin passe partout) : sinon page d'accueil du compte. */
export async function requireRole(...roles: UserRole[]): Promise<SessionUser> {
  const session = await verifySession()
  if (!session.roles.includes('SUPER_ADMIN') && !roles.some((r) => session.roles.includes(r))) redirect('/admin')
  return session
}
