import { NextResponse } from 'next/server'
import { getAllHistory } from '@/lib/db/queries/history'
import { getSession } from '@/lib/auth/dal'

export async function GET() {
  if (!(await getSession())) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  try {
    const history = await getAllHistory()
    return NextResponse.json(history)
  } catch (error) {
    console.error('[GET /api/history]', error)
    return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
