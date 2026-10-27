import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { processDriveQueue, scanDrive } from '@/lib/drive/sync'
import { checkVideoSources } from '@/lib/videos/pipeline'
import { syncClientFile } from '@/lib/sav/clientSync'

// Synchronisation nocturne, appelée par Vercel Cron (vercel.json).
// Vercel envoie « Authorization: Bearer <CRON_SECRET> » quand la variable CRON_SECRET existe.
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 })
  }

  // Nouvelles vidéos des chaînes suivies : triées par Kingso, en attente de validation dans le back-office
  const videos = await checkVideoSources().catch((e) => ({ error: e instanceof Error ? e.message : String(e) }))
  // Fichier client du SAV : réimporté s'il a changé
  const clients = await syncClientFile().catch((e) => ({ error: e instanceof Error ? e.message : String(e) }))

  const sources = await db.driveSource.findMany()
  const reports = []
  for (const source of sources) reports.push(await scanDrive(source.id))
  // Ce qui ne tient pas dans le temps imparti sera repris la nuit suivante (ou via le back-office)
  const queue = await processDriveQueue(250_000)
  return NextResponse.json({ videos, clients, reports, queue })
}
