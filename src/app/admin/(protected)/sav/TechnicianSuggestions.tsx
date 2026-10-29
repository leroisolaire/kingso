'use client'

import { useEffect, useState } from 'react'
import type { Suggestions } from '@/lib/sav/suggest'

/**
 * Intervenants proposés par Kingso pour un dossier (compétence, difficulté, secteur, chantier proche).
 * Seulement une aide : « Choisir » remplit le champ intervenant, l'équipe enregistre.
 */
export default function TechnicianSuggestions({ caseId, selected, onPick, disabled }: {
  caseId: string
  selected: string
  onPick: (technicianId: string) => void
  disabled?: boolean
}) {
  const [data, setData] = useState<Suggestions | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [all, setAll] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/sav/cases/${caseId}/suggestions`)
      .then(async (res) => {
        const json = await res.json().catch(() => ({}))
        if (cancelled) return
        if (res.ok) setData(json)
        else setError(json.error ?? `Erreur ${res.status}`)
      })
      .catch(() => !cancelled && setError('Suggestions indisponibles.'))
    return () => { cancelled = true }
  }, [caseId])

  if (error) return <p className="text-xs text-red-600">{error}</p>
  if (!data) return <p className="text-xs text-gray-500">Kingso cherche les intervenants adaptés…</p>
  if (data.items.length === 0) return <p className="text-xs text-gray-500">Aucun intervenant : ajoutez-les dans « Intervenants ».</p>

  const shown = all ? data.items : data.items.slice(0, 3)
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-gray-700">
        Intervenants proposés
        <span className="font-normal text-gray-500">
          {data.skill ? ` · besoin : ${data.skill}` : ' · produit non repéré'}
          {data.difficulty ? ` · 🔧${data.difficulty}` : ''}
        </span>
      </p>
      <ul className="space-y-1.5">
        {shown.map((s) => (
          <li key={s.id} className={`rounded-lg px-2.5 py-2 text-xs ring-1 ${s.id === selected ? 'bg-amber-50 ring-amber-400' : s.ok ? 'bg-white ring-emerald-200' : 'bg-white ring-gray-200'}`}>
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0">
                <span className="font-semibold text-gray-900">{s.ok ? '✅' : '⚠️'} {s.name}</span>
                <span className="text-gray-500">{s.kind === 'POSEUR' ? ' · poseur' : ''}</span>
              </p>
              {s.id === selected
                ? <span className="shrink-0 font-semibold text-amber-700">Choisi</span>
                : <button type="button" onClick={() => onPick(s.id)} disabled={disabled} className="shrink-0 rounded-md bg-slate-900 px-2 py-1 font-semibold text-white hover:bg-slate-700 disabled:opacity-50">Choisir</button>}
            </div>
            {s.strengths.length > 0 && <p className="mt-0.5 text-emerald-800">✓ {s.strengths.join(' · ')}</p>}
            {s.warnings.length > 0 && <p className="mt-0.5 text-orange-700">{s.warnings.join(' · ')}</p>}
            {s.nearby.map((n, i) => (
              <p key={i} className={`mt-0.5 ${n.sameDay ? 'font-semibold text-sky-800' : 'text-sky-700'}`} title={n.title}>
                📍 Chantier à {n.km < 1 ? 'moins d’1' : `≈ ${n.km}`} km · {n.days.slice(0, 3).join(', ')}{n.days.length > 3 ? '…' : ''}{n.sameDay ? ' · le jour du rendez-vous' : ''}
              </p>
            ))}
          </li>
        ))}
      </ul>
      {data.items.length > 3 && (
        <button type="button" onClick={() => setAll(!all)} className="text-xs text-amber-700 hover:underline">
          {all ? 'Voir moins' : `Voir les ${data.items.length} intervenants`}
        </button>
      )}
      {data.chantiers === 'no-address' && <p className="text-[11px] text-gray-400">Adresse du dossier introuvable : chantiers proches non calculés.</p>}
      {data.chantiers === 'error' && <p className="text-[11px] text-red-600">Agenda des chantiers non lu : {data.chantierError}</p>}
    </div>
  )
}
