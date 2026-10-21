import { NextRequest, NextResponse } from 'next/server'
import {
  getAssistantById, updateAssistant, deleteAssistant, duplicateAssistant, isSlugTaken,
} from '@/lib/db/queries/assistants'
import { parseAssistantInput } from '@/lib/assistants/validate'
import { getSession } from '@/lib/auth/dal'

interface Params {
  params: Promise<{ id: string }>
}

export async function GET(_request: NextRequest, { params }: Params) {
  if (!(await getSession())) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  const { id } = await params
  const assistant = await getAssistantById(id)
  if (!assistant) return NextResponse.json({ error: 'Non trouvé.' }, { status: 404 })
  return NextResponse.json(assistant)
}

export async function PUT(request: NextRequest, { params }: Params) {
  if (!(await getSession())) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  try {
    const { id } = await params
    const existing = await getAssistantById(id)
    if (!existing) return NextResponse.json({ error: 'Non trouvé.' }, { status: 404 })

    const { input, errors } = parseAssistantInput(await request.json(), false)
    if (input.access === 'PASSWORD' && !existing.hasPassword && !input.accessPassword) {
      errors.accessPassword = 'Un mot de passe est requis pour un chat protégé.'
    }
    if (!errors.slug && (await isSlugTaken(input.slug, id))) errors.slug = 'Cette adresse est déjà utilisée par un autre chat.'
    if (Object.keys(errors).length > 0) {
      return NextResponse.json({ error: 'Merci de corriger le formulaire.', fields: errors }, { status: 400 })
    }
    return NextResponse.json(await updateAssistant(id, input))
  } catch (error) {
    console.error('[PUT /api/assistants/:id]', error)
    return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}

/** POST = dupliquer le chat (créé en brouillon). */
export async function POST(_request: NextRequest, { params }: Params) {
  if (!(await getSession())) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  try {
    const { id } = await params
    return NextResponse.json(await duplicateAssistant(id), { status: 201 })
  } catch (error) {
    console.error('[POST /api/assistants/:id]', error)
    return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  if (!(await getSession())) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  try {
    const { id } = await params
    await deleteAssistant(id)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    console.error('[DELETE /api/assistants/:id]', error)
    return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
