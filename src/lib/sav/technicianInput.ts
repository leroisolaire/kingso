import 'server-only'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db/client'
import { normalizePhone } from './phone'
import { toRating } from './rating'
import { cleanCodes, serializeSkillLevels } from './skills'

/** Champs d'une fiche intervenant envoyés par la page Intervenants, vérifiés (seulement ceux présents). */
export async function parseTechnicianInput(body: Record<string, unknown>, currentId: string | null): Promise<Prisma.TechnicianUncheckedUpdateInput> {
  const data: Prisma.TechnicianUncheckedUpdateInput = {}
  if ('name' in body) {
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : ''
    if (!name) throw new Error('Indiquez le nom.')
    data.name = name
  }
  if ('kind' in body) {
    if (body.kind !== 'SAV' && body.kind !== 'POSEUR') throw new Error('Type d’intervenant invalide.')
    data.kind = body.kind
    if (body.kind === 'POSEUR') data.userId = null // les poseurs n'ont pas de compte
  }
  if ('phone' in body) {
    const raw = typeof body.phone === 'string' ? body.phone.trim() : ''
    const phone = raw ? normalizePhone(raw) : null
    if (raw && !phone) throw new Error('Numéro de téléphone illisible.')
    data.phone = phone
  }
  if ('userId' in body && body.kind !== 'POSEUR') {
    const userId = typeof body.userId === 'string' && body.userId ? body.userId : null
    if (userId) {
      if (!(await db.user.count({ where: { id: userId } }))) throw new Error('Compte introuvable.')
      const other = await db.technician.findUnique({ where: { userId }, select: { id: true, name: true } })
      if (other && other.id !== currentId) throw new Error(`Ce compte est déjà relié à la fiche de ${other.name}.`)
    }
    data.userId = userId
  }
  // Compétences notées de 1 à 5 : { PAC: 4, CLIM: null } (null = cochée, pas encore notée)
  if ('skills' in body) data.skills = serializeSkillLevels(body.skills)
  if ('maxDifficulty' in body) data.maxDifficulty = toRating(body.maxDifficulty)
  if ('sector' in body) data.sector = typeof body.sector === 'string' && body.sector.trim() ? body.sector.trim().slice(0, 200) : null
  if ('agendaCodes' in body) data.agendaCodes = cleanCodes(body.agendaCodes)
  if (typeof body.active === 'boolean') data.active = body.active
  return data
}
