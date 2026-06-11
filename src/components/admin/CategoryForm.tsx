'use client'

import { useState } from 'react'
import Input from '@/components/ui/Input'
import Textarea from '@/components/ui/Textarea'
import Button from '@/components/ui/Button'
import type { Category } from '@/types/category'

interface CategoryFormProps {
  category?: Partial<Category>
  onSubmit: (data: Omit<Category, 'id' | 'createdAt'>) => Promise<void>
  onCancel: () => void
}

export default function CategoryForm({ category, onSubmit, onCancel }: CategoryFormProps) {
  const [name, setName] = useState(category?.name ?? '')
  const [description, setDescription] = useState(category?.description ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('Le nom est obligatoire.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      await onSubmit({ name, description: description || null })
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
        placeholder="Ex. : Installation"
        required
      />
      <Textarea
        label="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description optionnelle..."
        rows={3}
      />
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
