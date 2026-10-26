import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/dal'
import { checkVideoSources } from '@/lib/videos/pipeline'

export const maxDuration = 300

/** Récupère les nouvelles vidéos des chaînes suivies et les fait trier par Kingso. */
export async function POST() {
  if (!(await getSession())) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  try {
    return NextResponse.json(await checkVideoSources())
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
