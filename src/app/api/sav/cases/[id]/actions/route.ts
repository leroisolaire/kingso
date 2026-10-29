import { NextRequest, NextResponse } from 'next/server'
import type { SavStatus } from '@prisma/client'
import { getSession } from '@/lib/auth/dal'
import { db } from '@/lib/db/client'
import { currentAuthor } from '@/lib/sav/author'
import { isCalendarConnected, syncCaseEvent, type SyncResult } from '@/lib/sav/calendar'
import { linkClient } from '@/lib/sav/clientSync'
import { addSavEvent } from '@/lib/sav/events'
import { completeCaseFromPhotoNote, prepareEmail, storeMessagePhotos } from '@/lib/sav/ingest'
import { isValidDuration } from '@/lib/sav/duration'
import { formatAppointment, parisTime } from '@/lib/sav/schedule'
import { cancelCaseEmail, sendCaseEmail } from '@/lib/sav/send'
import { sendCaseSms } from '@/lib/sav/sms'
import { STATUS_LABELS } from '@/lib/sav/status'
import { sendTechnicianLinkSms } from '@/lib/sav/techLink'
import { addTechPhoto, removeTechPhoto, saveTechReport, updateTechReport } from '@/lib/sav/techReport'
import { checkTechnician, ensureTechToken, interventionLink, technicianName } from '@/lib/sav/technicians'
import { toRating, URGENT_FROM } from '@/lib/sav/rating'
import { removeCasePhoto } from '@/lib/storage/attachments'
import { describeImages } from '@/lib/ai/assistant'
import { parseCasePhotos } from '@/lib/sav/photos'
import { TEMPLATE_KEYS, type TemplateKey } from '@/lib/sav/templates'

export const maxDuration = 60

/** Date du rendez-vous : jour et heure de Paris (planning) ou date ISO (champ date du navigateur). */
function appointmentDate(body: { day?: unknown; time?: unknown; appointmentAt?: unknown }): Date {
  if (typeof body.day === 'string' && typeof body.time === 'string') {
    const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(body.day)
    const t = /^(\d{2}):(\d{2})$/.exec(body.time)
    if (d && t) return parisTime(Number(d[1]), Number(d[2]), Number(d[3]), Number(t[1]), Number(t[2]))
  }
  return new Date(typeof body.appointmentAt === 'string' ? body.appointmentAt : NaN)
}

