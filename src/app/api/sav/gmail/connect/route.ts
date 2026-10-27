import { randomBytes } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/dal'
import { authUrl, isOAuthConfigured } from '@/lib/sav/gmail'

/** « Connecter la boîte kingso@ » : envoie vers Google, où l'on se connecte avec kingso@ et autorise la lecture. */
export async function GET(request: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  if (!isOAuthConfigured()) {
    return NextResponse.redirect(new URL('/admin/sav/reglages?gmail=Identifiants OAuth Google absents', request.url))
  }
  const state = randomBytes(16).toString('hex')
  const response = NextResponse.redirect(authUrl(`${request.nextUrl.origin}/api/auth/google/callback`, state))
  response.cookies.set('gmail_oauth_state', state, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 600, path: '/api/auth/google' })
  return response
}
