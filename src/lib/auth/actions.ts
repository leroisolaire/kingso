'use server'

import bcrypt from 'bcryptjs'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db/client'
import { homeFor } from '@/lib/auth/permissions'
import { createSession, deleteSession } from '@/lib/auth/session'

export type LoginState = { error?: string } | undefined

/** Connexion de secours par mot de passe (les collaborateurs se connectent avec Google). */
export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const password = String(formData.get('password') ?? '')

  if (!email || !password) {
    return { error: 'Email et mot de passe requis.' }
  }

  const user = await db.user.findUnique({ where: { email } })
  if (!user?.password || !(await bcrypt.compare(password, user.password))) {
    return { error: 'Identifiants incorrects.' }
  }
  if (!user.active || user.roles.length === 0) {
    return { error: 'Ce compte n\'a pas accès au back-office.' }
  }

  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
  await createSession({ userId: user.id, email: user.email, roles: user.roles, v: user.sessionVersion })
  redirect(homeFor(user.roles))
}

export async function logout() {
  await deleteSession()
  redirect('/admin/login')
}
