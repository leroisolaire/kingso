import { NextRequest, NextResponse } from 'next/server'
import { getAllDocuments, createDocument } from '@/lib/db/queries/documents'

export async function GET() {
  try {
    const documents = await getAllDocuments()
    return NextResponse.json(documents)
  } catch (error) {
    console.error('[GET /api/documents]', error)
    return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    // TODO: Valider les données avec Zod avant d'appeler createDocument
    // TODO: Générer l'embedding du document et le stocker avec pgvector
    const document = await createDocument(body)
    return NextResponse.json(document, { status: 201 })
  } catch (error) {
    console.error('[POST /api/documents]', error)
    return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
