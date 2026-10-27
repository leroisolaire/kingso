import { randomBytes } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { CALLBACK_PATH, isOAuthConfigured, LOGIN_STATE_COOKIE, loginUrl } from '@/lib/auth/googleOAuth'

/** « Se connecter avec Google » (page de connexion du back-office). */
export async function GET(request: NextRequest) {
  if (!isOAuthConfigured()) {
    return NextResponse.redirect(new URL('/admin/login?erreur=Connexion Google pas encore configurée', request.url))
  }
  const state = randomBytes(16).toString('hex')
  const response = NextResponse.redirect(loginUrl(`${request.nextUrl.origin}${CALLBACK_PATH}`, state))
  response.cookies.set(LOGIN_STATE_COOKIE, state, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 600, path: '/api/auth/google' })
  return response
}
