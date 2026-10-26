import { NextRequest, NextResponse } from 'next/server'
import { routeQuestion } from '@/lib/ai/router'
import { getHomeTiles } from '@/lib/db/queries/assistants'
import { checkRateLimit } from '@/lib/ratelimit'
import { getClientIp } from '@/lib/visitor'

/** Page d'accueil : vers quel chat orienter la première question du visiteur ? */
export async function POST(request: NextRequest) {
  if (!checkRateLimit(getClientIp(request)).allowed) {
    return NextResponse.json({ target: null, alternatives: [] })
  }
  try {
    const { message } = await request.json()
    if (typeof message !== 'string' || !message.trim()) return NextResponse.json({ target: null, alternatives: [] })
    return NextResponse.json(await routeQuestion(message, await getHomeTiles()))
  } catch (error) {
    // En cas de souci, la question reste simplement dans le chat d'accueil
    console.error('[/api/route-question]', error instanceof Error ? error.message : error)
    return NextResponse.json({ target: null, alternatives: [] })
  }
}
