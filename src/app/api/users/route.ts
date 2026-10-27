import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { LOGIN_DOMAIN } from '@/lib/auth/permissions'
import { normalizeEmail, parseRoles, requireSuperAdmin } from '@/lib/auth/users'

/** Ouvre l'accès au back-office à un collaborateur (il se connectera avec son compte Google). */
export async function POST(request: NextRequest) {
  if (!(await requireSuperAdmin())) return NextResponse.json({ error: 'Réservé au Super admin.' }, { status: 403 })
  const body = await request.json().catch(() => ({}))
  const email = normalizeEmail(body.email)
  if (!email) return NextResponse.json({ error: `Adresse invalide : un compte @${LOGIN_DOMAIN} est attendu.` }, { status: 400 })
  const roles = parseRoles(body.roles)
  if (!roles?.length) return NextResponse.json({ error: 'Choisissez au moins un rôle.' }, { status: 400 })
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 100) : null

  const existing = await db.user.findUnique({ where: { email } })
  if (existing) return NextResponse.json({ error: 'Ce collaborateur a déjà un compte : modifiez-le dans la liste.' }, { status: 400 })
  const user = await db.user.create({ data: { email, name, roles }, select: { id: true } })
  return NextResponse.json(user)
}
