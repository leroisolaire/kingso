import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { getSession } from '@/lib/auth/dal'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSession())) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  const { id } = await params
  const data = await request.json()
  const source = await db.webSource.update({ where: { id }, data })
  return NextResponse.json(source)
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSession())) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  const { id } = await params
  await db.webSource.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
