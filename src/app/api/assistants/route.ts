import { NextRequest, NextResponse } from 'next/server'
import { getAllAssistants, createAssistant, isSlugTaken } from '@/lib/db/queries/assistants'
import { parseAssistantInput } from '@/lib/assistants/validate'
import { getSession } from '@/lib/auth/dal'

export async function GET() {
  if (!(await getSession())) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  try {
    return NextResponse.json(await getAllAssistants())
  } catch (error) {
    console.error('[GET /api/assistants]', error)
    return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  try {
    const { input, errors } = parseAssistantInput(await request.json(), true)
    if (!errors.slug && (await isSlugTaken(input.slug))) errors.slug = 'Cette adresse est déjà utilisée par un autre chat.'
    if (Object.keys(errors).length > 0) {
      return NextResponse.json({ error: 'Merci de corriger le formulaire.', fields: errors }, { status: 400 })
    }
    const assistant = await createAssistant(input)
    return NextResponse.json(assistant, { status: 201 })
  } catch (error) {
    console.error('[POST /api/assistants]', error)
    return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
