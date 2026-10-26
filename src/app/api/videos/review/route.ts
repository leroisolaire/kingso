import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/dal'
import { db } from '@/lib/db/client'

const ids = (value: unknown) => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [])

/** Validation de l'équipe : vidéos retenues (fiche à rédiger) et vidéos écartées. */
export async function POST(request: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  const body = await request.json()
  const selected = ids(body.selected)
  const skipped = ids(body.skipped)
  await db.$transaction([
    db.videoItem.updateMany({ where: { id: { in: selected } }, data: { status: 'SELECTED', note: null } }),
    db.videoItem.updateMany({ where: { id: { in: skipped } }, data: { status: 'SKIPPED' } }),
  ])
  return NextResponse.json({ selected: selected.length, skipped: skipped.length })
}
