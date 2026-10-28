import { randomBytes } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/dal'
import { CALLBACK_PATH } from '@/lib/auth/googleOAuth'
import { CALENDAR_STATE_COOKIE, calendarAuthUrl, isOAuthConfigured } from '@/lib/sav/calendar'

/** « Connecter l'agenda » : envoie vers Google, où l'on autorise Kingso à écrire dans l'agenda du planning. */
export async function GET(request: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  if (!isOAuthConfigured()) {
    return NextResponse.redirect(new URL('/admin/sav/reglages?agenda=Identifiants OAuth Google absents#agenda', request.url))
  }
  const state = randomBytes(16).toString('hex')
  const response = NextResponse.redirect(calendarAuthUrl(`${request.nextUrl.origin}${CALLBACK_PATH}`, state))
  response.cookies.set(CALENDAR_STATE_COOKIE, state, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 600, path: '/api/auth/google' })
  return response
}
