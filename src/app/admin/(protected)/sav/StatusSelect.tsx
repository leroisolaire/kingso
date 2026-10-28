'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { SavStatus } from '@prisma/client'
import { DEFAULT_DURATION_MINUTES } from '@/lib/sav/duration'
import { STATUS_COLORS, STATUS_LABELS } from '@/lib/sav/status'
import DurationSelect from './DurationSelect'

/** Date ISO → valeur d'un champ datetime-local (heure du navigateur). */
function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

/**
 * Changement de statut directement depuis la liste des dossiers (le dossier change d'onglet).
 * « Planifié » demande la date du rendez-vous, modifiable ensuite.
 */
export default function StatusSelect({ caseId, status, appointmentAt = null, appointmentMinutes = null, defaultMinutes = DEFAULT_DURATION_MINUTES, canAddToPlanning = false }: {
  caseId: string
  status: SavStatus
  appointmentAt?: string | null
  appointmentMinutes?: number | null
  /** Durée proposée pour un nouveau rendez-vous */
  defaultMinutes?: number
  /** Dossier planifié avec une date, pas encore dans l'agenda (agenda connecté) */
  canAddToPlanning?: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const [picking, setPicking] = useState(false)
  const [date, setDate] = useState('')
  const [minutes, setMinutes] = useState(defaultMinutes)

  const post = async (payload: Record<string, unknown>) => {
    setBusy(true)
    setError(false)
    const res = await fetch(`/api/sav/cases/${caseId}/actions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    })
    setBusy(false)
    if (!res.ok) setError(true)
    else setPicking(false)
    router.refresh()
  }

  const openPicker = () => {
    setDate(toLocalInput(appointmentAt))
    setMinutes(appointmentMinutes ?? defaultMinutes)
    setPicking(true)
  }

  const change = (next: string) => {
    if (next === status) return
    if (next === 'SCHEDULED') return openPicker()
    post({ action: 'status', status: next })
  }

  if (picking) {
    return (
      <div className="flex flex-col items-stretch gap-1.5 rounded-lg bg-sky-50 p-2 ring-1 ring-sky-200 sm:items-end">
        <span className="text-xs font-semibold text-sky-900">Date du rendez-vous</span>
        <input
          type="datetime-local"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          autoFocus
          className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900"
        />
        <label className="flex items-center justify-between gap-2 text-xs text-sky-900">
          Durée
          <DurationSelect value={minutes} onChange={setMinutes} />
        </label>
        <div className="flex gap-1.5">
          <button
            type="button"
            disabled={!date || busy}
            onClick={() => post({ action: 'schedule', appointmentAt: new Date(date).toISOString(), durationMinutes: minutes })}
            className="rounded-md bg-sky-700 px-3 py-1 text-xs font-semibold text-white hover:bg-sky-800 disabled:opacity-50"
          >
            {busy ? '…' : 'Planifier'}
          </button>
          <button type="button" onClick={() => setPicking(false)} className="rounded-md px-2 py-1 text-xs text-gray-600 hover:bg-white">Annuler</button>
        </div>
        {error && <span className="text-xs text-red-600">La date n&apos;a pas pu être enregistrée.</span>}
      </div>
    )
  }

  return (
    <>
      <select
        value={status}
        onChange={(e) => change(e.target.value)}
        disabled={busy}
        title={error ? 'Le statut n\'a pas pu être changé' : 'Changer le statut'}
        className={`cursor-pointer rounded-full border-0 py-0.5 pl-2 pr-6 text-xs font-medium ring-1 ${error ? 'ring-red-500' : 'ring-black/10'} ${STATUS_COLORS[status]} ${busy ? 'opacity-50' : ''}`}
      >
        {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k} className="bg-white text-gray-900">{v}</option>)}
      </select>
      {status === 'SCHEDULED' && (
        <button type="button" onClick={openPicker} className="text-xs text-sky-700 hover:underline">
          {appointmentAt ? 'Changer la date ou la durée' : 'Saisir la date'}
        </button>
      )}
      {canAddToPlanning && (
        <button
          type="button"
          disabled={busy}
          onClick={() => post({ action: 'calendar_add' })}
          title={error ? 'L\'ajout à l\'agenda a échoué : ouvrez le dossier pour voir l\'erreur' : undefined}
          className={`rounded-md px-2 py-1 text-xs font-semibold text-white disabled:opacity-50 ${error ? 'bg-red-600' : 'bg-sky-700 hover:bg-sky-800'}`}
        >
          {busy ? '…' : '📅 Ajouter au planning'}
        </button>
      )}
    </>
  )
}