/** Actions de l'équipe sur un dossier (email, appel, planification, statut, note). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSession())) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const author = await currentAuthor()
  const c = await db.savCase.findUnique({ where: { id }, select: { id: true, status: true, planningEventId: true, technicianId: true } })
  if (!c) return NextResponse.json({ error: 'Dossier introuvable.' }, { status: 404 })

  const setStatus = (status: SavStatus, extra: Record<string, unknown> = {}) =>
    db.savCase.update({ where: { id }, data: { status, ...extra } })
  const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 2000) : null

  try {
    switch (body.action) {
      case 'send': {
        const scheduledAt = await sendCaseEmail(id, author, { now: true })
        // Case « Envoyer aussi le SMS » : l'email est parti même si le SMS échoue
        if (body.sms === true) {
          const sms = await sendCaseSms(id, typeof body.smsText === 'string' ? body.smsText : null, author)
            .then((phone) => ({ smsPhone: phone }), (e) => ({ warning: `Email envoyé, mais SMS non envoyé : ${e instanceof Error ? e.message : e}` }))
          return NextResponse.json({ ok: true, scheduledAt, ...sms })
        }
        return NextResponse.json({ ok: true, scheduledAt })
      }
      case 'send_sms':
        return NextResponse.json({ ok: true, smsPhone: await sendCaseSms(id, typeof body.smsText === 'string' ? body.smsText : null, author) })
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
          // Autre intervenant : l'ancien lien d'intervention ne marche plus
          ...(technicianId !== undefined ? { technicianId, ...(technicianId !== c.technicianId ? { techToken: null } : {}) } : {}),
        })
        const saved = await db.savCase.findUniqueOrThrow({ where: { id }, select: { appointmentMinutes: true, technicianId: true } })
        const who = saved.technicianId ? ` — ${await technicianName(saved.technicianId)}` : ''
        await addSavEvent(id, 'SCHEDULED', `Rendez-vous le ${formatAppointment(at, saved.appointmentMinutes)}${who}${note ? ` — ${note}` : ''}`, author)
        break
      }
      case 'assign': {
        const technicianId = await checkTechnician(body.technicianId ?? null)
        await db.savCase.update({ where: { id }, data: { technicianId, ...(technicianId !== c.technicianId ? { techToken: null } : {}) } })
        await addSavEvent(id, 'TECH_ASSIGNED', await technicianName(technicianId), author)
        break
      }
      case 'tech_photo':
        return NextResponse.json({ ok: true, path: await addTechPhoto(id, body.photo) })
      case 'tech_photo_remove':
        await removeTechPhoto(id, body.path)
        return NextResponse.json({ ok: true })
      case 'tech_link':
        // Lien personnel de l'intervenant (poseur sans compte) : à copier, ou à envoyer par SMS
        return NextResponse.json({ ok: true, link: interventionLink(await ensureTechToken(id)) })
      case 'tech_link_sms':
        return NextResponse.json({ ok: true, phone: await sendTechnicianLinkSms(id, author) })
      case 'rate': {
        // Urgence et difficulté (1 à 5, null = effacée) : modifiables par tous, à tout moment
        const current = await db.savCase.findUniqueOrThrow({ where: { id }, select: { urgency: true, difficulty: true } })
        const urgency = 'urgency' in body ? toRating(body.urgency) : current.urgency
        const difficulty = 'difficulty' in body ? toRating(body.difficulty) : current.difficulty
        if (urgency === current.urgency && difficulty === current.difficulty) return NextResponse.json({ ok: true })
        await db.savCase.update({
          where: { id },
          // Une seule notion d'urgence : le badge « URGENT » suit la note
          data: { urgency, difficulty, ...(urgency !== current.urgency && urgency ? { urgent: urgency >= URGENT_FROM } : {}) },
        })
        const parts = [
          urgency !== current.urgency ? `Urgence ${urgency ? `${urgency}/5` : 'effacée'}` : '',
          difficulty !== current.difficulty ? `Difficulté ${difficulty ? `${difficulty}/5` : 'effacée'}` : '',
        ].filter(Boolean)
        await addSavEvent(id, 'RATED', parts.join(' · '), author)
        return NextResponse.json({ ok: true })
      }
      case 'message_photo': {
        // Photo reçue après coup (email, SMS du client) : jointe au dernier message du dossier
        const photos = parseCasePhotos([body.photo], 1)
        if (typeof photos === 'string') throw new Error(photos)
        const last = await db.savMessage.findFirst({ where: { caseId: id }, orderBy: { receivedAt: 'desc' }, select: { id: true, photoNote: true } })
        if (!last) throw new Error('Aucun message dans ce dossier.')
        const note = await describeImages(photos, '').catch(() => '')
        if (note) await db.savMessage.update({ where: { id: last.id }, data: { photoNote: [last.photoNote, note].filter(Boolean).join(' ') } })
        await storeMessagePhotos(id, last.id, photos, note, author)
        // Code affiché ou équipement lisible sur la photo : complète le dossier s'il ne les a pas encore
        await completeCaseFromPhotoNote(id, note)
        return NextResponse.json({ ok: true })
      }
      case 'message_photo_remove': {
        const message = typeof body.path === 'string'
          ? await db.savMessage.findFirst({ where: { caseId: id, photos: { has: body.path } }, select: { id: true, photos: true } })
          : null
        if (!message) throw new Error('Photo introuvable.')
        await removeCasePhoto(body.path).catch(() => null)
        await db.savMessage.update({ where: { id: message.id }, data: { photos: message.photos.filter((p) => p !== body.path) } })
        return NextResponse.json({ ok: true })
      }
      case 'tech_report':
        await saveTechReport(id, body.outcome, body.report, author)
        return NextResponse.json({ ok: true })
      case 'tech_report_edit':
        await updateTechReport(id, body.outcome, body.report, author)
        return NextResponse.json({ ok: true })
      case 'status': {
        const status = body.status as SavStatus
        if (!(status in STATUS_LABELS)) throw new Error('Statut inconnu.')
        await setStatus(status, status === 'RESOLVED' ? { resolvedAt: new Date() } : {})
        await addSavEvent(id, 'STATUS', STATUS_LABELS[status], author)
        break
      }
      case 'urgent': {
        // Badge et note restent d'accord : « urgent » = au moins 4, « pas urgent » = au plus 3
        const { urgency } = await db.savCase.findUniqueOrThrow({ where: { id }, select: { urgency: true } })
        const urgent = Boolean(body.urgent)
        const nextUrgency = urgent ? Math.max(urgency ?? 0, URGENT_FROM) : urgency && urgency >= URGENT_FROM ? URGENT_FROM - 1 : urgency
        await db.savCase.update({ where: { id }, data: { urgent, urgency: nextUrgency } })
        await addSavEvent(id, 'EDITED', `${urgent ? 'Marqué urgent' : 'Urgence retirée'}${nextUrgency !== urgency ? ` (urgence ${nextUrgency}/5)` : ''}`, author)
        break
      }
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
    // Rendez-vous fixé ou déplacé (dossier, planning) : ajouté à l'agenda Google s'il est connecté.
    // Déjà au planning : la date changée déplace l'événement ; un dossier qui n'est plus planifié le retire
    const create = body.action === 'schedule' && (await isCalendarConnected().catch(() => false))
    if (c.planningEventId || create) {
      const result: SyncResult | Error = await syncCaseEvent(id, { create }).catch((e: unknown) => (e instanceof Error ? e : new Error(String(e))))
      if (result instanceof Error) {
        await addSavEvent(id, 'PLANNING_ERROR', `Agenda non mis à jour : ${result.message}`, author)
        return NextResponse.json({ ok: true, warning: `Dossier enregistré, mais l'agenda n'a pas pu être mis à jour : ${result.message}` })
      }
      if (result === 'added') await addSavEvent(id, 'PLANNING_ADDED', null, author)
      if (result === 'updated' && body.action === 'schedule') await addSavEvent(id, 'PLANNING_UPDATED', null, author)
      if (result === 'removed') await addSavEvent(id, 'PLANNING_REMOVED', null, author)
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 })
  }
}
