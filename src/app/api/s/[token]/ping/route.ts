import { NextResponse } from 'next/server'
import { getCaseByToken, recordPresence } from '@/lib/sav/caseAccess'

/** Signal de présence de la page du client (lien personnel) : « en ligne » dans l'espace SAV. */
export async function POST(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const c = await getCaseByToken((await params).token)
  if (!c) return NextResponse.json({ error: 'Lien expiré.' }, { status: 404 })
  await recordPresence(c.id)
  return new NextResponse(null, { status: 204 })
}
