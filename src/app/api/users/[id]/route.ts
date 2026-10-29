import bcrypt from 'bcryptjs'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { isGoogleEmail, otherActiveSuperAdmins, parseRoles, passwordError, requireSuperAdmin } from '@/lib/auth/users'
import { syncTechnicianForUser } from '@/lib/sav/technicians'

/** Modifie un compte : nom, rôles, actif, mot de passe. Changer les rôles ou désactiver ferme ses sessions ouvertes. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await requireSuperAdmin()
  if (!me) return NextResponse.json({ error: 'Réservé au Super admin.' }, { status: 403 })
  const { id } = await params
  const user = await db.user.findUnique({ where: { id } })
  if (!user) return NextResponse.json({ error: 'Compte introuvable.' }, { status: 404 })
  const body = await request.json().catch(() => ({}))

  const data: { name?: string | null; roles?: typeof user.roles; active?: boolean; password?: string | null; sessionVersion?: { increment: number } } = {}

  // Mot de passe attribué (personne sans compte Google) : le changer ferme ses sessions ouvertes
  if ('password' in body) {
    if (body.password === null) {
      if (!isGoogleEmail(user.email)) {
        return NextResponse.json({ error: 'Ce compte ne peut se connecter qu\'avec son mot de passe : changez-le ou désactivez le compte.' }, { status: 400 })
      }
      data.password = null
    } else {
      const error = passwordError(body.password)
      if (error) return NextResponse.json({ error }, { status: 400 })
      data.password = await bcrypt.hash(body.password, 10)
    }
    if (id !== me.userId) data.sessionVersion = { increment: 1 }
  }
  if ('name' in body) data.name = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 100) : null
  if ('roles' in body) {
    const roles = parseRoles(body.roles)
    if (!roles) return NextResponse.json({ error: 'Rôles invalides.' }, { status: 400 })
    data.roles = roles
  }
  if (typeof body.active === 'boolean') data.active = body.active

  // Garde-fous : on ne se retire pas soi-même l'accès, et il reste toujours un Super admin actif
  const losesSuperAdmin = (data.roles && !data.roles.includes('SUPER_ADMIN')) || data.active === false
  if (losesSuperAdmin && user.roles.includes('SUPER_ADMIN')) {
    if (id === me.userId) return NextResponse.json({ error: 'Vous ne pouvez pas retirer votre propre accès Super admin.' }, { status: 400 })
    if ((await otherActiveSuperAdmins(id)) === 0) return NextResponse.json({ error: 'Il doit rester au moins un Super admin actif.' }, { status: 400 })
  }

  const rolesChanged = data.roles && (data.roles.length !== user.roles.length || data.roles.some((r) => !user.roles.includes(r)))
  if (rolesChanged || data.active === false) data.sessionVersion = { increment: 1 }
  const updated = await db.user.update({ where: { id }, data })
  // Rôle Technicien donné ou retiré, compte désactivé : sa fiche intervenant suit
  if (data.roles || typeof data.active === 'boolean') await syncTechnicianForUser(updated)
  return NextResponse.json({ ok: true })
}
