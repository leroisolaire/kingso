import { NextRequest, NextResponse } from 'next/server'
import type { SavStatus } from '@prisma/client'
import { getSession } from '@/lib/auth/dal'
import { db } from '@/lib/db/client'
import { currentAuthor } from '@/lib/sav/author'
import { syncCaseEvent, type SyncResult } from '@/lib/sav/calendar'
import { linkClient } from '@/lib/sav/clientSync'
import { addSavEvent } from '@/lib/sav/events'
import { prepareEmail } from '@/lib/sav/ingest'
import { isValidDuration } from '@/lib/sav/duration'
import { formatAppointment, parisTime } from '@/lib/sav/schedule'
import { cancelCaseEmail, sendCaseEmail } from '@/lib/sav/send'
import { STATUS_LABELS, TECH_OUTCOMES, type TechOutcome } from '@/lib/sav/status'
import { checkTechnician } from '@/lib/sav/technicians'
import { removeCasePhoto, saveCasePhoto } from '@/lib/storage/attachments'
import { TEMPLATE_KEYS, type TemplateKey } from '@/lib/sav/templates'

export const maxDuration = 60

const MAX_PHOTOS = 12
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']

/** Date du rendez-vous : jour et heure de Paris (planning) ou date ISO (champ date du navigateur). */
function appointmentDate(body: { day?: unknown; time?: unknown; appointmentAt?: unknown }): Date {
  if (typeof body.day === 'string' && typeof body.time === 'string') {
    const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(body.day)
    const t = /^(\d{2}):(\d{2})$/.exec(body.time)
    if (d && t) return parisTime(Number(d[1]), Number(d[2]), Number(d[3]), Number(t[1]), Number(t[2]))
  }
  return new Date(typeof body.appointmentAt === 'string' ? body.appointmentAt : NaN)
}

async function technicianName(id: string | null): Promise<string> {
  if (!id) return 'Aucun technicien'
  const u = await db.user.findUnique({ where: { id }, select: { name: true, email: true } })
  return u?.name || u?.email || 'Technicien'
}

