import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/dal'
import { CALLBACK_PATH, completeLogin, LOGIN_STATE_COOKIE } from '@/lib/auth/googleOAuth'
import { SESSION_COOKIE } from '@/lib/auth/session'
import { currentAuthor } from '@/lib/sav/author'
import { completeConnection } from '@/lib/sav/gmail'

// Retour de Google, pour les deux usages de l'identifiant OAuth (une seule adresse de retour à déclarer) :
// connexion d'un collaborateur au back-office, ou autorisation de lecture de la boîte kingso@.

const GMAIL_STATE_COOKIE = 'gmail_oauth_state'

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const redirectUri = `${request.nextUrl.origin}${CALLBACK_PATH}`
  const state = params.get('state')
  const loginState = request.cookies.get(LOGIN_STATE_COOKIE)?.value
  const gmailState = request.cookies.get(GMAIL_STATE_COOKIE)?.value

  const go = (path: string) => {
    const response = NextResponse.redirect(new URL(path, request.url))
    response.cookies.delete({ name: LOGIN_STATE_COOKIE, path: '/api/auth/google' })
    response.cookies.delete({ name: GMAIL_STATE_COOKIE, path: '/api/auth/google' })
    return response
  }
  const message = (error: unknown) => encodeURIComponent(error instanceof Error ? error.message : String(error))

  // ── Connexion au back-office ──
  if (state && loginState && state === loginState) {
    if (params.get('error')) return go('/admin/login?erreur=Connexion annulée')
    const code = params.get('code')
    if (!code) return go('/admin/login?erreur=Réponse de Google incomplète')
    try {
      const { home, session } = await completeLogin(code, redirectUri)
      const response = go(home)
      response.cookies.set(SESSION_COOKIE.name, session, SESSION_COOKIE.options)
      return response
    } catch (error) {
      return go(`/admin/login?erreur=${message(error)}`)
    }
  }

  // ── Autorisation de la boîte kingso@ (depuis les réglages SAV, par un administrateur connecté) ──
  const back = (text: string) => go(`/admin/sav/reglages?gmail=${encodeURIComponent(text)}`)
  if (!(await getSession())) return go('/admin/login')
  if (params.get('error')) return back(`Autorisation refusée (${params.get('error')})`)
  if (!state || !gmailState || state !== gmailState) return back('Connexion expirée : recommencez')
  const code = params.get('code')
  if (!code) return back('Réponse de Google incomplète')
  try {
    await completeConnection(code, redirectUri, await currentAuthor())
    return back('ok')
  } catch (error) {
    return back(error instanceof Error ? error.message : String(error))
  }
}
