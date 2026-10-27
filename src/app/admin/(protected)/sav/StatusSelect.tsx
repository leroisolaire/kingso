'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { SavStatus } from '@prisma/client'
import { STATUS_COLORS, STATUS_LABELS } from '@/lib/sav/status'

/** Changement de statut directement depuis la liste des dossiers (le dossier change d'onglet). */
export default function StatusSelect({ caseId, status }: { caseId: string; status: SavStatus }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  const change = async (next: string) => {
    if (next === status) return
    setBusy(true)
    setError(false)
    const res = await fetch(`/api/sav/cases/${caseId}/actions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'status', status: next }),
    })
    setBusy(false)
    if (!res.ok) setError(true)
    router.refresh()
  }

  return (
    <select
      value={status}
      onChange={(e) => change(e.target.value)}
      disabled={busy}
      title={error ? 'Le statut n\'a pas pu être changé' : 'Changer le statut'}
      className={`cursor-pointer rounded-full border-0 py-0.5 pl-2 pr-6 text-xs font-medium ring-1 ${error ? 'ring-red-500' : 'ring-black/10'} ${STATUS_COLORS[status]} ${busy ? 'opacity-50' : ''}`}
    >
      {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k} className="bg-white text-gray-900">{v}</option>)}
    </select>
  )
}
