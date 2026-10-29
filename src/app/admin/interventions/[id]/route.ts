import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/dal'
import { db } from '@/lib/db/client'
import { ensureTechToken } from '@/lib/sav/technicians'

/**
 * Ouvre la fiche d'une intervention (même page que le lien des poseurs, /i/…) : pour l'intervenant affecté,
 * ou pour le SAV et le planning.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.redirect(new URL('/admin/login', request.url))
  const { id } = await params
  const c = await db.savCase.findUnique({ where: { id }, select: { id: true, technician: { select: { userId: true } } } })
  const staff = session.roles.some((r) => r === 'SUPER_ADMIN' || r === 'SAV' || r === 'PLANNING')
  if (!c?.technician || (!staff && c.technician.userId !== session.userId)) {
    return NextResponse.redirect(new URL('/admin/interventions', request.url))
  }
  const token = await ensureTechToken(c.id)
  return NextResponse.redirect(new URL(`/i/${token}`, request.url))
}
