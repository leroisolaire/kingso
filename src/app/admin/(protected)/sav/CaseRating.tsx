'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { DIFFICULTY_LABELS, URGENCY_LABELS } from '@/lib/sav/rating'

/** 5 icônes cliquables ; un clic sur la note déjà choisie l'efface. */
function RatingInput({ label, icon, value, labels, onChange, disabled }: {
  label: string
  icon: string
  value: number | null
  labels: Record<number, string>
  onChange: (value: number | null) => void
  disabled?: boolean
}) {
  const [hover, setHover] = useState<number | null>(null)
  const shown = hover ?? value ?? 0
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="w-20 shrink-0 text-sm text-gray-600">{label}</span>
      <div className="flex" onMouseLeave={() => setHover(null)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            disabled={disabled}
            onMouseEnter={() => setHover(n)}
            onClick={() => onChange(n === value ? null : n)}
            className={`px-0.5 text-xl leading-none transition ${n <= shown ? '' : 'opacity-20 grayscale'} disabled:cursor-wait`}
            aria-label={`${label} ${n} sur 5 : ${labels[n]}`}
            title={`${n}/5 : ${labels[n]}`}
          >
            {icon}
          </button>
        ))}
      </div>
      <span className="text-xs text-gray-500">{shown ? `${shown}/5 · ${labels[shown]}` : 'non notée'}</span>
    </div>
  )
}

/** Urgence (proposée par Kingso) et difficulté du dossier, modifiables par tous à tout moment. */
export default function CaseRating({ caseId, urgency, difficulty }: { caseId: string; urgency: number | null; difficulty: number | null }) {
  const router = useRouter()
  const [values, setValues] = useState({ urgency, difficulty })
  const [loaded, setLoaded] = useState({ urgency, difficulty })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Valeurs changées ailleurs (autre onglet, planning) : on affiche les nouvelles
  if (loaded.urgency !== urgency || loaded.difficulty !== difficulty) {
    setLoaded({ urgency, difficulty })
    setValues({ urgency, difficulty })
  }

  const save = async (patch: { urgency?: number | null; difficulty?: number | null }) => {
    const previous = values
    setValues({ ...values, ...patch })
    setBusy(true)
    setError(null)
    const res = await fetch(`/api/sav/cases/${caseId}/actions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'rate', ...patch }),
    }).catch(() => null)
    setBusy(false)
    if (!res?.ok) {
      setValues(previous)
      setError('Note non enregistrée.')
      return
    }
    router.refresh()
  }

  return (
    <div className="space-y-1.5">
      <RatingInput label="Urgence" icon="🔥" value={values.urgency} labels={URGENCY_LABELS} onChange={(v) => save({ urgency: v })} disabled={busy} />
      <RatingInput label="Difficulté" icon="🔧" value={values.difficulty} labels={DIFFICULTY_LABELS} onChange={(v) => save({ difficulty: v })} disabled={busy} />
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
