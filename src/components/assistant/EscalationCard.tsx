'use client'

import { useState, type FormEvent, type InputHTMLAttributes } from 'react'

interface EscalationForm {
  firstName: string
  lastName: string
  phone: string
  postalCode: string
  email: string
}

type SubmitResult = { ok: true } | { ok: false; error: string; fields?: Record<string, string> }

interface EscalationCardProps {
  sent: boolean
  onSubmit: (form: EscalationForm) => Promise<SubmitResult>
  onClose?: () => void
}

function Field({ label, error, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-600">{label}</span>
      <input
        {...props}
        className={`h-12 w-full rounded-xl border bg-white px-3.5 text-base text-gray-900 outline-none focus:border-[#e73e11] focus:ring-4 focus:ring-[#e73e11]/10 ${error ? 'border-red-400' : 'border-gray-200'}`}
      />
      {error && <span className="mt-1 block text-xs text-red-500">{error}</span>}
    </label>
  )
}

export default function EscalationCard({ sent, onSubmit, onClose }: EscalationCardProps) {
  const [form, setForm] = useState<EscalationForm>({ firstName: '', lastName: '', phone: '', postalCode: '', email: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fields, setFields] = useState<Record<string, string>>({})

  const set = (key: keyof EscalationForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setFields({})
    const result = await onSubmit(form)
    setLoading(false)
    if (!result.ok) {
      setError(result.error)
      setFields(result.fields ?? {})
    }
  }

  if (sent) {
    return (
      <div className="message-in rounded-2xl border border-green-200 bg-green-50 px-5 py-4 text-[15px] text-green-800" style={{ opacity: 0 }}>
        <p className="font-semibold">Votre demande a bien été transmise au SAV.</p>
        <p className="mt-1 text-sm text-green-700">
          Notre équipe a reçu le résumé de notre échange et vos photos. Elle va prendre contact avec vous rapidement.
        </p>
      </div>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="message-in rounded-2xl bg-white p-4 shadow-[0_1px_12px_rgba(0,0,0,0.06)] ring-1 ring-black/5 sm:p-5"
      style={{ opacity: 0 }}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-[15px] font-semibold text-gray-900">Transmettre ma demande au SAV</p>
          <p className="mt-0.5 text-sm text-gray-500">
            Le SAV recevra notre conversation et vos photos, et prendra contact avec vous rapidement.
          </p>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Fermer" className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100">
            ✕
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Prénom" value={form.firstName} onChange={set('firstName')} autoComplete="given-name" required error={fields.firstName} />
        <Field label="Nom" value={form.lastName} onChange={set('lastName')} autoComplete="family-name" required error={fields.lastName} />
        <Field label="Téléphone" value={form.phone} onChange={set('phone')} type="tel" inputMode="tel" autoComplete="tel" required error={fields.phone} />
        <Field label="Code postal" value={form.postalCode} onChange={set('postalCode')} inputMode="numeric" autoComplete="postal-code" maxLength={5} required error={fields.postalCode} />
        <div className="col-span-2">
          <Field label="Email (facultatif)" value={form.email} onChange={set('email')} type="email" inputMode="email" autoComplete="email" error={fields.email} />
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#e73e11] text-base font-semibold text-white shadow-md transition-opacity disabled:opacity-60"
      >
        {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
        Envoyer au SAV
      </button>

      <p className="mt-3 text-[11px] leading-snug text-gray-400">
        Vos coordonnées sont utilisées uniquement par Le Roi Solaire pour traiter votre demande SAV.
      </p>
    </form>
  )
}
