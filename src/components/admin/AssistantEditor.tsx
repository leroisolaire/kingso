'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import AssistantForm, { type WebSourceOption } from '@/components/admin/AssistantForm'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import type { Assistant, AssistantInput } from '@/types/assistant'
import type { Category } from '@/types/category'

interface Props {
  assistant?: Assistant
  categories: Category[]
  webSources: WebSourceOption[]
}

export default function AssistantEditor({ assistant, categories, webSources }: Props) {
  const router = useRouter()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleSubmit = async (data: AssistantInput) => {
    const res = await fetch(assistant ? `/api/assistants/${assistant.id}` : '/api/assistants', {
      method: assistant ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false as const, error: body.error ?? 'Une erreur est survenue.', fields: body.fields }
    router.push('/admin/assistants')
    router.refresh()
    return { ok: true as const }
  }

  const handleDelete = async () => {
    if (!assistant) return
    setDeleting(true)
    await fetch(`/api/assistants/${assistant.id}`, { method: 'DELETE' })
    router.push('/admin/assistants')
    router.refresh()
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{assistant ? 'Modifier le chat' : 'Nouveau chat'}</h1>
          {assistant && <p className="mt-1 text-sm text-gray-500">{assistant.name}</p>}
        </div>
        {assistant && (
          <div className="flex gap-2">
            <a href={`/${assistant.slug}`} target="_blank" rel="noopener noreferrer">
              <Button type="button" variant="secondary" size="sm">Tester ↗</Button>
            </a>
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmDelete(true)}>Supprimer</Button>
          </div>
        )}
      </div>

      <AssistantForm
        assistant={assistant}
        categories={categories}
        webSources={webSources}
        onSubmit={handleSubmit}
        onCancel={() => router.push('/admin/assistants')}
      />

      {assistant && (
        <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Supprimer ce chat ?">
          <p className="text-sm text-gray-600">
            Le lien /{assistant.slug} ne fonctionnera plus. Les conversations restent dans l&apos;historique, mais les demandes SAV de ce chat seront supprimées.
            Pour simplement couper l&apos;accès, préférez le statut « Désactivé ».
          </p>
          <div className="mt-5 flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>Annuler</Button>
            <Button variant="danger" loading={deleting} onClick={handleDelete}>Supprimer</Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
