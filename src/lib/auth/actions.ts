'use server'

import bcrypt from 'bcryptjs'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db/client'
import { createSession, deleteSession } from '@/lib/auth/session'

export type LoginState = { error?: string } | undefined

export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const password = String(formData.get('password') ?? '')

  if (!email || !password) {
    return { error: 'Email et mot de passe requis.' }
  }

  const user = await db.user.findUnique({ where: { email } })
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return { error: 'Identifiants incorrects.' }
  }

  await createSession({ userId: user.id, email: user.email, role: user.role })
  redirect('/admin')
}

export async function logout() {
  await deleteSession()
  redirect('/admin/login')
}
