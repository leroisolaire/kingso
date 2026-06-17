import { NextRequest, NextResponse } from 'next/server'
import { askKingso, type ConversationMessage } from '@/lib/ai/kingso'
import { searchDocuments } from '@/lib/rag/search'
import { db } from '@/lib/db/client'

export async function POST(request: NextRequest) {
  try {
    const { message, sessionToken, history } = await request.json()

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message requis.' }, { status: 400 })
    }

    const session = sessionToken ?? `anon-${Date.now()}`

    // Recherche vectorielle dans les documents publics
    const results = await searchDocuments(message, 5, ['PUBLIC'])
    const documentIds = results.map((r) => r.document.id)

    // Contexte envoyé à Claude : titre + contenu de chaque document trouvé
    const context = results
      .map((r) => `[${r.document.title}]\n${r.document.content}`)
      .join('\n\n---\n\n')

    // Historique des échanges précédents (max 10 messages = 5 échanges)
    const conversationHistory: ConversationMessage[] = Array.isArray(history)
      ? history.slice(-10)
      : []

    const response = await askKingso(message, context, documentIds, conversationHistory)

    // Sauvegarde de l'échange en base
    await db.history.create({
      data: {
        sessionToken: session,
        userMessage: message,
        assistantMessage: response.content,
        documentsUsed: documentIds,
      },
    })

    return NextResponse.json(response)
  } catch (error) {
    console.error('[/api/chat]', error)
    return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
