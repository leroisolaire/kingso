import bcrypt from 'bcryptjs'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { LOGIN_DOMAIN } from '@/lib/auth/permissions'
import { normalizeEmail, normalizeLogin, parseRoles, passwordError, requireSuperAdmin } from '@/lib/auth/users'
import { syncTechnicianForUser } from '@/lib/sav/technicians'

/**
 * Ouvre l'accès au back-office à un collaborateur : avec son compte Google @domaine,
 * ou, s'il n'en a pas, avec un identifiant et un mot de passe attribués ici.
 */
export async function POST(request: NextRequest) {
  if (!(await requireSuperAdmin())) return NextResponse.json({ error: 'Réservé au Super admin.' }, { status: 403 })
  const body = await request.json().catch(() => ({}))
  const withPassword = typeof body.password === 'string' && body.password !== ''

  const email = withPassword ? normalizeLogin(body.email) : normalizeEmail(body.email)
  if (!email) {
    return NextResponse.json({
      error: withPassword
        ? 'Identifiant invalide : un email, ou un nom de connexion de 3 à 50 caractères (lettres, chiffres, point, tiret).'
        : `Adresse invalide : un compte @${LOGIN_DOMAIN} est attendu.`,
    }, { status: 400 })
  }
  if (withPassword) {
    const error = passwordError(body.password)
    if (error) return NextResponse.json({ error }, { status: 400 })
  }
  const roles = parseRoles(body.roles)
  if (!roles?.length) return NextResponse.json({ error: 'Choisissez au moins un rôle.' }, { status: 400 })
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 100) : null

  const existing = await db.user.findUnique({ where: { email } })
  if (existing) return NextResponse.json({ error: 'Ce collaborateur a déjà un compte : modifiez-le dans la liste.' }, { status: 400 })
  const password = withPassword ? await bcrypt.hash(body.password, 10) : null
  const user = await db.user.create({ data: { email, name, roles, password }, select: { id: true } })
  // Rôle Technicien : sa fiche intervenant est créée (planning, Intervenants)
  await syncTechnicianForUser({ id: user.id, name, email, roles, active: true })
  return NextResponse.json(user)
}
