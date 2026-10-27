import { after, NextRequest, NextResponse } from 'next/server'
import { checkMailbox } from '@/lib/sav/gmail'

export const maxDuration = 300

/**
 * Notification Gmail (abonnement Pub/Sub « push ») : un email est arrivé dans la boîte kingso@.
 * On répond tout de suite (sinon Google renvoie la notification) et on relève la boîte ensuite.
 * L'adresse contient un jeton secret (GMAIL_PUSH_TOKEN) : la notification elle-même ne transporte aucun contenu.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.GMAIL_PUSH_TOKEN
  if (!secret || request.nextUrl.searchParams.get('token') !== secret) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 })
  }
  after(() => checkMailbox(270_000).catch(() => null))
  return new NextResponse(null, { status: 204 })
}
