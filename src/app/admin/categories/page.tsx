'use client'

import { useState } from 'react'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import CategoryForm from '@/components/admin/CategoryForm'
import { MOCK_CATEGORIES } from '@/lib/db/fixtures'
import type { Category } from '@/types/category'

// TODO: Remplacer MOCK_CATEGORIES par un fetch('/api/categories')

export default function CategoriesPage() {
  const [categories] = useState<Category[]>(MOCK_CATEGORIES)
  const [modalOpen, setModalOpen] = useState(false)

  const handleSubmit = async (data: Omit<Category, 'id' | 'createdAt'>) => {
    // TODO: POST /api/categories
    console.log('Créer catégorie :', data)
    setModalOpen(false)
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Catégories</h1>
          <p className="mt-1 text-sm text-gray-500">{categories.length} catégorie(s)</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>+ Ajouter</Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((cat) => (
          <div key={cat.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-gray-900">{cat.name}</h2>
            {cat.description && (
              <p className="mt-1 text-sm text-gray-500">{cat.description}</p>
            )}
            <div className="mt-4 flex gap-2">
              <button className="text-xs text-amber-600 hover:underline">Éditer</button>
              <button className="text-xs text-red-500 hover:underline">Supprimer</button>
            </div>
          </div>
        ))}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nouvelle catégorie">
        <CategoryForm
          onSubmit={handleSubmit}
          onCancel={() => setModalOpen(false)}
        />
      </Modal>
    </div>
  )
}
