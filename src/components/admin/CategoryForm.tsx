'use client'

import { useState } from 'react'
import Input from '@/components/ui/Input'
import Textarea from '@/components/ui/Textarea'
import Button from '@/components/ui/Button'
import type { Category } from '@/types/category'

interface CategoryFormProps {
  category?: Partial<Category>
  categories?: Category[]
  onSubmit: (data: Omit<Category, 'id' | 'createdAt'>) => Promise<void>
  onCancel: () => void
}

export default function CategoryForm({ category, categories = [], onSubmit, onCancel }: CategoryFormProps) {
  const [name, setName] = useState(category?.name ?? '')
  const [description, setDescription] = useState(category?.description ?? '')
  const [parentId, setParentId] = useState<string>(category?.parentId ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Exclure la catégorie en cours d'édition des parents possibles
  const parentOptions = categories.filter((c) => c.id !== category?.id && !c.parentId)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('Le nom est obligatoire.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      await onSubmit({ name, description: description || null, parentId: parentId || null })
    } catch {
      setError('Une erreur est survenue.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        label="Nom"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Ex. : Panneaux monocristallins"
        required
      />
      <Textarea
        label="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description optionnelle..."
        rows={3}
      />
      {parentOptions.length > 0 && (
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Catégorie parente <span className="text-gray-400">(optionnel)</span>
          </label>
          <select
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          >
            <option value="">— Aucune (catégorie principale) —</option>
            {parentOptions.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      )}
      {error && <p className="text-sm text-red-500">{error}</p>}
      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="secondary" onClick={onCancel}>Annuler</Button>
        <Button type="submit" loading={loading}>
          {category?.id ? 'Enregistrer' : 'Créer'}
        </Button>
      </div>
    </form>
  )
}
