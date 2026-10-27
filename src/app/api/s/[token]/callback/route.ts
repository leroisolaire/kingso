import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { getCaseByToken } from '@/lib/sav/caseAccess'
import { addSavEvent } from '@/lib/sav/events'

/** Le client demande à être rappelé depuis son chat personnel : ses coordonnées sont déjà dans le dossier. */
export async function POST(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const c = await getCaseByToken((await params).token)
  if (!c) return NextResponse.json({ error: 'Lien expiré.' }, { status: 404 })
  if (['NEW', 'WAITING', 'IN_CHAT', 'RESOLVED'].includes(c.status)) {
    await db.savCase.update({ where: { id: c.id }, data: { status: 'TO_CALL', resolvedAt: null } })
    await addSavEvent(c.id, 'CALLBACK_REQUESTED', 'Le client demande à être rappelé (depuis son chat)')
  }
  return NextResponse.json({ ok: true })
}
