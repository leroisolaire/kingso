import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { processDriveQueue, scanDrive } from '@/lib/drive/sync'

// Synchronisation nocturne, appelée par Vercel Cron (vercel.json).
// Vercel envoie « Authorization: Bearer <CRON_SECRET> » quand la variable CRON_SECRET existe.
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 })
  }

  const sources = await db.driveSource.findMany()
  const reports = []
  for (const source of sources) reports.push(await scanDrive(source.id))
  // Ce qui ne tient pas dans le temps imparti sera repris la nuit suivante (ou via le back-office)
  const queue = await processDriveQueue(250_000)
  return NextResponse.json({ reports, queue })
}
