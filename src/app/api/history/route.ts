import { NextResponse } from 'next/server'
import { getAllHistory } from '@/lib/db/queries/history'

export async function GET() {
  try {
    const history = await getAllHistory()
    return NextResponse.json(history)
  } catch (error) {
    console.error('[GET /api/history]', error)
    return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
