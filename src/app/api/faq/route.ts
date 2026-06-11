import { NextRequest, NextResponse } from 'next/server'
import { getAllFaqs, createFaq } from '@/lib/db/queries/faq'

export async function GET() {
  try {
    const faqs = await getAllFaqs()
    return NextResponse.json(faqs)
  } catch (error) {
    console.error('[GET /api/faq]', error)
    return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
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