/** Actions de l'équipe sur un dossier (email, appel, planification, statut, note). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSession())) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const author = await currentAuthor()
  const c = await db.savCase.findUnique({ where: { id }, select: { id: true, status: true, planningEventId: true, techPhotos: true } })
  if (!c) return NextResponse.json({ error: 'Dossier introuvable.' }, { status: 404 })

  const setStatus = (status: SavStatus, extra: Record<string, unknown> = {}) =>
    db.savCase.update({ where: { id }, data: { status, ...extra } })
  const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 2000) : null

  try {
    switch (body.action) {
      case 'send':
        return NextResponse.json({ ok: true, scheduledAt: await sendCaseEmail(id, author, { now: true }) })
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
        const at = appointmentDate(body)
        if (Number.isNaN(at.getTime())) throw new Error('Date de rendez-vous invalide.')
        // Durée et technicien : inchangés s'ils ne sont pas précisés (rendez-vous déplacé sur le planning)
        const minutes = body.durationMinutes === undefined ? undefined : Number(body.durationMinutes)
        if (minutes !== undefined && !isValidDuration(minutes)) throw new Error('Durée d’intervention invalide.')
        const technicianId = body.technicianId === undefined ? undefined : await checkTechnician(body.technicianId)
        await setStatus('SCHEDULED', {
          appointmentAt: at,
          ...(minutes !== undefined ? { appointmentMinutes: minutes } : {}),
          ...(technicianId !== undefined ? { technicianId } : {}),
        })
        const saved = await db.savCase.findUniqueOrThrow({ where: { id }, select: { appointmentMinutes: true, technicianId: true } })
        const who = saved.technicianId ? ` — ${await technicianName(saved.technicianId)}` : ''
        await addSavEvent(id, 'SCHEDULED', `Rendez-vous le ${formatAppointment(at, saved.appointmentMinutes)}${who}${note ? ` — ${note}` : ''}`, author)
        break
      }
      case 'assign': {
        const technicianId = await checkTechnician(body.technicianId ?? null)
        await db.savCase.update({ where: { id }, data: { technicianId } })
        await addSavEvent(id, 'TECH_ASSIGNED', await technicianName(technicianId), author)
        break
      }
      case 'tech_photo': {
        const photo = body.photo as { mediaType?: unknown; data?: unknown } | undefined
        if (!photo || typeof photo.data !== 'string' || !PHOTO_TYPES.includes(String(photo.mediaType))) throw new Error('Photo invalide.')
        if (photo.data.length > 6_000_000) throw new Error('Photo trop lourde.')
        if (c.techPhotos.length >= MAX_PHOTOS) throw new Error(`${MAX_PHOTOS} photos au maximum.`)
        const path = await saveCasePhoto(id, { mediaType: String(photo.mediaType), data: photo.data })
        await db.savCase.update({ where: { id }, data: { techPhotos: { push: path } } })
        return NextResponse.json({ ok: true, path })
      }
      case 'tech_photo_remove': {
        if (typeof body.path !== 'string' || !c.techPhotos.includes(body.path)) throw new Error('Photo introuvable.')
        await removeCasePhoto(body.path).catch(() => null)
        await db.savCase.update({ where: { id }, data: { techPhotos: c.techPhotos.filter((p) => p !== body.path) } })
        return NextResponse.json({ ok: true })
      }
      case 'tech_report': {
        const outcome = body.outcome as TechOutcome
        if (!(outcome in TECH_OUTCOMES)) throw new Error('Choisissez l’issue de l’intervention.')
        const report = typeof body.report === 'string' ? body.report.trim().slice(0, 4000) : ''
        const { status, label, icon } = TECH_OUTCOMES[outcome]
        const again = outcome === 'REVISIT' || outcome === 'ABSENT'
        await setStatus(status, {
          techOutcome: outcome,
          techReport: report || null,
          techReportAt: new Date(),
          techReportBy: author,
          // L'événement de l'intervention passée reste dans l'agenda ; un nouveau rendez-vous en créera un autre
          planningEventId: null,
          ...(status === 'RESOLVED' ? { resolvedAt: new Date(), urgent: false } : {}),
          ...(again ? { appointmentAt: null, appointmentMinutes: null } : {}),
        })
        const photos = c.techPhotos.length ? ` (${c.techPhotos.length} photo${c.techPhotos.length > 1 ? 's' : ''})` : ''
        await addSavEvent(id, 'TECH_REPORT', `${icon} ${label}${photos}${report ? ` — ${report}` : ''}`, author)
        return NextResponse.json({ ok: true })
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
      case 'calendar_add': {
        const result = await syncCaseEvent(id, { create: true })
        if (result === 'unchanged') throw new Error('Fixez d\'abord la date du rendez-vous.')
        await addSavEvent(id, result === 'added' ? 'PLANNING_ADDED' : 'PLANNING_UPDATED', null, author)
        return NextResponse.json({ ok: true })
      }
      case 'calendar_remove':
        if ((await syncCaseEvent(id, { remove: true })) === 'removed') await addSavEvent(id, 'PLANNING_REMOVED', null, author)
        return NextResponse.json({ ok: true })
      default:
        throw new Error('Action inconnue.')
    }
    // Déjà au planning : la date changée déplace l'événement ; un dossier qui n'est plus planifié le retire
    if (c.planningEventId) {
      const result: SyncResult | Error = await syncCaseEvent(id).catch((e: unknown) => (e instanceof Error ? e : new Error(String(e))))
      if (result instanceof Error) {
        await addSavEvent(id, 'PLANNING_ERROR', `Agenda non mis à jour : ${result.message}`, author)
        return NextResponse.json({ ok: true, warning: `Dossier enregistré, mais l'agenda n'a pas pu être mis à jour : ${result.message}` })
      }
      if (result === 'updated' && body.action === 'schedule') await addSavEvent(id, 'PLANNING_UPDATED', null, author)
      if (result === 'removed') await addSavEvent(id, 'PLANNING_REMOVED', null, author)
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 })
  }
}
