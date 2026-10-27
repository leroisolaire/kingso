import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/dal'
import { currentAuthor } from '@/lib/sav/author'
import { completeConnection } from '@/lib/sav/gmail'

/** Retour de Google après l'autorisation de la boîte kingso@. */
export async function GET(request: NextRequest) {
  const back = (message: string) => {
    const response = NextResponse.redirect(new URL(`/admin/sav/reglages?gmail=${encodeURIComponent(message)}`, request.url))
    response.cookies.delete({ name: 'gmail_oauth_state', path: '/api/auth/google' })
    return response
  }
  if (!(await getSession())) return NextResponse.redirect(new URL('/admin/login', request.url))

  const params = request.nextUrl.searchParams
  if (params.get('error')) return back(`Autorisation refusée (${params.get('error')})`)
  const state = request.cookies.get('gmail_oauth_state')?.value
  if (!state || state !== params.get('state')) return back('Connexion expirée : recommencez')
  const code = params.get('code')
  if (!code) return back('Réponse de Google incomplète')

  try {
    await completeConnection(code, `${request.nextUrl.origin}/api/auth/google/callback`, await currentAuthor())
    return back('ok')
  } catch (error) {
    return back(error instanceof Error ? error.message : String(error))
  }
}
