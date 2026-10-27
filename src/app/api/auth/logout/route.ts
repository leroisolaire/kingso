import { NextRequest, NextResponse } from 'next/server'

/** Efface une session refusée (compte désactivé, rôles changés…) et renvoie vers la connexion. */
export async function GET(request: NextRequest) {
  const expired = request.nextUrl.searchParams.get('raison') === 'session'
  const target = new URL('/admin/login', request.url)
  if (expired) target.searchParams.set('erreur', 'Votre session a expiré ou vos accès ont changé : reconnectez-vous.')
  const response = NextResponse.redirect(target)
  response.cookies.delete('session')
  return response
}
