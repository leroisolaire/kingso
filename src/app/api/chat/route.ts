import { NextRequest, NextResponse } from 'next/server'
import { askKingso, type ConversationMessage } from '@/lib/ai/kingso'
import { searchDocuments } from '@/lib/rag/search'
import { db } from '@/lib/db/client'
import { checkRateLimit } from '@/lib/ratelimit'

export async function POST(request: NextRequest) {
  // Rate limiting par IP
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const { allowed, remaining, resetIn } = checkRateLimit(ip)

  if (!allowed) {
    return NextResponse.json(
      { error: `Trop de messages. Attendez ${Math.ceil(resetIn / 1000)} secondes avant de réessayer.` },
      {
        status: 429,
        headers: {
          'X-RateLimit-Remaining': '0',
          'Retry-After': String(Math.ceil(resetIn / 1000)),
        },
      }
    )
  }

  try {
    const { message, sessionToken, history } = await request.json()

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message requis.' }, { status: 400 })
    }

    const session = sessionToken ?? `anon-${Date.now()}`

    // Pour les messages courts (suites de conversation), on enrichit la requête
    // avec le dernier échange pour que la recherche vectorielle trouve les bons documents
    const conversationHistory: ConversationMessage[] = Array.isArray(history)
      ? history.slice(-10)
      : []

    const isFollowUp = message.trim().length < 40 && conversationHistory.length >= 2
    const lastUserMsg = conversationHistory.filter((m) => m.role === 'user').slice(-1)[0]?.content ?? ''
    const lastAssistantMsg = conversationHistory.filter((m) => m.role === 'assistant').slice(-1)[0]?.content ?? ''
    const searchQuery = isFollowUp
      ? `${lastUserMsg} ${lastAssistantMsg.slice(0, 200)} ${message}`.trim()
      : message

    // Recherche vectorielle dans les documents publics
    const results = await searchDocuments(searchQuery, 5, ['PUBLIC'])
    const documentIds = results.map((r) => r.document.id)

    // Contexte envoyé à Claude : titre + contenu de chaque document trouvé
    const context = results
      .map((r) => `[${r.document.title}]\n${r.document.content}`)
      .join('\n\n---\n\n')

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
    const message = error instanceof Error ? error.message : String(error)
    console.error('[/api/chat]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
