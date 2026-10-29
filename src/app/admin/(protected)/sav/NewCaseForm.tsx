'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'
import { prepareImage, type PreparedImage } from '@/lib/images/compress'

const MAX_PHOTOS = 5

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
  const [photos, setPhotos] = useState<PreparedImage[]>([])
  const [preparing, setPreparing] = useState(false)
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const isVoicemail = /Transcription automatique\s*:/i.test(text)

  // Photos compressées dans le navigateur (une photo de téléphone de plusieurs Mo devient quelques centaines de Ko)
  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return
    setPreparing(true)
    setError(null)
    const room = MAX_PHOTOS - photos.length
    const prepared: PreparedImage[] = []
    for (const file of [...files].slice(0, room)) {
      try { prepared.push(await prepareImage(file)) } catch { setError('Une photo n’a pas pu être lue.') }
    }
    if (files.length > room) setError(`${MAX_PHOTOS} photos au maximum.`)
    setPhotos((prev) => [...prev, ...prepared])
    setPreparing(false)
  }

  const submit = async () => {
    setBusy(true)
    setError(null)
    const res = await fetch('/api/sav/cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, phone, photos: photos.map(({ mediaType, data }) => ({ mediaType, data })) }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) return setError(data.error ?? `Erreur ${res.status}`)
    setText('')
    setPhone('')
    setPhotos([])
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
      <div className="space-y-2">
        {photos.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {photos.map((p, i) => (
              <div key={i} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element -- miniature locale (data URL) */}
                <img src={p.thumbnail} alt={`Photo ${i + 1}`} className="h-20 w-20 rounded-lg object-cover ring-1 ring-gray-200" />
                <button
                  type="button"
                  onClick={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}
                  className="absolute right-1 top-1 rounded-full bg-black/60 px-1.5 text-xs text-white hover:bg-black/80"
                  aria-label="Retirer la photo"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        {photos.length < MAX_PHOTOS && (
          <div className="flex flex-wrap items-center gap-2">
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { addPhotos(e.target.files); e.target.value = '' }} />
            <input ref={galleryRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { addPhotos(e.target.files); e.target.value = '' }} />
            <Button type="button" size="sm" variant="secondary" onClick={() => galleryRef.current?.click()} disabled={preparing || busy}>📷 Ajouter des photos</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => cameraRef.current?.click()} disabled={preparing || busy}>Prendre une photo</Button>
            <span className="text-xs text-gray-500">
              {preparing ? 'Préparation…' : 'Écran, code erreur, étiquette… Kingso les lit ; elles restent visibles par l’équipe seulement.'}
            </span>
          </div>
        )}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <Button type="button" onClick={submit} loading={busy} disabled={!text.trim() || busy || preparing}>
          Créer le dossier
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
          Annuler
        </Button>
      </div>
    </section>
  )
}
