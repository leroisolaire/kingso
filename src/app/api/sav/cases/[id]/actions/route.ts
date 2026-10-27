import { NextRequest, NextResponse } from 'next/server'
import type { SavStatus } from '@prisma/client'
import { getSession } from '@/lib/auth/dal'
import { db } from '@/lib/db/client'
import { currentAuthor } from '@/lib/sav/author'
import { linkClient } from '@/lib/sav/clientSync'
import { addSavEvent } from '@/lib/sav/events'
import { prepareEmail } from '@/lib/sav/ingest'
import { formatParisDate } from '@/lib/sav/schedule'
import { cancelCaseEmail, sendCaseEmail } from '@/lib/sav/send'
import { STATUS_LABELS } from '@/lib/sav/status'
import { TEMPLATE_KEYS, type TemplateKey } from '@/lib/sav/templates'

export const maxDuration = 60

/** Actions de l'équipe sur un dossier (email, appel, planification, statut, note). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSession())) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const author = await currentAuthor()
  const c = await db.savCase.findUnique({ where: { id }, select: { id: true, status: true } })
  if (!c) return NextResponse.json({ error: 'Dossier introuvable.' }, { status: 404 })

  const setStatus = (status: SavStatus, extra: Record<string, unknown> = {}) =>
    db.savCase.update({ where: { id }, data: { status, ...extra } })
  const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 2000) : null

  try {
    switch (body.action) {
      case 'send':
        return NextResponse.json({ ok: true, scheduledAt: await sendCaseEmail(id, author) })
      case 'cancel_email':
        await cancelCaseEmail(id, 'Annulé par l\'équipe', author)
        break
      case 'prepare':
        if (!TEMPLATE_KEYS.includes(body.template)) throw new Error('Modèle inconnu.')
        await cancelCaseEmail(id, 'Remplacé par un autre modèle', author).catch(() => false)
        await db.savCase.update({ where: { id }, data: { emailSentAt: null, emailMessageId: null } })
        await prepareEmail(id, body.template as TemplateKey, author)
        break
      case 'skip_email':
        await db.savCase.update({ where: { id }, data: { emailTemplate: null, emailSubject: null, emailBody: null, emailScheduledAt: null } })
        if (c.status === 'NEW') await setStatus('TO_CALL')
        await addSavEvent(id, 'EMAIL_SKIPPED', 'Pas d\'email pour ce dossier', author)
        break
      case 'call_resolved':
        await setStatus('RESOLVED', { resolvedAt: new Date(), urgent: false })
        await addSavEvent(id, 'CALL_RESOLVED', note, author)
        break
      case 'call_intervention':
        await setStatus('TO_SCHEDULE')
        await addSavEvent(id, 'CALL_INTERVENTION', note, author)
        break
      case 'call_unreachable':
        await addSavEvent(id, 'CALL_UNREACHABLE', note, author)
        break
      case 'schedule': {
        const at = new Date(body.appointmentAt)
        if (Number.isNaN(at.getTime())) throw new Error('Date de rendez-vous invalide.')
        await setStatus('SCHEDULED', { appointmentAt: at })
        await addSavEvent(id, 'SCHEDULED', `Rendez-vous le ${formatParisDate(at, true)}${note ? ` — ${note}` : ''}`, author)
        break
      }
      case 'status': {
        const status = body.status as SavStatus
        if (!(status in STATUS_LABELS)) throw new Error('Statut inconnu.')
        await setStatus(status, status === 'RESOLVED' ? { resolvedAt: new Date() } : {})
        await addSavEvent(id, 'STATUS', STATUS_LABELS[status], author)
        break
      }
      case 'urgent':
        await db.savCase.update({ where: { id }, data: { urgent: Boolean(body.urgent) } })
        await addSavEvent(id, 'EDITED', body.urgent ? 'Marqué urgent' : 'Urgence retirée', author)
        break
      case 'link_client': {
        const client = typeof body.clientId === 'string' ? await db.savClient.findUnique({ where: { id: body.clientId } }) : null
        if (!client) throw new Error('Client introuvable dans le fichier.')
        await linkClient(id, client, 'Choisi par l\'équipe parmi les clients possibles', author)
        break
      }
      case 'note':
        if (!note) throw new Error('Note vide.')
        await addSavEvent(id, 'NOTE', note, author)
        break
      default:
        throw new Error('Action inconnue.')
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 })
  }
}
