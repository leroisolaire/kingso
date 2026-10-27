import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/dal'
import { syncClientFile } from '@/lib/sav/clientSync'

export const maxDuration = 120

/** « Importer maintenant » : relit le fichier client du Drive même s'il n'a pas changé. */
export async function POST() {
  if (!(await getSession())) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  const state = await syncClientFile(true)
  if (state.status === 'not-configured') return NextResponse.json({ error: 'Indiquez d\'abord le dossier Drive du fichier client.' }, { status: 400 })
  if (state.status === 'error') return NextResponse.json({ error: state.error }, { status: 400 })
  return NextResponse.json(state)
}
