import { NextRequest, NextResponse } from 'next/server'
import type { Prisma, SavCategory } from '@prisma/client'
import { getSession } from '@/lib/auth/dal'
import { db } from '@/lib/db/client'
import { currentAuthor } from '@/lib/sav/author'
import { addSavEvent } from '@/lib/sav/events'
import { prepareEmail } from '@/lib/sav/ingest'
import type { TemplateKey } from '@/lib/sav/templates'
import { normalizePhone } from '@/lib/sav/phone'

const TEXT_FIELDS = ['customerName', 'email', 'address', 'postalCode', 'city', 'equipment', 'urgentReason',
  'emailSubject', 'emailBody', 'clientQuestion', 'emailProblem', 'errorCode'] as const
const CATEGORIES: SavCategory[] = ['SELF_HELP', 'INTERVENTION', 'ADMIN', 'OTHER_PRODUCT', 'UNCLEAR']
const LABELS: Record<string, string> = {
  customerName: 'nom', email: 'email', address: 'adresse', postalCode: 'code postal', city: 'commune',
  equipment: 'équipement', urgentReason: 'raison de l\'urgence', clientQuestion: 'problème (chat)',
  emailProblem: 'problème (email)', errorCode: 'code erreur', summary: 'résumé', callbackPhone: 'téléphone',
  urgent: 'urgence', noHeating: 'sans chauffage', category: 'catégorie', assistant: 'chat',
}

/** Modification des informations du dossier par l'équipe. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSession())) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const data: Prisma.SavCaseUpdateInput = {}

  for (const key of TEXT_FIELDS) {
    if (typeof body[key] === 'string') data[key] = body[key].trim().slice(0, 10000) || null
  }
  if (typeof body.summary === 'string') data.summary = body.summary.trim().slice(0, 10000)
  if (typeof data.email === 'string' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    return NextResponse.json({ error: 'Adresse email invalide.' }, { status: 400 })
  }
  if (typeof body.callbackPhone === 'string') data.callbackPhone = normalizePhone(body.callbackPhone) ?? (body.callbackPhone.trim() || null)
  if (typeof body.urgent === 'boolean') data.urgent = body.urgent
  if (typeof body.noHeating === 'boolean') data.noHeating = body.noHeating
  if (CATEGORIES.includes(body.category)) data.category = body.category
  if (typeof body.assistantId === 'string') data.assistant = body.assistantId ? { connect: { id: body.assistantId } } : { disconnect: true }

  const current = await db.savCase.findUnique({ where: { id }, select: { emailSentAt: true, category: true, emailTemplate: true } })
  if (!current) return NextResponse.json({ error: 'Dossier introuvable.' }, { status: 404 })
  if (current.emailSentAt && ('emailSubject' in data || 'emailBody' in data || 'email' in data)) {
    return NextResponse.json({ error: 'L\'email est déjà envoyé ou programmé : annulez-le avant de le modifier.' }, { status: 400 })
  }

  await db.savCase.update({ where: { id }, data })
  const author = await currentAuthor()
  const changed = Object.keys(data).filter((k) => !['emailSubject', 'emailBody'].includes(k)).map((k) => LABELS[k] ?? k)
  if (changed.length) await addSavEvent(id, 'EDITED', `Modifié : ${changed.join(', ')}`, author)

  // Catégorie changée : on prépare l'email type correspondant, si aucun email n'est encore préparé
  // ou si celui en place était le modèle de l'ancienne catégorie (pas un modèle choisi à la main)
  const category = data.category as SavCategory | undefined
  if (category && category !== current.category && category !== 'UNCLEAR' && !current.emailSentAt
    && (!current.emailTemplate || current.emailTemplate === current.category)) {
    await prepareEmail(id, category as TemplateKey, author)
  }
  return NextResponse.json({ ok: true })
}
