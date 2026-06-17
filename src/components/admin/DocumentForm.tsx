'use client'

import { useRef, useState } from 'react'
import Input from '@/components/ui/Input'
import Textarea from '@/components/ui/Textarea'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import type { Document, DocumentType } from '@/types/document'
import type { Category } from '@/types/category'

interface DocumentFormProps {
  document?: Partial<Document>
  categories: Category[]
  onSubmit: (data: Omit<Document, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>
  onCancel: () => void
}

export default function DocumentForm({ document, categories, onSubmit, onCancel }: DocumentFormProps) {
  const [title, setTitle] = useState(document?.title ?? '')
  const [content, setContent] = useState(document?.content ?? '')
  const [type, setType] = useState<DocumentType>(document?.type ?? 'PUBLIC')
  const [categoryId, setCategoryId] = useState(document?.categoryId ?? '')
  const [fileUrl, setFileUrl] = useState<string | null>(document?.fileUrl ?? null)
  const [loading, setLoading] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const parents = categories.filter((c) => !c.parentId)
  const children = (parentId: string) => categories.filter((c) => c.parentId === parentId)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setExtracting(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/documents/extract', { method: 'POST', body: formData })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Erreur lors de l\'extraction.')
        return
      }

      setContent(data.text)
      if (!title) setTitle(file.name.replace(/\.[^.]+$/, ''))
      if (data.fileUrl) setFileUrl(data.fileUrl)
    } catch {
      setError('Impossible de lire le fichier.')
    } finally {
      setExtracting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !content.trim()) {
      setError('Le titre et le contenu sont obligatoires.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      await onSubmit({ title, content, type, categoryId: categoryId || null, fileUrl })
    } catch {
      setError('Une erreur est survenue.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        label="Titre"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Ex. : Guide d'installation..."
        required
      />

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Importer un fichier <span className="text-gray-400">(PDF, Word, TXT)</span>
        </label>
        <div
          className={`flex cursor-pointer items-center gap-3 rounded-lg border-2 border-dashed px-4 py-3 text-sm transition ${extracting ? 'cursor-wait border-amber-300 bg-amber-50 text-amber-700' : 'border-gray-300 text-gray-500 hover:border-amber-400 hover:text-amber-600'}`}
          onClick={() => !extracting && fileRef.current?.click()}
        >
          {extracting ? (
            <>
              <Spinner size="sm" />
              <span>Analyse du fichier en cours…</span>
            </>
          ) : (
            <>
              <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              <span>{fileUrl ? '✓ Fichier importé — cliquer pour remplacer' : 'Cliquez pour importer un fichier'}</span>
            </>
          )}
        </div>
        {extracting && (
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-amber-100">
            <div className="h-full animate-pulse rounded-full bg-amber-400" style={{ width: '100%' }} />
          </div>
        )}
        <input ref={fileRef} type="file" accept=".pdf,.docx,.txt" className="hidden" onChange={handleFileChange} />
        {fileUrl && (
          <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-amber-600 hover:underline">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
            Voir le fichier original
          </a>
        )}
      </div>

      <Textarea
        label="Contenu extrait"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Collez le contenu ou importez un fichier ci-dessus…"
        rows={10}
        required
      />

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as DocumentType)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            <option value="PUBLIC">Public</option>
            <option value="INTERNAL">Interne</option>
            <option value="FRANCHISE">Franchisé</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Catégorie</label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            <option value="">— Aucune —</option>
            {parents.map((parent) => {
              const subs = children(parent.id)
              return subs.length > 0 ? (
                <optgroup key={parent.id} label={parent.name}>
                  {subs.map((sub) => (
                    <option key={sub.id} value={sub.id}>{sub.name}</option>
                  ))}
                </optgroup>
              ) : (
                <option key={parent.id} value={parent.id}>{parent.name}</option>
              )
            })}
          </select>
        </div>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="secondary" onClick={onCancel}>Annuler</Button>
        <Button type="submit" loading={loading}>
          {document?.id ? 'Enregistrer' : 'Créer le document'}
        </Button>
      </div>
    </form>
  )
}
