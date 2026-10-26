import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/dal'
import { db } from '@/lib/db/client'
import { addVideoSource } from '@/lib/videos/pipeline'

/** Ajoute une chaîne YouTube à suivre. */
export async function POST(request: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  try {
    const { url, visibility } = await request.json()
    if (typeof url !== 'string' || !url.trim()) return NextResponse.json({ error: 'Adresse de chaîne requise.' }, { status: 400 })
    const source = await addVideoSource(url, visibility === 'INTERNAL' ? 'INTERNAL' : 'PUBLIC')
    return NextResponse.json(source, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 })
  }
}

/** Active / désactive le suivi d'une chaîne, ou change l'espace (Public / Interne) des fiches. */
export async function PATCH(request: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  const { id, active, visibility } = await request.json()
  if (typeof id !== 'string') return NextResponse.json({ error: 'Chaîne requise.' }, { status: 400 })
  await db.videoSource.update({
    where: { id },
    data: {
      ...(typeof active === 'boolean' ? { active } : {}),
      ...(visibility === 'PUBLIC' || visibility === 'INTERNAL' ? { visibility } : {}),
    },
  })
  return NextResponse.json({ ok: true })
}

/** Ne plus suivre une chaîne (les fiches déjà créées restent dans le Drive). */
export async function DELETE(request: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Chaîne requise.' }, { status: 400 })
  await db.videoSource.delete({ where: { id } })
  return new NextResponse(null, { status: 204 })
}
