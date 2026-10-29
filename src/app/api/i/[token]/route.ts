import { NextRequest, NextResponse } from 'next/server'
import { addTechPhoto, removeTechPhoto, saveTechReport, updateTechReport } from '@/lib/sav/techReport'
import { getInterventionByToken } from '@/lib/sav/technicians'

export const maxDuration = 60

/**
 * Retour d'intervention depuis le lien personnel d'un intervenant : photos et compte rendu, puis modification du
 * retour tant que le lien est valable (7 jours après le retour).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const c = await getInterventionByToken(token)
  if (!c) return NextResponse.json({ error: 'Ce lien n’est plus valide.' }, { status: 404 })
  const toReport = c.status === 'SCHEDULED' || c.status === 'TECH_REPORT'
  if (!toReport && !c.techReportAt) return NextResponse.json({ error: 'Cette intervention n’est plus à faire.' }, { status: 400 })
  const body = await request.json().catch(() => ({}))
  const author = `${c.technician!.name}${c.technician!.kind === 'POSEUR' ? ' (poseur)' : ''}`
  try {
    switch (body.action) {
      case 'tech_photo':
        return NextResponse.json({ ok: true, path: await addTechPhoto(c.id, body.photo) })
      case 'tech_photo_remove':
        await removeTechPhoto(c.id, body.path)
        return NextResponse.json({ ok: true })
      case 'tech_report':
        if (!toReport) throw new Error('Le retour est déjà enregistré : modifiez-le.')
        await saveTechReport(c.id, body.outcome, body.report, author)
        return NextResponse.json({ ok: true })
      case 'tech_report_edit':
        await updateTechReport(c.id, body.outcome, body.report, author)
        return NextResponse.json({ ok: true })
      default:
        throw new Error('Action inconnue.')
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 })
  }
}
