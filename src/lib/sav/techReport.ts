import 'server-only'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db/client'
import { removeCasePhoto, saveCasePhoto } from '@/lib/storage/attachments'
import { addSavEvent } from './events'
import { TECH_OUTCOMES, type TechOutcome } from './status'

// Retour d'intervention (issue, compte rendu, photos) : depuis le dossier (équipe, technicien SAV) ou depuis le lien
// personnel d'un poseur.

const MAX_PHOTOS = 12
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export async function addTechPhoto(caseId: string, photo: { mediaType?: unknown; data?: unknown } | undefined): Promise<string> {
  if (!photo || typeof photo.data !== 'string' || !PHOTO_TYPES.includes(String(photo.mediaType))) throw new Error('Photo invalide.')
  if (photo.data.length > 6_000_000) throw new Error('Photo trop lourde.')
  const { techPhotos } = await db.savCase.findUniqueOrThrow({ where: { id: caseId }, select: { techPhotos: true } })
  if (techPhotos.length >= MAX_PHOTOS) throw new Error(`${MAX_PHOTOS} photos au maximum.`)
  const path = await saveCasePhoto(caseId, { mediaType: String(photo.mediaType), data: photo.data })
  await db.savCase.update({ where: { id: caseId }, data: { techPhotos: { push: path } } })
  return path
}

export async function removeTechPhoto(caseId: string, path: unknown) {
  const { techPhotos } = await db.savCase.findUniqueOrThrow({ where: { id: caseId }, select: { techPhotos: true } })
  if (typeof path !== 'string' || !techPhotos.includes(path)) throw new Error('Photo introuvable.')
  await removeCasePhoto(path).catch(() => null)
  await db.savCase.update({ where: { id: caseId }, data: { techPhotos: techPhotos.filter((p) => p !== path) } })
}

export async function saveTechReport(caseId: string, outcomeInput: unknown, reportInput: unknown, author: string | null) {
  const outcome = outcomeInput as TechOutcome
  if (typeof outcome !== 'string' || !(outcome in TECH_OUTCOMES)) throw new Error('Choisissez l’issue de l’intervention.')
  const report = typeof reportInput === 'string' ? reportInput.trim().slice(0, 4000) : ''
  const { status, label, icon } = TECH_OUTCOMES[outcome]
  const again = outcome === 'REVISIT' || outcome === 'ABSENT'
  const { techPhotos } = await db.savCase.update({
    where: { id: caseId },
    data: {
      status,
      techOutcome: outcome,
      techReport: report || null,
      techReportAt: new Date(),
      techReportBy: author,
      // L'événement de l'intervention passée reste dans l'agenda ; un nouveau rendez-vous en créera un autre
      planningEventId: null,
      ...(status === 'RESOLVED' ? { resolvedAt: new Date(), urgent: false } : {}),
      ...(again ? { appointmentAt: null, appointmentMinutes: null } : {}),
    },
    select: { techPhotos: true },
  })
  const photos = techPhotos.length ? ` (${techPhotos.length} photo${techPhotos.length > 1 ? 's' : ''})` : ''
  await addSavEvent(caseId, 'TECH_REPORT', `${icon} ${label}${photos}${report ? ` — ${report}` : ''}`, author)
}

/** Ce que le SAV a fait sur le dossier depuis le retour : l'issue ne peut alors plus être changée par l'intervenant. */
const FOLLOW_UP_KINDS = ['SCHEDULED', 'STATUS', 'CALL_RESOLVED', 'CALL_INTERVENTION', 'TECH_ASSIGNED']

/**
 * Modification d'un retour déjà enregistré (compte rendu, issue ; photos à part). Changer l'issue remet le dossier
 * dans l'état correspondant, sauf si le SAV y a déjà donné suite (nouveau rendez-vous, statut changé…).
 */
export async function updateTechReport(caseId: string, outcomeInput: unknown, reportInput: unknown, author: string | null) {
  const c = await db.savCase.findUniqueOrThrow({
    where: { id: caseId },
    select: { status: true, techOutcome: true, techReport: true, techReportAt: true, resolvedAt: true },
  })
  if (!c.techReportAt || !c.techOutcome) throw new Error('Aucun retour à modifier.')
  const outcome = outcomeInput as TechOutcome
  if (typeof outcome !== 'string' || !(outcome in TECH_OUTCOMES)) throw new Error('Choisissez l’issue de l’intervention.')
  const report = typeof reportInput === 'string' ? reportInput.trim().slice(0, 4000) : ''
  const outcomeChanged = outcome !== c.techOutcome
  if (!outcomeChanged && report === (c.techReport ?? '')) return

  const data: Prisma.SavCaseUpdateInput = { techOutcome: outcome, techReport: report || null }
  if (outcomeChanged) {
    const previous = TECH_OUTCOMES[c.techOutcome as TechOutcome]
    const followedUp = c.status !== previous?.status || Boolean(await db.savEvent.findFirst({
      where: { caseId, createdAt: { gt: c.techReportAt }, kind: { in: FOLLOW_UP_KINDS } },
      select: { id: true },
    }))
    if (followedUp) {
      throw new Error('Le SAV a déjà donné suite à ce retour : l’issue ne peut plus être changée ici (appelez le SAV). Le compte rendu et les photos restent modifiables.')
    }
    const { status } = TECH_OUTCOMES[outcome]
    data.status = status
    if (status === 'RESOLVED') { data.resolvedAt = new Date(); data.urgent = false } else if (c.resolvedAt) data.resolvedAt = null
    if (outcome === 'REVISIT' || outcome === 'ABSENT') { data.appointmentAt = null; data.appointmentMinutes = null }
  }
  await db.savCase.update({ where: { id: caseId }, data })
  const { label, icon } = TECH_OUTCOMES[outcome]
  await addSavEvent(caseId, 'TECH_REPORT_EDITED', `${outcomeChanged ? `Issue changée : ${icon} ${label}` : `${icon} ${label}`}${report ? ` — ${report}` : ''}`, author)
}
