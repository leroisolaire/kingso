'use client'

import type { Category } from '@/types/category'

interface CategorySelectProps {
  categories: Category[]
  value: string
  onChange: (id: string) => void
  emptyLabel?: string
  /** Permet de choisir une catégorie parente même si elle a des sous-catégories */
  allowParents?: boolean
}

/** Liste déroulante des catégories, sous-catégories regroupées sous leur parent. */
export default function CategorySelect({ categories, value, onChange, emptyLabel = '— Aucune —', allowParents = false }: CategorySelectProps) {
  const parents = categories.filter((c) => !c.parentId)
  const children = (parentId: string) => categories.filter((c) => c.parentId === parentId)

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
    >
      <option value="">{emptyLabel}</option>
      {parents.map((parent) => {
        const subs = children(parent.id)
        if (subs.length === 0) return <option key={parent.id} value={parent.id}>{parent.name}</option>
        return (
          <optgroup key={parent.id} label={parent.name}>
            {allowParents && <option value={parent.id}>{parent.name} (catégorie principale)</option>}
            {subs.map((sub) => (
              <option key={sub.id} value={sub.id}>{sub.name}</option>
            ))}
          </optgroup>
        )
      })}
    </select>
  )
}
