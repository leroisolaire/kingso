import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'

interface Params {
  params: Promise<{ slug: string }>
}

/** Avis du client sur une réponse : 1 = 👍, -1 = 👎, 0 = retirer son avis. */
export async function POST(request: NextRequest, { params }: Params) {
  const { slug } = await params
  try {
    const { historyId, sessionToken, rating } = await request.json()
    if (typeof historyId !== 'string' || typeof sessionToken !== 'string' || ![1, -1, 0].includes(rating)) {
      return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 })
    }
    // Seul l'auteur de la conversation (même jeton de session, même chat) peut noter la réponse
    const updated = await db.history.updateMany({
      where: { id: historyId, sessionToken, assistant: { slug } },
      data: { rating: rating === 0 ? null : rating },
    })
    if (updated.count === 0) return NextResponse.json({ error: 'Réponse introuvable.' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[/api/c/:slug/feedback]', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
