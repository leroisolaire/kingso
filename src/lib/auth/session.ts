import 'server-only'
import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import type { UserRole } from '@/lib/auth/permissions'

export interface SessionPayload {
  userId: string
  email: string
  roles: UserRole[]
  /** Version de session du compte : une session plus ancienne (rôles changés, compte désactivé) est refusée */
  v: number
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

export const SESSION_COOKIE = {
  name: COOKIE_NAME,
  options: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  },
}

export async function createSession(payload: SessionPayload) {
  const session = await encrypt(payload)
  const cookieStore = await cookies()
  cookieStore.set(COOKIE_NAME, session, SESSION_COOKIE.options)
}

export async function deleteSession() {
  const cookieStore = await cookies()
  cookieStore.delete(COOKIE_NAME)
}
