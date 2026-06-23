import { NextRequest, NextResponse } from 'next/server'
import { supabase, DOCUMENTS_BUCKET } from '@/lib/storage/client'
import { getSession } from '@/lib/auth/dal'

export async function POST(request: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'Aucun fichier reçu.' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const name = file.name.toLowerCase()
    let text = ''

    if (name.endsWith('.pdf')) {
      const { PDFParse } = await import('pdf-parse')
      const parser = new PDFParse({ data: buffer })
      const result = await parser.getText()
      text = result.text
    } else if (name.endsWith('.docx')) {
      const mammoth = await import('mammoth')
      const result = await mammoth.extractRawText({ buffer })
      text = result.value
    } else if (name.endsWith('.txt')) {
      text = buffer.toString('utf-8')
    } else {
      return NextResponse.json({ error: 'Format non supporté. Utilisez PDF, DOCX ou TXT.' }, { status: 400 })
    }

    text = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()

    // Upload du fichier original dans Supabase Storage
    const filename = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    const { error: uploadError } = await supabase.storage
      .from(DOCUMENTS_BUCKET)
      .upload(filename, buffer, { contentType: file.type, upsert: false })

    let fileUrl: string | null = null
    if (!uploadError) {
      const { data } = supabase.storage.from(DOCUMENTS_BUCKET).getPublicUrl(filename)
      fileUrl = data.publicUrl
    } else {
      console.error('[Storage upload]', uploadError.message)
    }

    return NextResponse.json({ text, filename: file.name, fileUrl, storageError: uploadError?.message ?? null })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[POST /api/documents/extract]', message)
    return NextResponse.json({ error: `Erreur : ${message}` }, { status: 500 })
  }
}
