'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { DocumentStatus } from '@/types/document'

/** Relance (erreur) ou reprend (interrompu) le traitement d'un document, jusqu'à la fin. */
export default function ReprocessButton({ documentId, status }: { documentId: string; status: DocumentStatus }) {
  const router = useRouter()
  const [running, setRunning] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const run = async () => {
    setRunning(true)
    setMessage(null)
    let retry = status === 'ERROR'
    for (;;) {
      const res = await fetch(`/api/documents/${documentId}/process${retry ? '?retry=1' : ''}`, { method: 'POST' })
      retry = false
      const result = await res.json().catch(() => ({ error: `Erreur ${res.status}` }))
      if (!res.ok) {
        setMessage(result.error ?? 'Erreur')
        break
      }
      setMessage(result.message ?? null)
      if (result.status !== 'PROCESSING') break
      if (result.retryAfter) await new Promise((r) => setTimeout(r, result.retryAfter * 1000))
    }
    setRunning(false)
    router.refresh()
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={run}
        disabled={running}
        className="rounded-md bg-amber-500 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-600 disabled:opacity-60"
      >
        {running ? 'Traitement en cours…' : status === 'ERROR' ? 'Relancer le traitement' : 'Reprendre le traitement'}
      </button>
      {message && <span className="text-xs text-gray-500">{message}</span>}
    </span>
  )
}
