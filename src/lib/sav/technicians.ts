import 'server-only'
import { db } from '@/lib/db/client'

export interface Technician { id: string; name: string }

/** Techniciens actifs (rôle Technicien), dans un ordre stable : leur couleur sur le planning en dépend. */
export async function getTechnicians(): Promise<Technician[]> {
  const users = await db.user.findMany({
    where: { active: true, roles: { has: 'TECHNICIAN' } },
    select: { id: true, name: true, email: true },
    orderBy: { createdAt: 'asc' },
  })
  return users.map((u) => ({ id: u.id, name: u.name || u.email }))
}

/** Technicien demandé pour un rendez-vous : null pour « aucun », erreur si ce n'est pas un technicien actif. */
export async function checkTechnician(id: unknown): Promise<string | null> {
  if (id === null || id === '') return null
  if (typeof id !== 'string') throw new Error('Technicien invalide.')
  const ok = await db.user.count({ where: { id, active: true, roles: { has: 'TECHNICIAN' } } })
  if (!ok) throw new Error('Ce technicien n’existe pas ou n’est plus actif.')
  return id
}
