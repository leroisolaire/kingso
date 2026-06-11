'use client'

import { useState } from 'react'
import Input from '@/components/ui/Input'
import Textarea from '@/components/ui/Textarea'
import Button from '@/components/ui/Button'
import type { Faq } from '@/types/faq'
import type { Category } from '@/types/category'

interface FaqFormProps {
  faq?: Partial<Faq>
  categories: Category[]
  onSubmit: (data: Omit<Faq, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>
  onCancel: () => void
}

export default function FaqForm({ faq, categories, onSubmit, onCancel }: FaqFormProps) {
  const [question, setQuestion] = useState(faq?.question ?? '')
  const [answer, setAnswer] = useState(faq?.answer ?? '')
  const [categoryId, setCategoryId] = useState(faq?.categoryId ?? '')
  const [published, setPublished] = useState(faq?.published ?? false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!question.trim() || !answer.trim()) {
      setError('La question et la réponse sont obligatoires.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      await onSubmit({
        question,
        answer,
        categoryId: categoryId || null,
        published,
        order: faq?.order ?? 0,
      })
    } catch {
      setError('Une erreur est survenue.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        label="Question"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="Ex. : Combien de temps dure l'installation ?"
        required
      />
      <Textarea
        label="Réponse"
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        placeholder="Réponse claire et concise..."
        rows={4}
        required
      />
      <div className="grid grid-cols-2 gap-4">
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
        <div className="flex items-end pb-0.5">
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={published}
              onChange={(e) => setPublished(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 accent-amber-500"
            />
            <span className="text-sm font-medium text-gray-700">Publier</span>
          </label>
        </div>
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="secondary" onClick={onCancel}>Annuler</Button>
        <Button type="submit" loading={loading}>
          {faq?.id ? 'Enregistrer' : 'Créer'}
        </Button>
      </div>
    </form>
  )
}
