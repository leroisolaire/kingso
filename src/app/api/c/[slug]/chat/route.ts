import { NextRequest, NextResponse, after } from 'next/server'
import { askAssistant, describeImages, type ImageInput } from '@/lib/ai/assistant'
import type { ConversationMessage } from '@/lib/ai/kingso'
import { searchScoped, formatContext, sourceIds } from '@/lib/rag/search'
import { suggestVideo } from '@/lib/rag/videoSuggest'
import type { Document } from '@/types/document'
import { expandCategoryIds, findAssistantBySlug, getHomeTiles } from '@/lib/db/queries/assistants'
import { caseContextText, getCaseByToken, markCaseChatStarted, caseConversation } from '@/lib/sav/caseAccess'
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
    .slice(-40) // toute la conversation SAV (marque, modèle, code, essais déjà faits…)
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

  const body = await request.json().catch(() => ({}))
  // Chat personnel ouvert depuis le lien envoyé par email (dossier SAV)
  const savCase = typeof body.caseToken === 'string' ? await getCaseByToken(body.caseToken) : null

  let resolved = await resolveAssistant(slug)
  if (resolved.kind !== 'ok' && savCase?.assistant?.slug === slug) {
    // Le lien personnel donne accès au chat du dossier même s'il n'est pas public
    const { assistant } = await findAssistantBySlug(slug)
    if (assistant) resolved = { kind: 'ok', assistant, isPreview: false }
  }
  if (resolved.kind === 'locked') return NextResponse.json({ error: 'Accès protégé.' }, { status: 401 })
  if (resolved.kind !== 'ok') return NextResponse.json({ error: 'Chat introuvable.' }, { status: 404 })
  const { assistant, isPreview } = resolved

  try {
    const message = typeof body.message === 'string' ? body.message.trim().slice(0, 2000) : ''
    // Chat personnel : une seule conversation par dossier, quel que soit l'appareil ou le navigateur du client
    const sessionToken = savCase?.chatSessionToken ?? (typeof body.sessionToken === 'string' && body.sessionToken
      ? body.sessionToken.slice(0, 100)
      : `anon-${Date.now()}`)
    const caseEntries = savCase ? await caseConversation(savCase) : []
    // Question du dossier envoyée automatiquement à l'ouverture : jamais deux fois (lien rouvert ailleurs)
    if (body.initial === true && caseEntries.length > 0) return NextResponse.json({ alreadyStarted: true }, { status: 409 })

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

    // Chat personnel : l'historique vient de la base (le même pour tous les appareils du client)
    const history = savCase?.chatSessionToken
      ? parseHistory(caseEntries.flatMap((e) => [{ role: 'user', content: e.userForHistory }, { role: 'assistant', content: e.assistant }]))
      : parseHistory(body.history)

    // Lecture des photos d'abord : le code erreur / modèle visible sert à la recherche
    const imageDescription = await describeImages(images, message)

    // Recherche par le sens : message + photos + derniers messages du client (une requête trop longue
    // mélange les sujets et trouve moins bien). Les codes, eux, sont relevés dans toute la conversation.
    const userMessages = history.filter((m) => m.role === 'user').map((m) => m.content)
    // Début de la dernière réponse de Kingso : le sujet en cours (ex. « il faut nettoyer le filtre à eau »),
    // pour que « c'est fait, comment je remonte ? » retrouve les bons documents
    const lastAnswer = history.findLast((m) => m.role === 'assistant')?.content.slice(0, 300) ?? ''
    // Chat personnel : l'équipement et le problème du dossier guident aussi la recherche
    const caseHint = savCase ? [savCase.equipment, savCase.errorCode ? `code ${savCase.errorCode}` : ''].filter(Boolean).join(' ') : ''
    const searchQuery = [caseHint, ...userMessages.slice(-4), lastAnswer, message, imageDescription].filter(Boolean).join(' ').slice(-1500)
    const codeText = [savCase?.clientQuestion ?? '', ...userMessages, message, imageDescription].filter(Boolean).join(' ')

    const docScope = {
      types: (assistant.audience === 'CUSTOMER' ? ['PUBLIC'] : ['PUBLIC', 'INTERNAL', 'FRANCHISE']) as Document['type'][],
      categoryIds: await expandCategoryIds(assistant.categories.map((c) => c.id)),
    }
    const results = await searchScoped(searchQuery, {
      ...docScope,
      webSourceIds: assistant.webSources.map((w) => w.id),
    }, 8, codeText)

    const context = formatContext(results)

    const response = await askAssistant({
      config: {
        name: assistant.name,
        audience: assistant.audience,
        instructions: assistant.instructions,
        escalationEnabled: assistant.escalationEnabled,
        otherChats: (await getHomeTiles())
          .filter((t) => t.slug !== assistant.slug)
          .map((t) => ({ title: t.title, description: t.description, url: `${request.nextUrl.origin}/${t.slug}` })),
      },
      userMessage: message,
      images,
      context,
      history,
      caseContext: savCase ? caseContextText(savCase) : undefined,
    })

    // Procédure donnée sans vidéo : on cherche une vidéo de démonstration de cette opération
    const video = await suggestVideo({ answer: response.content, conversation: codeText, scope: docScope })
      .catch((e) => { console.error('[suggestVideo]', e instanceof Error ? e.message : e); return null })
    if (video) response.content = `${response.content.trimEnd()}\n\nVous pouvez voir la démonstration en vidéo : ${video.url} `

    const attachments = await saveAttachments(assistant.slug, images)
    // Le texte lu sur les photos est gardé dans l'historique : il sert aux messages suivants
    const historyUserMessage = imageDescription
      ? `${message}${message ? '\n' : ''}[Photo : ${imageDescription}]`
      : message
    const documentsUsed = [...new Set([...sourceIds(results), ...(video ? [video.documentId] : [])])]

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

    if (savCase) await markCaseChatStarted(savCase.id, sessionToken)

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
