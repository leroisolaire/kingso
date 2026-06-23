'use client'

import { useState, useEffect } from 'react'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import CategoryForm from '@/components/admin/CategoryForm'
import type { Category } from '@/types/category'

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)

  async function fetchCategories() {
    const res = await fetch('/api/categories')
    const data = await res.json()
    setCategories(data)
    setLoading(false)
  }

  useEffect(() => { fetchCategories() }, [])

  const handleCreate = async (data: Omit<Category, 'id' | 'createdAt'>) => {
    await fetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    setModalOpen(false)
    fetchCategories()
  }

  const handleEdit = async (data: Omit<Category, 'id' | 'createdAt'>) => {
    if (!editing) return
    await fetch(`/api/categories/${editing.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    setEditing(null)
    fetchCategories()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer cette catégorie ?')) return
    await fetch(`/api/categories/${id}`, { method: 'DELETE' })
    fetchCategories()
  }

  const parents = categories.filter((c) => !c.parentId)

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Catégories</h1>
          <p className="mt-1 text-sm text-gray-500">{categories.length} catégorie(s)</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>+ Ajouter</Button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Chargement...</p>
      ) : parents.length === 0 ? (
        <p className="text-sm text-gray-500">Aucune catégorie. Créez-en une !</p>
      ) : (
        <div className="space-y-4">
          {parents.map((parent) => {
            const children = categories.filter((c) => c.parentId === parent.id)
            return (
              <div key={parent.id} className="rounded-xl border border-gray-200 bg-white shadow-sm">
                {/* Catégorie parente */}
                <div className="flex items-center justify-between p-5">
                  <div>
                    <h2 className="font-semibold text-gray-900">{parent.name}</h2>
                    {parent.description && (
                      <p className="mt-0.5 text-sm text-gray-500">{parent.description}</p>
                    )}
                  </div>
                  <div className="flex gap-3">
                    <button className="text-xs text-amber-600 hover:underline" onClick={() => setEditing(parent)}>Éditer</button>
                    <button className="text-xs text-red-500 hover:underline" onClick={() => handleDelete(parent.id)}>Supprimer</button>
                  </div>
                </div>

                {/* Sous-catégories */}
                {children.length > 0 && (
                  <div className="border-t border-gray-100 divide-y divide-gray-100">
                    {children.map((child) => (
                      <div key={child.id} className="flex items-center justify-between px-5 py-3 bg-gray-50">
                        <div className="flex items-center gap-2">
                          <span className="text-gray-300">↳</span>
                          <div>
                            <p className="text-sm font-medium text-gray-700">{child.name}</p>
                            {child.description && (
                              <p className="text-xs text-gray-400">{child.description}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-3">
                          <button className="text-xs text-amber-600 hover:underline" onClick={() => setEditing(child)}>Éditer</button>
                          <button className="text-xs text-red-500 hover:underline" onClick={() => handleDelete(child.id)}>Supprimer</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nouvelle catégorie">
        <CategoryForm categories={categories} onSubmit={handleCreate} onCancel={() => setModalOpen(false)} />
      </Modal>

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Modifier la catégorie">
        <CategoryForm
          category={editing ?? undefined}
          categories={categories}
          onSubmit={handleEdit}
          onCancel={() => setEditing(null)}
        />
      </Modal>
    </div>
  )
}
