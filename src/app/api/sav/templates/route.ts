import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/dal'
import { db } from '@/lib/db/client'
import { getTemplates, TEMPLATE_KEYS } from '@/lib/sav/templates'

/** Modification d'un modèle d'email (texte, et « envoi direct » ou « à valider »). */
export async function PUT(request: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  if (!TEMPLATE_KEYS.includes(body.key)) return NextResponse.json({ error: 'Modèle inconnu.' }, { status: 400 })
  await getTemplates() // crée les modèles par défaut si besoin
  await db.savEmailTemplate.update({
    where: { key: body.key },
    data: {
      ...(typeof body.subject === 'string' ? { subject: body.subject.trim().slice(0, 300) } : {}),
      ...(typeof body.body === 'string' ? { body: body.body.trim().slice(0, 10000) } : {}),
      ...(typeof body.autoSend === 'boolean' ? { autoSend: body.autoSend } : {}),
    },
  })
  return NextResponse.json({ ok: true })
}
