import 'server-only'
import { randomBytes } from 'node:crypto'
import { db } from '@/lib/db/client'
import type { TechnicianKind } from './skills'

// Intervenants : fiches Technician (techniciens SAV, reliés à un compte de connexion, et poseurs, sans compte).
// Les dossiers sont affectés à une fiche (SavCase.technicianId).

export interface Technician { id: string; name: string; kind: TechnicianKind; userId: string | null; phone: string | null }

/** Intervenants actifs, dans un ordre stable : leur couleur sur le planning en dépend. */
export async function getTechnicians(): Promise<Technician[]> {
  return db.technician.findMany({
    where: { active: true },
    select: { id: true, name: true, kind: true, userId: true, phone: true },
    orderBy: { createdAt: 'asc' },
  })
}

/** Intervenant demandé pour un rendez-vous : null pour « aucun », erreur si ce n'est pas un intervenant actif. */
export async function checkTechnician(id: unknown): Promise<string | null> {
  if (id === null || id === '') return null
  if (typeof id !== 'string') throw new Error('Intervenant invalide.')
  const ok = await db.technician.count({ where: { id, active: true } })
  if (!ok) throw new Error('Cet intervenant n’existe pas ou n’est plus actif.')
  return id
}

export async function technicianName(id: string | null): Promise<string> {
  if (!id) return 'Aucun intervenant'
  const t = await db.technician.findUnique({ where: { id }, select: { name: true, kind: true } })
  return t ? `${t.name}${t.kind === 'POSEUR' ? ' (poseur)' : ''}` : 'Intervenant'
}

/** Fiche intervenant du compte connecté (technicien SAV), sinon null. */
export async function technicianIdOfUser(userId: string): Promise<string | null> {
  const t = await db.technician.findUnique({ where: { userId }, select: { id: true } })
  return t?.id ?? null
}

/**
 * Rôle Technicien donné ou retiré dans Utilisateurs : la fiche intervenant du compte est créée (ou réactivée) pour
 * qu'il apparaisse au planning, ou désactivée (les dossiers passés gardent son nom).
 */
export async function syncTechnicianForUser(user: { id: string; name: string | null; email: string; roles: readonly string[]; active: boolean }) {
  const existing = await db.technician.findUnique({ where: { userId: user.id }, select: { id: true, active: true } })
  const wanted = user.active && user.roles.includes('TECHNICIAN')
  if (!wanted) {
    if (existing?.active) await db.technician.update({ where: { id: existing.id }, data: { active: false } })
    return
  }
  if (existing) {
    if (!existing.active) await db.technician.update({ where: { id: existing.id }, data: { active: true } })
    return
  }
  await db.technician.create({ data: { name: user.name || user.email, kind: 'SAV', userId: user.id } })
}

export function interventionLink(token: string): string {
  return `${process.env.KINGSO_PUBLIC_URL ?? 'https://kingso.fr'}/i/${token}`
}

/** Lien personnel de l'intervenant affecté au dossier (créé au premier besoin). */
export async function ensureTechToken(caseId: string): Promise<string> {
  const c = await db.savCase.findUniqueOrThrow({ where: { id: caseId }, select: { techToken: true, technicianId: true } })
  if (!c.technicianId) throw new Error('Affectez d’abord un intervenant.')
  if (c.techToken) return c.techToken
  const token = randomBytes(18).toString('base64url')
  await db.savCase.update({ where: { id: caseId }, data: { techToken: token } })
  return token
}

const LINK_DAYS_AFTER = 7

/**
 * Dossier ouvert par le lien d'un intervenant : null si le lien est inconnu, si l'intervenant a changé (nouveau lien),
 * ou plus de 7 jours après l'intervention (ou après son retour).
 */
export async function getInterventionByToken(token: string | null | undefined) {
  if (!token || token.length < 16 || token.length > 64) return null
  const c = await db.savCase.findUnique({
    where: { techToken: token },
    include: {
      technician: { select: { id: true, name: true, kind: true, active: true } },
      messages: { orderBy: { receivedAt: 'asc' }, select: { photos: true, text: true, receivedAt: true, source: true } },
    },
  })
  if (!c || !c.technician?.active || c.status === 'CLOSED') return null
  const limit = LINK_DAYS_AFTER * 24 * 3600_000
  const now = Date.now()
  if (c.appointmentAt && now > c.appointmentAt.getTime() + (c.appointmentMinutes ?? 0) * 60_000 + limit) return null
  if (c.techReportAt && now > c.techReportAt.getTime() + limit) return null
  return c
}
