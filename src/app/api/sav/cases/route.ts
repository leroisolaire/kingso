import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/dal'
import { currentAuthor } from '@/lib/sav/author'
import { parseVoicemail } from '@/lib/sav/connectel'
import { ingestMessage } from '@/lib/sav/ingest'
import { normalizePhone } from '@/lib/sav/phone'
import { parseCasePhotos } from '@/lib/sav/photos'

export const maxDuration = 60

/**
 * Nouveau dossier à partir d'un texte collé : email du répondeur (Connectel) reconnu tel quel,
 * ou texte libre (appel pris au téléphone…) avec le numéro du client.
 */
export async function POST(request: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const text = typeof body.text === 'string' ? body.text.trim().slice(0, 20000) : ''
  if (!text) return NextResponse.json({ error: 'Collez le message du client.' }, { status: 400 })
  const photos = parseCasePhotos(body.photos)
  if (typeof photos === 'string') return NextResponse.json({ error: photos }, { status: 400 })

  try {
    const author = await currentAuthor()
    if (/Transcription automatique\s*:/i.test(text)) {
      const v = parseVoicemail(text)
      if (!v.transcript) throw new Error('Transcription introuvable dans le texte collé.')
      return NextResponse.json(await ingestMessage({
        source: 'VOICEMAIL', text: v.transcript, callerPhone: v.callerPhone, dictatedPhone: v.dictatedPhone,
        receivedAt: v.receivedAt, durationSec: v.durationSec, author, photos,
      }))
    }
    return NextResponse.json(await ingestMessage({ source: 'MANUAL', text, callerPhone: normalizePhone(body.phone), author, photos }))
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
