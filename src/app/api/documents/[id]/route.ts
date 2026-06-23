import { NextRequest, NextResponse } from 'next/server'
import { getDocumentById, updateDocument, deleteDocument } from '@/lib/db/queries/documents'
import { getSession } from '@/lib/auth/dal'

interface Params {
  params: Promise<{ id: string }>
}

export async function GET(_request: NextRequest, { params }: Params) {
  if (!(await getSession())) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  const { id } = await params
  const document = await getDocumentById(id)
  if (!document) return NextResponse.json({ error: 'Non trouvé.' }, { status: 404 })
  return NextResponse.json(document)
}

export async function PUT(request: NextRequest, { params }: Params) {
  if (!(await getSession())) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  try {
    const { id } = await params
    const body = await request.json()
    // TODO: Régénérer l'embedding si le contenu a changé
    const document = await updateDocument(id, body)
    return NextResponse.json(document)
  } catch (error) {
    console.error('[PUT /api/documents/:id]', error)
    return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  if (!(await getSession())) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  try {
    const { id } = await params
    await deleteDocument(id)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    console.error('[DELETE /api/documents/:id]', error)
    return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
