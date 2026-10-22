import { NextRequest, NextResponse, after } from 'next/server'
import { askAssistant, describeImages, type ImageInput } from '@/lib/ai/assistant'
import type { ConversationMessage } from '@/lib/ai/kingso'
import { searchScoped, formatContext, sourceIds } from '@/lib/rag/search'
import { expandCategoryIds } from '@/lib/db/queries/assistants'
import { resolveAssistant } from '@/lib/assistants/resolve'
import { saveAttachments } from '@/lib/storage/attachments'
import { checkRateLimit } from '@/lib/ratelimit'
import { getClientIp, hashIp } from '@/lib/visitor'
import { db } from '@/lib/db/client'
import { refreshConversationSummary } from '@/lib/history/summary'

export const maxDuration = 60

const MAX_IMAGES = 3
const MAX_IMAGE_BASE64_LENGTH = 3_000_000 // ~2,2 Mo par image (compressée côté navigateur)
const ALLOWED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

interface Params {
  params: Promise<{ slug: string }>
}

function parseHistory(raw: unknown): ConversationMessage[] {
  if (!Array.isArray(raw)) return []
  const messages = raw
    .filter((m): m is ConversationMessage =>
      (m?.role === 'user' || m?.role === 'assistant') && typeof m?.content === 'string' && m.content.trim() !== '')
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }))
  // L'API Anthropic exige que la conversation commence par un message utilisateur
  while (messages.length > 0 && messages[0].role !== 'user') messages.shift()
  return messages
}

function parseImages(raw: unknown): ImageInput[] | string {
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw)) return 'Pièces jointes invalides.'
  if (raw.length > MAX_IMAGES) return `${MAX_IMAGES} photos maximum par message.`
  const images: ImageInput[] = []
  for (const img of raw) {
    if (!ALLOWED_MEDIA_TYPES.includes(img?.mediaType) || typeof img?.data !== 'string') {
      return 'Format de photo non pris en charge.'
    }
    if (img.data.length > MAX_IMAGE_BASE64_LENGTH) return 'Photo trop lourde.'
    images.push({ mediaType: img.mediaType, data: img.data })
  }
  return images
}

export async function POST(request: NextRequest, { params }: Params) {
  const { slug } = await params
  const ip = getClientIp(request)

  const { allowed, resetIn } = checkRateLimit(ip)
  if (!allowed) {
    return NextResponse.json(
      { error: `Trop de messages. Attendez ${Math.ceil(resetIn / 1000)} secondes avant de réessayer.` },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(resetIn / 1000)) } },
    )
  }

  const resolved = await resolveAssistant(slug)
  if (resolved.kind === 'locked') return NextResponse.json({ error: 'Accès protégé.' }, { status: 401 })
  if (resolved.kind !== 'ok') return NextResponse.json({ error: 'Chat introuvable.' }, { status: 404 })
  const { assistant, isPreview } = resolved

  try {
    const body = await request.json()
    const message = typeof body.message === 'string' ? body.message.trim().slice(0, 2000) : ''
    const sessionToken = typeof body.sessionToken === 'string' && body.sessionToken
      ? body.sessionToken.slice(0, 100)
      : `anon-${Date.now()}`

    const images = assistant.attachmentsEnabled ? parseImages(body.images) : []
    if (typeof images === 'string') return NextResponse.json({ error: images }, { status: 400 })
    if (!message && images.length === 0) return NextResponse.json({ error: 'Message requis.' }, { status: 400 })

    // Limite quotidienne par visiteur (persistée en base, fiable même en serverless)
    const ipHash = hashIp(ip)
    if (!isPreview && assistant.dailyMessageLimit > 0) {
      const count = await db.history.count({
        where: { assistantId: assistant.id, ipHash, createdAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) } },
      })
      if (count >= assistant.dailyMessageLimit) {
        return NextResponse.json({
          error: 'Vous avez atteint le nombre maximum de messages pour aujourd\'hui. Merci de revenir demain.',
          limitReached: true,
        }, { status: 429 })
      }
    }

    const history = parseHistory(body.history)

    // Lecture des photos d'abord : le code erreur / modèle visible sert à la recherche
    const imageDescription = await describeImages(images, message)

    // Requête de recherche : message + photos + derniers messages du client (marque, modèle…)
    const previousUserMessages = history.filter((m) => m.role === 'user').slice(-2).map((m) => m.content)
    const searchQuery = [...previousUserMessages, message, imageDescription].filter(Boolean).join(' ').slice(-1500)

    const results = await searchScoped(searchQuery, {
      types: assistant.audience === 'CUSTOMER' ? ['PUBLIC'] : ['PUBLIC', 'INTERNAL', 'FRANCHISE'],
      categoryIds: await expandCategoryIds(assistant.categories.map((c) => c.id)),
      webSourceIds: assistant.webSources.map((w) => w.id),
    })

    const context = formatContext(results)

    const response = await askAssistant({
      config: {
        name: assistant.name,
        audience: assistant.audience,
        instructions: assistant.instructions,
        escalationEnabled: assistant.escalationEnabled,
      },
      userMessage: message,
      images,
      context,
      history,
    })

    const attachments = await saveAttachments(assistant.slug, images)
    // Le texte lu sur les photos est gardé dans l'historique : il sert aux messages suivants
    const historyUserMessage = imageDescription
      ? `${message}${message ? '\n' : ''}[Photo : ${imageDescription}]`
      : message
    const documentsUsed = sourceIds(results)

    const entry = await db.history.create({
      select: { id: true },
      data: {
        sessionToken,
        userMessage: historyUserMessage,
        assistantMessage: response.content,
        documentsUsed,
        assistantId: assistant.id,
        attachments,
        ipHash: isPreview ? null : ipHash,
        unanswered: response.unanswered,
      },
    })

    // Titre de la conversation pour l'historique, mis à jour après la réponse (ne ralentit pas le chat)
    after(() => refreshConversationSummary(sessionToken))

    return NextResponse.json({
      content: response.content,
      documentsUsed,
      offerEscalation: response.offerEscalation,
      historyUserMessage,
      historyId: entry.id,
    })
  } catch (error) {
    console.error('[/api/c/:slug/chat]', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Une erreur est survenue. Veuillez réessayer.' }, { status: 500 })
  }
}
