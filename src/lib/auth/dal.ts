import 'server-only'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { decrypt, type SessionPayload } from '@/lib/auth/session'
import { db } from '@/lib/db/client'

export const getSession = cache(async (): Promise<SessionPayload | null> => {
  const cookie = (await cookies()).get('session')?.value
  const session = await decrypt(cookie)
  return session ?? null
})

export const verifySession = cache(async (): Promise<SessionPayload> => {
  const session = await getSession()
  if (!session) {
    redirect('/admin/login')
  }
  return session
})

export const getCurrentUser = cache(async () => {
  const session = await verifySession()
  return db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, email: true, name: true, role: true },
  })
})
