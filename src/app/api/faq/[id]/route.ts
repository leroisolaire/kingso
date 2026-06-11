import { NextRequest, NextResponse } from 'next/server'
import { getFaqById, updateFaq, deleteFaq } from '@/lib/db/queries/faq'

interface Params {
  params: Promise<{ id: string }>
}

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params
  const faq = await getFaqById(id)
  if (!faq) return NextResponse.json({ error: 'Non trouvé.' }, { status: 404 })
  return NextResponse.json(faq)
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const body = await request.json()
    const faq = await updateFaq(id, body)
    return NextResponse.json(faq)
  } catch (error) {
    console.error('[PUT /api/faq/:id]', error)
    return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    await deleteFaq(id)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    console.error('[DELETE /api/faq/:id]', error)
    return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
