import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/dal'
import { processDocument } from '@/lib/documents/process'
import { retryDocument } from '@/lib/db/queries/documents'

// Lecture d'un gros PDF + indexation : jusqu'à 5 minutes par appel, l'appelant relance si besoin
export const maxDuration = 300

interface Params {
  params: Promise<{ id: string }>
}

/** Avance le traitement d'un document. `?retry=1` relance un document en erreur. */
export async function POST(request: NextRequest, { params }: Params) {
  if (!(await getSession())) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  try {
    const { id } = await params
    if (request.nextUrl.searchParams.get('retry') === '1') await retryDocument(id)
    return NextResponse.json(await processDocument(id, 240_000))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[POST /api/documents/:id/process]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
