import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/dal'
import { processDriveQueue } from '@/lib/drive/sync'

// Téléchargement + lecture + indexation : jusqu'à 5 minutes par appel, relancé tant qu'il en reste
export const maxDuration = 300

/** Étape 2 : traite les documents Drive en attente. */
export async function POST() {
  if (!(await getSession())) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  try {
    return NextResponse.json(await processDriveQueue(240_000))
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
