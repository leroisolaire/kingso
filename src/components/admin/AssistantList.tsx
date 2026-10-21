'use client'

import { useState } from 'react'
import { useOrigin } from '@/hooks/useOrigin'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Badge from '@/components/ui/Badge'
import type { AssistantSummary } from '@/types/assistant'

const STATUS: Record<AssistantSummary['status'], { label: string; variant: 'published' | 'draft' | 'neutral' }> = {
  ACTIVE: { label: 'Actif', variant: 'published' },
  DRAFT: { label: 'Brouillon', variant: 'draft' },
  DISABLED: { label: 'Désactivé', variant: 'neutral' },
}

export default function AssistantList({ assistants }: { assistants: AssistantSummary[] }) {
  const router = useRouter()
  const origin = useOrigin()
  const [copied, setCopied] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const copy = async (slug: string) => {
    await navigator.clipboard.writeText(`${origin}/c/${slug}`)
    setCopied(slug)
    setTimeout(() => setCopied(null), 1500)
  }

  const duplicate = async (id: string) => {
    setBusy(id)
    const res = await fetch(`/api/assistants/${id}`, { method: 'POST' })
    setBusy(null)
    if (res.ok) {
      const copy = await res.json()
      router.push(`/admin/assistants/${copy.id}`)
    }
  }

  if (assistants.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-gray-500">
        Aucun chat pour l&apos;instant. Créez le premier avec « + Nouveau chat ».
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {assistants.map((a) => (
        <div key={a.id} className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium text-gray-900">{a.name}</p>
              <Badge variant={STATUS[a.status].variant}>{STATUS[a.status].label}</Badge>
              <Badge variant={a.audience === 'CUSTOMER' ? 'public' : 'internal'}>
                {a.audience === 'CUSTOMER' ? 'Clients' : 'Collaborateurs'}
              </Badge>
              {a.access === 'PASSWORD' && <Badge variant="neutral">🔒 Mot de passe</Badge>}
            </div>
            <p className="mt-1 truncate font-mono text-xs text-gray-500">/c/{a.slug}</p>
            <p className="mt-1 text-xs text-gray-400">
              {a.conversationCount} conversation{a.conversationCount > 1 ? 's' : ''}
              {a.escalationEnabled && ` · ${a.escalationCount} demande${a.escalationCount > 1 ? 's' : ''} SAV`}
              {` · ${a.categoryIds.length} catégorie${a.categoryIds.length > 1 ? 's' : ''}`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <button type="button" onClick={() => copy(a.slug)} className="text-gray-600 hover:text-gray-900">
              {copied === a.slug ? '✓ Copié' : 'Copier le lien'}
            </button>
            <a href={`/c/${a.slug}`} target="_blank" rel="noopener noreferrer" className="text-gray-600 hover:text-gray-900">
              {a.status === 'ACTIVE' ? 'Ouvrir' : 'Aperçu'} ↗
            </a>
            <Link href={`/admin/history?assistant=${a.id}`} className="text-gray-600 hover:text-gray-900">Historique</Link>
            <button type="button" onClick={() => duplicate(a.id)} disabled={busy === a.id} className="text-gray-600 hover:text-gray-900 disabled:opacity-50">
              Dupliquer
            </button>
            <Link href={`/admin/assistants/${a.id}`} className="font-medium text-amber-600 hover:underline">Modifier</Link>
          </div>
        </div>
      ))}
    </div>
  )
}
