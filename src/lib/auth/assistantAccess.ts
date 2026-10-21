import 'server-only'
import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

// Accès aux chats protégés par mot de passe : un cookie par chat, lié à son id.
const encodedKey = new TextEncoder().encode(process.env.SESSION_SECRET)
const cookieName = (assistantId: string) => `assistant_access_${assistantId}`

export async function grantAssistantAccess(assistantId: string) {
  const token = await new SignJWT({ assistantId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(encodedKey)

  const cookieStore = await cookies()
  cookieStore.set(cookieName(assistantId), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  })
}

export async function hasAssistantAccess(assistantId: string): Promise<boolean> {
  const token = (await cookies()).get(cookieName(assistantId))?.value
  if (!token) return false
  try {
    const { payload } = await jwtVerify(token, encodedKey, { algorithms: ['HS256'] })
    return payload.assistantId === assistantId
  } catch {
    return false
  }
}
