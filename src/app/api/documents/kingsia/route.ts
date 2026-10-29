import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/dal'
import { getKingsiaLog } from '@/lib/kingsia/ingest'

/** Journal des mails « kingsia » (ajouts à la base documentaire par email). */
export async function GET() {
  if (!(await getSession())) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  return NextResponse.json({ entries: await getKingsiaLog() }, { headers: { 'Cache-Control': 'no-store' } })
}
