import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { getCaseByToken } from '@/lib/sav/caseAccess'
import { addSavEvent } from '@/lib/sav/events'

/** Le client indique, depuis son chat personnel, que son problème est résolu. */
export async function POST(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const c = await getCaseByToken((await params).token)
  if (!c) return NextResponse.json({ error: 'Lien expiré.' }, { status: 404 })
  if (c.status !== 'RESOLVED' && c.status !== 'CLOSED') {
    await db.savCase.update({ where: { id: c.id }, data: { status: 'RESOLVED', resolvedAt: new Date(), urgent: false } })
    await addSavEvent(c.id, 'RESOLVED_BY_CLIENT', 'Le client a indiqué que son problème est résolu')
  }
  return NextResponse.json({ ok: true })
}
