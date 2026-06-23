import 'server-only'
import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import type { Role } from '@prisma/client'

export interface SessionPayload {
  userId: string
  email: string
  role: Role
}

const encodedKey = new TextEncoder().encode(process.env.SESSION_SECRET)
const COOKIE_NAME = 'session'

export async function encrypt(payload: SessionPayload) {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(encodedKey)
}

export async function decrypt(session?: string): Promise<SessionPayload | undefined> {
  if (!session) return undefined
  try {
    const { payload } = await jwtVerify(session, encodedKey, { algorithms: ['HS256'] })
    return payload as unknown as SessionPayload
  } catch {
    return undefined
  }
}

export async function createSession(payload: SessionPayload) {
  const session = await encrypt(payload)
  const cookieStore = await cookies()
  cookieStore.set(COOKIE_NAME, session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  })
}

export async function deleteSession() {
  const cookieStore = await cookies()
  cookieStore.delete(COOKIE_NAME)
}
