import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/dal'
import { parseDriveLink } from '@/lib/drive/google'
import { updateSavSettings, type SavSettings } from '@/lib/sav/settings'

const NUMBERS = ['sendDelayMinutes', 'noClickHoursUrgent', 'noClickHours', 'selfHelpLastHour', 'officeStartHour', 'officeEndHour'] as const
const TEXTS = ['senderEmail', 'senderName', 'signature'] as const

/** Réglages de l'espace SAV (pause des envois, délais, expéditeur…). */
export async function PUT(request: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const patch: Partial<SavSettings> = {}
  if (typeof body.paused === 'boolean') patch.paused = body.paused
  for (const k of NUMBERS) if (Number.isFinite(body[k]) && body[k] >= 0 && body[k] <= 1000) patch[k] = Number(body[k])
  for (const k of TEXTS) if (typeof body[k] === 'string' && body[k].trim()) patch[k] = body[k].trim().slice(0, 200)
  if (typeof body.clientFolder === 'string') {
    const id = body.clientFolder.trim() ? parseDriveLink(body.clientFolder) : ''
    if (id === null) return NextResponse.json({ error: 'Lien de dossier Drive non reconnu.' }, { status: 400 })
    patch.clientFolderId = id
  }
  if (body.productChats && typeof body.productChats === 'object') {
    patch.productChats = Object.fromEntries(
      Object.entries(body.productChats as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === 'string' && e[1] !== ''),
    )
  }
  return NextResponse.json(await updateSavSettings(patch))
}
