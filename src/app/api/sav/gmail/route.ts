import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/dal'
import { checkMailbox, disconnect, renewWatch } from '@/lib/sav/gmail'

export const maxDuration = 300

/** Boîte kingso@ : relever maintenant, ou déconnecter. */
export async function POST(request: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  const { action } = await request.json().catch(() => ({}))
  if (action === 'disconnect') {
    await disconnect()
    return NextResponse.json({ ok: true })
  }
  if (action === 'check') {
    const result = await checkMailbox(250_000)
    // Notification instantanée : réactivée à chaque relevé manuel si elle a expiré
    await renewWatch().catch(() => null)
    if (result.status === 'error') return NextResponse.json({ error: result.error }, { status: 400 })
    if (result.status === 'not-connected') return NextResponse.json({ error: 'Boîte non connectée.' }, { status: 400 })
    return NextResponse.json(result)
  }
  return NextResponse.json({ error: 'Action inconnue.' }, { status: 400 })
}
