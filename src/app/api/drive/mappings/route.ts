import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/dal'
import { db } from '@/lib/db/client'

const key = (name: string) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()

/** Associe un dossier Drive (2e niveau, ex. « PAC ») à une catégorie Kingso. */
export async function PUT(request: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  const { folderName, categoryId } = await request.json()
  if (typeof folderName !== 'string' || !folderName.trim() || typeof categoryId !== 'string') {
    return NextResponse.json({ error: 'Dossier et catégorie requis.' }, { status: 400 })
  }
  const category = await db.category.findUnique({ where: { id: categoryId }, select: { parentId: true } })
  if (!category) return NextResponse.json({ error: 'Catégorie introuvable.' }, { status: 400 })
  if (category.parentId) {
    return NextResponse.json({ error: 'Choisissez une catégorie principale (les sous-dossiers deviennent ses sous-catégories).' }, { status: 400 })
  }
  const mapping = await db.driveCategoryMapping.upsert({
    where: { folderName: key(folderName) },
    create: { folderName: key(folderName), categoryId },
    update: { categoryId },
  })
  return NextResponse.json(mapping)
}

export async function DELETE(request: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  const folderName = request.nextUrl.searchParams.get('folderName')
  if (!folderName) return NextResponse.json({ error: 'Dossier requis.' }, { status: 400 })
  await db.driveCategoryMapping.deleteMany({ where: { folderName: key(folderName) } })
  return new NextResponse(null, { status: 204 })
}
