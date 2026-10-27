import type { Metadata } from 'next'
import { requireRole } from '@/lib/auth/dal'
import { LOGIN_DOMAIN } from '@/lib/auth/permissions'
import { db } from '@/lib/db/client'
import UsersClient from './UsersClient'

export const metadata: Metadata = { title: 'Utilisateurs | Admin' }

export default async function UsersPage() {
  const me = await requireRole('SUPER_ADMIN')
  const users = await db.user.findMany({
    orderBy: [{ active: 'desc' }, { email: 'asc' }],
    select: { id: true, email: true, name: true, roles: true, active: true, lastLoginAt: true, password: true },
  })

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Utilisateurs</h1>
        <p className="mt-1 text-sm text-gray-500">
          Chaque collaborateur se connecte avec son compte Google @{LOGIN_DOMAIN}. Seules les personnes ajoutées ici ont accès au
          back-office, selon leurs rôles. Un changement de rôle ou une désactivation prend effet immédiatement.
        </p>
      </div>
      <UsersClient
        meId={me.userId}
        domain={LOGIN_DOMAIN}
        users={users.map((u) => ({
          id: u.id,
          email: u.email,
          name: u.name ?? '',
          roles: u.roles,
          active: u.active,
          hasPassword: Boolean(u.password),
          lastLogin: u.lastLoginAt
            ? u.lastLoginAt.toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
            : null,
        }))}
      />
    </div>
  )
}
