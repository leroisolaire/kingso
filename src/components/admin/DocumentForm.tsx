'use client'

import { useState } from 'react'
import Link from 'next/link'
import Input from '@/components/ui/Input'
import Textarea from '@/components/ui/Textarea'
import Button from '@/components/ui/Button'
import DocumentStatusBadge from '@/components/admin/DocumentStatusBadge'
import CategorySelect from '@/components/admin/CategorySelect'
import type { Document, DocumentInput, DocumentType } from '@/types/document'
import type { Category } from '@/types/category'

interface DocumentFormProps {
  document?: Document
  categories: Category[]
  onSubmit: (data: DocumentInput) => Promise<void>
  onCancel: () => void
}

export default function DocumentForm({ document, categories, onSubmit, onCancel }: DocumentFormProps) {
  const [title, setTitle] = useState(document?.title ?? '')
  const [content, setContent] = useState(document?.content ?? '')
  const [type, setType] = useState<DocumentType>(document?.type ?? 'PUBLIC')
  const [categoryId, setCategoryId] = useState(document?.categoryId ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasFile = Boolean(document?.storagePath || document?.fileUrl)
  const textChanged = document && (title !== document.title || content !== document.content)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !content.trim()) {
      setError('Le titre et le contenu sont obligatoires.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      await onSubmit({ title, content, type, categoryId: categoryId || null })
    } catch {
      setError('Une erreur est survenue.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {!document && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Pour ajouter des fichiers (PDF, Word, photos…), utilisez{' '}
          <Link href="/admin/documents/import" className="font-medium underline">l&apos;import de fichiers</Link>.
          Ce formulaire sert à saisir un texte directement.
        </p>
      )}

      {document && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">
          <DocumentStatusBadge status={document.status} message={document.statusMessage} />
          {document.pageCount ? <span>{document.pageCount} pages</span> : null}
          {document.chunkCount ? <span>{document.chunkCount} passages indexés</span> : null}
          {hasFile && (
            <a href={`/api/documents/${document.id}/file`} target="_blank" rel="noopener noreferrer" className="text-amber-600 hover:underline">
              Fichier original{document.fileName ? ` (${document.fileName})` : ''} ↗
            </a>
          )}
        </div>
      )}

      <Input
        label="Titre"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Ex. : Notice utilisateur Hitachi Yutaki S"
        required
      />

      <div>
        <Textarea
          label={document?.storagePath ? 'Texte extrait du fichier' : 'Contenu'}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Saisissez ou collez le contenu…"
          rows={14}
          required
        />
        <p className="mt-1 text-xs text-gray-500">
          {document?.pageCount
            ? 'Les repères [Page n] indiquent les pages du fichier d\'origine : gardez-les si vous corrigez le texte. '
            : ''}
          {textChanged ? 'Le texte modifié sera redécoupé et réindexé à l\'enregistrement.' : ''}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Visibilité</label>
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
          <CategorySelect categories={categories} value={categoryId} onChange={setCategoryId} />
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
