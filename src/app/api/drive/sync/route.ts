import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/dal'
import { db } from '@/lib/db/client'
import { scanDrive } from '@/lib/drive/sync'

export const maxDuration = 300

/** Étape 1 : compare le Drive à la base (rapide, sans téléchargement). */
export async function POST() {
  if (!(await getSession())) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  const source = await db.driveSource.findFirst()
  if (!source) return NextResponse.json({ error: 'Aucun dossier Drive configuré.' }, { status: 400 })
  const report = await scanDrive(source.id)
  return NextResponse.json(report, { status: report.error ? 500 : 200 })
}
