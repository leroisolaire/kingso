import { NextRequest, NextResponse } from 'next/server'
import { getCategoryById, updateCategory, deleteCategory } from '@/lib/db/queries/categories'
import { getSession } from '@/lib/auth/dal'

interface Params {
  params: Promise<{ id: string }>
}

export async function GET(_request: NextRequest, { params }: Params) {
  if (!(await getSession())) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  const { id } = await params
  const category = await getCategoryById(id)
  if (!category) return NextResponse.json({ error: 'Non trouvé.' }, { status: 404 })
  return NextResponse.json(category)
}

export async function PUT(request: NextRequest, { params }: Params) {
  if (!(await getSession())) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  try {
    const { id } = await params
    const body = await request.json()
    const category = await updateCategory(id, body)
    return NextResponse.json(category)
  } catch (error) {
    console.error('[PUT /api/categories/:id]', error)
    return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  if (!(await getSession())) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  try {
    const { id } = await params
    await deleteCategory(id)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    console.error('[DELETE /api/categories/:id]', error)
    return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
