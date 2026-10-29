'use client'

import { useEffect, useState } from 'react'
import type { ChantierInfo, Suggestions } from '@/lib/sav/suggest'

const NEAR_KM = 30

/** Une ligne de chantier : commune, distance, nom du chantier, jours et horaires, lien vers l'agenda. */
function ChantierLine({ c, showDays }: { c: ChantierInfo; showDays: boolean }) {
  const near = c.km !== null && c.km <= NEAR_KM
  return (
    <li className={`flex items-start gap-1.5 ${near ? 'text-sky-900' : 'text-gray-600'}`}>
      <span aria-hidden="true">{near ? '📍' : '🏗'}</span>
      <span className="min-w-0">
        <strong className="font-semibold">{c.city ?? 'adresse non trouvée'}</strong>
        {c.km !== null && <span> · {c.km < 1 ? 'moins d’1 km' : `≈ ${c.km} km`}</span>}
        <span className="text-gray-500"> · « {c.title} »</span>
        {(showDays || c.hours) && (
          <span className="block text-gray-500">
            {showDays ? c.days.slice(0, 4).join(', ') + (c.days.length > 4 ? '…' : '') : ''}
            {showDays && c.hours ? ' · ' : ''}{c.hours}
            {c.onDay && showDays ? ' · le jour choisi' : ''}
          </span>
        )}
      </span>
      {c.link && <a href={c.link} target="_blank" rel="noreferrer" className="ml-auto shrink-0 text-sky-700 hover:underline">agenda ↗</a>}
    </li>
  )
}

/**
 * Intervenants proposés par Kingso pour un dossier : compétence et niveau, secteur, et où sont les intervenants
 * (chantiers proches, et chantier du jour choisi). Seulement une aide : « Choisir » remplit le champ, l'équipe enregistre.
 * `day` (AAAA-MM-JJ) : jour envisagé pour le rendez-vous ; la liste se met à jour quand il change.
 */
export default function TechnicianSuggestions({ caseId, selected, onPick, disabled, day }: {
  caseId: string
  selected: string
  onPick: (technicianId: string) => void
  disabled?: boolean
  day?: string | null
}) {
  const [data, setData] = useState<Suggestions | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [all, setAll] = useState(false)
  const validDay = day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : ''

  useEffect(() => {
    let cancelled = false
    fetch(`/api/sav/cases/${caseId}/suggestions${validDay ? `?jour=${validDay}` : ''}`)
      .then(async (res) => {
        const json = await res.json().catch(() => ({}))
        if (cancelled) return
        if (res.ok) { setData(json); setError(null) } else setError(json.error ?? `Erreur ${res.status}`)
      })
      .catch(() => !cancelled && setError('Suggestions indisponibles.'))
    return () => { cancelled = true }
  }, [caseId, validDay])

  if (error) return <p className="text-xs text-red-600">{error}</p>
  if (!data) return <p className="text-xs text-gray-500">Kingso cherche les intervenants adaptés et leurs chantiers…</p>
  if (data.items.length === 0) return <p className="text-xs text-gray-500">Aucun intervenant : ajoutez-les dans « Intervenants ».</p>

  const shown = all ? data.items : data.items.slice(0, 3)
  const agenda = data.chantiers === 'ok' || data.chantiers === 'no-address'
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-gray-700">
        Intervenants proposés
        <span className="font-normal text-gray-500">
          {data.caseCity ? ` · dossier à ${data.caseCity}` : ''}
          {data.skill ? ` · besoin : ${data.skill}` : ' · produit non repéré'}
          {data.difficulty ? ` · 🔧${data.difficulty}` : ''}
        </span>
      </p>
      <ul className="space-y-1.5">
        {shown.map((s) => {
          const others = s.nearby.filter((n) => !n.onDay)
          return (
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

              {agenda && data.day && (
                <div className="mt-1.5 rounded-md bg-gray-50 px-2 py-1.5">
                  <p className="font-semibold text-gray-700">Le {data.day} :</p>
                  {!s.hasCodes ? (
                    <p className="text-gray-400">repère agenda non renseigné (fiche Intervenants)</p>
                  ) : s.onDay.length ? (
                    <ul className="mt-0.5 space-y-0.5">{s.onDay.map((c, i) => <ChantierLine key={i} c={c} showDays={c.days.length > 1} />)}</ul>
                  ) : (
                    <p className="text-gray-500">aucun chantier dans l’agenda ce jour-là</p>
                  )}
                </div>
              )}
              {agenda && s.hasCodes && others.length > 0 && (
                <div className="mt-1.5">
                  <p className="font-semibold text-gray-700">Chantiers à moins de {NEAR_KM} km (14 prochains jours) :</p>
                  <ul className="mt-0.5 space-y-0.5">{others.map((c, i) => <ChantierLine key={i} c={c} showDays />)}</ul>
                </div>
              )}
              {agenda && !data.day && s.hasCodes && others.length === 0 && (
                <p className="mt-1 text-gray-400">Aucun chantier à moins de {NEAR_KM} km dans les 14 prochains jours.</p>
              )}
            </li>
          )
        })}
      </ul>
      {data.items.length > 3 && (
        <button type="button" onClick={() => setAll(!all)} className="text-xs text-amber-700 hover:underline">
          {all ? 'Voir moins' : `Voir les ${data.items.length} intervenants`}
        </button>
      )}
      {!data.day && agenda && <p className="text-[11px] text-gray-400">Choisissez une date pour voir où sont les intervenants ce jour-là.</p>}
      {data.chantiers === 'off' && <p className="text-[11px] text-gray-400">Agenda des chantiers non choisi (Réglages SAV) ou aucun repère agenda sur les fiches : chantiers non affichés.</p>}
      {data.chantiers === 'no-address' && <p className="text-[11px] text-gray-400">Adresse du dossier introuvable : distances non calculées.</p>}
      {data.chantiers === 'error' && <p className="text-[11px] text-red-600">Agenda des chantiers non lu : {data.chantierError}</p>}
    </div>
  )
}
