import { NextRequest, NextResponse } from 'next/server'
import { askKingso } from '@/lib/ai/kingso'
import { searchDocuments } from '@/lib/rag/search'

// TODO: Implémenter le streaming avec ReadableStream pour une UX temps réel.
// TODO: Sauvegarder la conversation en base via saveMessage() après la réponse.
// TODO: Filtrer les types de documents selon le rôle de l'utilisateur connecté.

export async function POST(request: NextRequest) {
  try {
    const { message } = await request.json()

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message requis.' }, { status: 400 })
    }

    const results = await searchDocuments(message, 3, ['PUBLIC'])
    const documentIds = results.map((r) => r.document.id)

    const response = await askKingso(
      message,
      results.map((r) => r.document.content).join('\n\n'),
      documentIds
    )

    return NextResponse.json(response)
  } catch (error) {
    console.error('[/api/chat]', error)
    return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
