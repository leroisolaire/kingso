'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'

/**
 * Création manuelle d'un dossier : coller un email du répondeur (reconnu automatiquement),
 * ou noter une demande reçue autrement (appel, email…) avec le numéro du client.
 * Plus tard, les emails du répondeur arriveront tout seuls depuis Gmail.
 */
export default function NewCaseForm() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isVoicemail = /Transcription automatique\s*:/i.test(text)

  const submit = async () => {
    setBusy(true)
    setError(null)
    const res = await fetch('/api/sav/cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, phone }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) return setError(data.error ?? `Erreur ${res.status}`)
    setText('')
    setPhone('')
    setOpen(false)
    router.push(`/admin/sav/${data.caseId}`)
  }

  if (!open) {
    return (
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        + Nouveau dossier
      </Button>
    )
  }

  return (
    <section className="space-y-3 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="font-semibold text-gray-900">Nouveau dossier</h2>
      <p className="text-sm text-gray-500">
        Collez un email du répondeur tel quel (il est reconnu automatiquement), ou décrivez la demande du client.
        Kingso l&apos;analyse, retrouve le client et prépare l&apos;email.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        placeholder="Appelant : 06 … (SUZ)&#10;Date : …&#10;Transcription automatique :&#10;Bonjour, …"
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
      />
      {!isVoicemail && text.trim() && (
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Téléphone du client"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm sm:w-64"
        />
      )}
      {isVoicemail && <p className="text-xs text-green-700">✓ Email du répondeur reconnu</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <Button type="button" onClick={submit} loading={busy} disabled={!text.trim() || busy}>
          Créer le dossier
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
          Annuler
        </Button>
      </div>
    </section>
  )
}
