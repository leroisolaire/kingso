'use client'

import { useState } from 'react'
import Input from '@/components/ui/Input'
import Textarea from '@/components/ui/Textarea'
import Button from '@/components/ui/Button'
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
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      <Input
        label="Titre"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Ex. : Guide d'installation..."
        required
      />

      <Textarea
        label="Contenu"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Contenu du document..."
        rows={6}
        required
      />

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as DocumentType)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
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
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            <option value="">— Aucune —</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
        </div>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Annuler
        </Button>
        <Button type="submit" loading={loading}>
          {document?.id ? 'Enregistrer' : 'Créer le document'}
        </Button>
      </div>
    </form>
  )
}
