import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/dal'
import { db } from '@/lib/db/client'
import { parseTechnicianInput } from '@/lib/sav/technicianInput'

/** Modifie une fiche intervenant (compétences, secteur, repères agenda, actif…). */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSession())) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  const { id } = await params
  if (!(await db.technician.count({ where: { id } }))) return NextResponse.json({ error: 'Fiche introuvable.' }, { status: 404 })
  const body = await request.json().catch(() => ({}))
  try {
    await db.technician.update({ where: { id }, data: await parseTechnicianInput(body, id) })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 })
  }
}

/** Supprime une fiche jamais affectée à un dossier (sinon : la désactiver, pour garder l'historique). */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSession())) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  const { id } = await params
  if (await db.savCase.count({ where: { technicianId: id } })) {
    return NextResponse.json({ error: 'Cet intervenant a des dossiers : désactivez sa fiche plutôt que de la supprimer.' }, { status: 400 })
  }
  await db.technician.delete({ where: { id } }).catch(() => null)
  return NextResponse.json({ ok: true })
}
