import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/dal'
import { db } from '@/lib/db/client'
import { getDocumentFileUrl } from '@/lib/documents/process'

interface Params {
  params: Promise<{ id: string }>
}

/** Ouvre le fichier original (lien temporaire vers le stockage privé). */
export async function GET(request: NextRequest, { params }: Params) {
  if (!(await getSession())) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  const { id } = await params
  const doc = await db.document.findUnique({ where: { id }, select: { storagePath: true, fileUrl: true } })
  const url = doc?.storagePath ? await getDocumentFileUrl(doc.storagePath, 300) : doc?.fileUrl
  if (!url) return NextResponse.json({ error: 'Aucun fichier pour ce document.' }, { status: 404 })
  return NextResponse.redirect(url)
}
