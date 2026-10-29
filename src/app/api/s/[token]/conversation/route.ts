import { NextResponse } from 'next/server'
import { caseConversation, getCaseByToken } from '@/lib/sav/caseAccess'
import { getSignedUrls } from '@/lib/storage/attachments'

export const dynamic = 'force-dynamic'

/** Conversation du chat personnel : rechargée à chaque ouverture du lien, quel que soit l'appareil du client. */
export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const c = await getCaseByToken((await params).token)
  if (!c) return NextResponse.json({ error: 'Lien expiré.' }, { status: 404 })
  const entries = await caseConversation(c)
  const urls = await getSignedUrls(entries.flatMap((e) => e.attachments)).catch(() => ({} as Record<string, string>))
  return NextResponse.json({
    entries: entries.map((e) => ({
      historyId: e.historyId,
      user: e.user,
      userForHistory: e.userForHistory,
      assistant: e.assistant,
      photos: e.attachments.map((p) => urls[p]).filter(Boolean),
      rating: e.rating === 1 || e.rating === -1 ? e.rating : null,
      hidden: e.fromCaseMessage,
      createdAt: e.createdAt.toISOString(),
    })),
  }, { headers: { 'Cache-Control': 'no-store' } })
}
