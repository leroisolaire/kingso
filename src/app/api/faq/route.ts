import { NextRequest, NextResponse } from 'next/server'
import { getAllFaqs, createFaq } from '@/lib/db/queries/faq'
import { getSession } from '@/lib/auth/dal'

export async function GET() {
  if (!(await getSession())) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  try {
    const faqs = await getAllFaqs()
    return NextResponse.json(faqs)
  } catch (error) {
    console.error('[GET /api/faq]', error)
    return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  try {
    const body = await request.json()
    // TODO: Valider les données avec Zod
    const faq = await createFaq(body)
    return NextResponse.json(faq, { status: 201 })
  } catch (error) {
    console.error('[POST /api/faq]', error)
    return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
