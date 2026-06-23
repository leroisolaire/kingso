import { NextRequest, NextResponse } from 'next/server'
import { getAllCategories, createCategory } from '@/lib/db/queries/categories'
import { getSession } from '@/lib/auth/dal'

export async function GET() {
  if (!(await getSession())) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  try {
    const categories = await getAllCategories()
    return NextResponse.json(categories)
  } catch (error) {
    console.error('[GET /api/categories]', error)
    return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  try {
    const body = await request.json()
    // TODO: Valider les données avec Zod
    const category = await createCategory(body)
    return NextResponse.json(category, { status: 201 })
  } catch (error) {
    console.error('[POST /api/categories]', error)
    return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
