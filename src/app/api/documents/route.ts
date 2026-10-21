import { NextRequest, NextResponse } from 'next/server'
import { getAllDocuments, createDocument } from '@/lib/db/queries/documents'
import { getSession } from '@/lib/auth/dal'

// Création manuelle : découpage + indexation immédiate
export const maxDuration = 60

export async function GET() {
  if (!(await getSession())) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  try {
    const documents = await getAllDocuments()
    return NextResponse.json(documents)
  } catch (error) {
    console.error('[GET /api/documents]', error)
    return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  try {
    const body = await request.json()
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    const content = typeof body.content === 'string' ? body.content.trim() : ''
    if (!title || !content) return NextResponse.json({ error: 'Le titre et le contenu sont obligatoires.' }, { status: 400 })
    const document = await createDocument({
      title,
      content,
      type: (['PUBLIC', 'INTERNAL', 'FRANCHISE'] as const).find((t) => t === body.type) ?? 'PUBLIC',
      categoryId: typeof body.categoryId === 'string' && body.categoryId ? body.categoryId : null,
    })
    return NextResponse.json(document, { status: 201 })
  } catch (error) {
    console.error('[POST /api/documents]', error)
    return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
