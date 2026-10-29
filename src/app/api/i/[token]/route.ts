import { NextRequest, NextResponse } from 'next/server'
import { addTechPhoto, removeTechPhoto, saveTechReport } from '@/lib/sav/techReport'
import { getInterventionByToken } from '@/lib/sav/technicians'

export const maxDuration = 60

/** Retour d'intervention depuis le lien personnel d'un poseur (sans compte) : photos et compte rendu. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const c = await getInterventionByToken(token)
  if (!c) return NextResponse.json({ error: 'Ce lien n’est plus valide.' }, { status: 404 })
  if (c.status !== 'SCHEDULED' && c.status !== 'TECH_REPORT') {
    return NextResponse.json({ error: 'Le retour de cette intervention est déjà enregistré.' }, { status: 400 })
  }
  const body = await request.json().catch(() => ({}))
  const author = `${c.technician!.name} (poseur)`
  try {
    switch (body.action) {
      case 'tech_photo':
        return NextResponse.json({ ok: true, path: await addTechPhoto(c.id, body.photo) })
      case 'tech_photo_remove':
        await removeTechPhoto(c.id, body.path)
        return NextResponse.json({ ok: true })
      case 'tech_report':
        await saveTechReport(c.id, body.outcome, body.report, author)
        return NextResponse.json({ ok: true })
      default:
        throw new Error('Action inconnue.')
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 })
  }
}
