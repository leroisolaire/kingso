'use client'

import { DURATION_OPTIONS, durationLabel } from '@/lib/sav/duration'

/** Durée de l'intervention, choisie avec la date du rendez-vous. */
export default function DurationSelect({ value, onChange, className = '' }: { value: number; onChange: (minutes: number) => void; className?: string }) {
  const options = [...new Set([...DURATION_OPTIONS, value])].sort((a, b) => a - b)
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      aria-label="Durée de l'intervention"
      className={`rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 ${className}`}
    >
      {options.map((m) => <option key={m} value={m}>{durationLabel(m)}</option>)}
    </select>
  )
}
