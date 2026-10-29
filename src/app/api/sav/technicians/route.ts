import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { getSession } from '@/lib/auth/dal'
import { db } from '@/lib/db/client'
import { parseTechnicianInput } from '@/lib/sav/technicianInput'

/** Nouvelle fiche intervenant (technicien SAV ou poseur). */
export async function POST(request: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  try {
    const data = await parseTechnicianInput({ kind: 'SAV', ...body, name: body.name ?? '' }, null)
    const created = await db.technician.create({ data: data as Prisma.TechnicianUncheckedCreateInput, select: { id: true } })
    return NextResponse.json(created)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 })
  }
}
