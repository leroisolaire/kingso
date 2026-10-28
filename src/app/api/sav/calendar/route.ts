import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/dal'
import { disconnectCalendar, listCalendars, updateCalendarSettings } from '@/lib/sav/calendar'

/** Agendas modifiables du compte connecté (pour choisir celui du planning). */
export async function GET() {
  if (!(await getSession())) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  try {
    return NextResponse.json({ calendars: await listCalendars() })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 })
  }
}

/** Agenda du planning : choisir l'agenda et la durée, ou déconnecter. */
export async function POST(request: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  try {
    if (body.action === 'disconnect') {
      await disconnectCalendar()
      return NextResponse.json({ ok: true })
    }
    if (body.action === 'settings') {
      await updateCalendarSettings({
        calendarId: typeof body.calendarId === 'string' ? body.calendarId : undefined,
        durationMinutes: body.durationMinutes === undefined ? undefined : Number(body.durationMinutes),
      })
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ error: 'Action inconnue.' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 })
  }
}
