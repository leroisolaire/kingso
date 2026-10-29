import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/dal'
import { suggestTechnicians } from '@/lib/sav/suggest'

export const maxDuration = 30

/** Intervenants proposés pour ce dossier (compétence, niveau, secteur, chantiers proches) ; ?jour=AAAA-MM-JJ : jour envisagé. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSession())) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  const { id } = await params
  try {
    const day = new URL(request.url).searchParams.get('jour')
    return NextResponse.json(await suggestTechnicians(id, day), { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 })
  }
}
