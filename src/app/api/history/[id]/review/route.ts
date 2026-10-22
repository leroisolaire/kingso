import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/dal'
import { db } from '@/lib/db/client'

interface Params {
  params: Promise<{ id: string }>
}

/** Marque un échange comme traité par l'équipe (ou le remet « à traiter »). */
export async function POST(request: NextRequest, { params }: Params) {
  if (!(await getSession())) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  const { id } = await params
  const { reviewed } = await request.json().catch(() => ({ reviewed: true }))
  await db.history.update({ where: { id }, data: { reviewedAt: reviewed === false ? null : new Date() } })
  return NextResponse.json({ ok: true })
}
