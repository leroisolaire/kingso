import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { decrypt } from '@/lib/auth/session'

const PROTECTED_API_PREFIXES = [
  '/api/documents',
  '/api/categories',
  '/api/faq',
  '/api/history',
  '/api/sources',
]

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const cookie = request.cookies.get('session')?.value
  const session = await decrypt(cookie)
  const isAuthenticated = Boolean(session?.userId)

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
    return NextResponse.redirect(new URL('/admin', request.url))
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
  ],
}
