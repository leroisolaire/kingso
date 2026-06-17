import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'

export async function GET() {
  try {
    const sources = await db.webSource.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { pages: true } } },
    })
    return NextResponse.json(sources)
  } catch (error) {
    const message = error instanceof Error ? error.message : JSON.stringify(error)
    console.error('[GET /api/sources]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const { name, url, maxPages } = await request.json()
  if (!name || !url) return NextResponse.json({ error: 'Nom et URL requis.' }, { status: 400 })

  try {
    new URL(url)
  } catch {
    return NextResponse.json({ error: 'URL invalide.' }, { status: 400 })
  }

  const source = await db.webSource.create({
    data: { name, url: url.replace(/\/$/, ''), maxPages: maxPages ?? 80 },
  })
  return NextResponse.json(source, { status: 201 })
}
