import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/dal'
import { processSelectedVideos } from '@/lib/videos/pipeline'

// Gemini lit chaque vidéo (jusqu'à une minute par vidéo) : relancé tant qu'il en reste
export const maxDuration = 300

/** Rédige les fiches des vidéos retenues et les dépose dans « A trier ». */
export async function POST() {
  if (!(await getSession())) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  try {
    return NextResponse.json(await processSelectedVideos(240_000))
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
