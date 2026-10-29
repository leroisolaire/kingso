import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/dal'
import { getNotifications, markNotificationsSeen } from '@/lib/sav/notifications'

/** Cloche du back-office : notifications de l'utilisateur connecté. */
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  const data = await getNotifications({ id: session.userId, name: session.name, email: session.email, roles: session.roles })
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
}

/** Cloche ouverte : tout est marqué comme vu. */
export async function POST() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  await markNotificationsSeen(session.userId)
  return NextResponse.json({ ok: true })
}
