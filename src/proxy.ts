import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { canAccess, homeFor, sessionRoles } from '@/lib/auth/permissions'
import { decrypt } from '@/lib/auth/session'

// Premier filtre du back-office (cookie signé + droits du rôle). Le compte (actif, rôles à jour) est
// revérifié en base par getSession() dans chaque page et chaque route.

const PROTECTED_API_PREFIXES = [
  '/api/documents',
  '/api/categories',
  '/api/faq',
  '/api/history',
  '/api/sources',
  '/api/assistants',
  '/api/drive',
  '/api/videos',
  '/api/sav',
  '/api/users',
]

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const cookie = request.cookies.get('session')?.value
  const session = await decrypt(cookie)
  const roles = sessionRoles(session)
  const isAuthenticated = Boolean(session?.userId) && roles.length > 0

  const isApiRoute = PROTECTED_API_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  const isLoginPage = pathname === '/admin/login'
  const isAdminPage = pathname.startsWith('/admin') && !isLoginPage

  if (isApiRoute && !isAuthenticated) {
    return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  }

  if (isAdminPage && !isAuthenticated) {
    return NextResponse.redirect(new URL('/admin/login', request.url))
  }

  if (isLoginPage && isAuthenticated) {
    return NextResponse.redirect(new URL(homeFor(roles), request.url))
  }

  // Droits du rôle : page d'accueil du compte pour une page non permise, refus pour une API
  if (isApiRoute && !canAccess(roles, pathname, request.method)) {
    return NextResponse.json({ error: 'Accès non autorisé pour votre rôle.' }, { status: 403 })
  }
  if (isAdminPage && !canAccess(roles, pathname)) {
    return NextResponse.redirect(new URL(homeFor(roles), request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/api/documents/:path*',
    '/api/categories/:path*',
    '/api/faq/:path*',
    '/api/history/:path*',
    '/api/sources/:path*',
    '/api/assistants/:path*',
    '/api/drive/:path*',
    '/api/videos/:path*',
    '/api/sav/:path*',
    '/api/users/:path*',
  ],
}
