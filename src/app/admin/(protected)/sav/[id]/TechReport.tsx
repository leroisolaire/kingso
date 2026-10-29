'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'
import { prepareImage } from '@/lib/images/compress'
import { TECH_OUTCOMES, type TechOutcome } from '@/lib/sav/status'
import DictationButton from './DictationButton'

export interface CasePhoto { path: string; url: string | null }

const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500'

/** Envoi d'une action : route du dossier (équipe), ou `endpoint` (lien personnel d'un poseur). */
async function postAction(caseId: string, payload: Record<string, unknown>, endpoint?: string) {
  const res = await fetch(endpoint ?? `/api/sav/cases/${caseId}/actions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error ?? `Erreur ${res.status}`)
  return json
}

/**
 * Photos d'un dossier (intervention, ou demande du client) : prises avec le téléphone ou choisies, compressées
 * avant l'envoi, une par une. `canAdd` à false : seulement l'affichage (et la suppression si `editable`).
 */
export function TechPhotos({ caseId, photos, editable, canAdd = true, addAction = 'tech_photo', removeAction = 'tech_photo_remove', addLabel = '📷 Prendre une photo', endpoint }: {
  caseId: string
  endpoint?: string
  photos: CasePhoto[]
  editable: boolean
  canAdd?: boolean
  addAction?: string
  removeAction?: string
  addLabel?: string
}) {
  const router = useRouter()
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const upload = async (files: FileList | null) => {
    if (!files?.length) return
    setError(null)
    const list = [...files]
    setUploading(list.length)
    for (const file of list) {
      try {
        const image = await prepareImage(file)
        await postAction(caseId, { action: addAction, photo: { mediaType: image.mediaType, data: image.data } }, endpoint)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Photo non envoyée.')
      }
      setUploading((n) => n - 1)
    }
    router.refresh()
  }

  const remove = async (path: string) => {
    if (!confirm('Supprimer cette photo ?')) return
    try {
      await postAction(caseId, { action: removeAction, path }, endpoint)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Photo non supprimée.')
    }
  }

  if (!editable && photos.length === 0) return null
  return (
    <div className="space-y-2">
      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((p) => (
            <div key={p.path} className="relative">
              {p.url ? (
                <a href={p.url} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element -- URL signée temporaire du stockage privé */}
                  <img src={p.url} alt="Photo de l'intervention" className="aspect-square w-full rounded-lg object-cover ring-1 ring-gray-200" />
                </a>
              ) : (
                <div className="flex aspect-square items-center justify-center rounded-lg bg-gray-100 text-xs text-gray-400">Photo</div>
              )}
              {editable && (
                <button
                  type="button"
                  onClick={() => remove(p.path)}
                  className="absolute right-1 top-1 rounded-full bg-black/60 px-1.5 text-xs text-white hover:bg-black/80"
                  aria-label="Supprimer la photo"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {editable && canAdd && (
        <div className="flex flex-wrap items-center gap-2">
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { upload(e.target.files); e.target.value = '' }} />
          <input ref={galleryRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { upload(e.target.files); e.target.value = '' }} />
          <Button type="button" size="sm" variant="secondary" onClick={() => cameraRef.current?.click()} disabled={uploading > 0}>{addLabel}</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => galleryRef.current?.click()} disabled={uploading > 0}>Choisir des photos</Button>
          {uploading > 0 && <span className="text-xs text-gray-500">Envoi et lecture par Kingso… ({uploading})</span>}
        </div>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

/** Retour du technicien après l'intervention : issue, compte rendu (dicté ou tapé) et photos. */
export function TechReportForm({ caseId, photos, onCancel, endpoint }: { caseId: string; photos: CasePhoto[]; onCancel?: () => void; endpoint?: string }) {
  const router = useRouter()
  const [outcome, setOutcome] = useState<TechOutcome | null>(null)
  const [report, setReport] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!outcome) return
    setBusy(true)
    setError(null)
    try {
      await postAction(caseId, { action: 'tech_report', outcome, report }, endpoint)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Retour non enregistré.')
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3 rounded-lg bg-orange-50 p-3 ring-1 ring-orange-200">
      <p className="text-sm font-semibold text-orange-900">Retour d&apos;intervention</p>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {(Object.entries(TECH_OUTCOMES) as [TechOutcome, (typeof TECH_OUTCOMES)[TechOutcome]][]).map(([key, o]) => (
          <button
            key={key}
            type="button"
            onClick={() => setOutcome(key)}
            className={`rounded-lg px-3 py-2.5 text-left text-sm font-medium ring-1 ${outcome === key ? 'bg-orange-600 text-white ring-orange-600' : 'bg-white text-gray-800 ring-gray-300 hover:bg-orange-100'}`}
          >
            <span aria-hidden="true">{o.icon}</span> {o.label}
          </button>
        ))}
      </div>
      <textarea
        value={report}
        onChange={(e) => setReport(e.target.value)}
        rows={6}
        placeholder="Compte rendu : ce qui a été constaté et fait, pièces à commander… Tapez ou dictez avec le micro"
        className={`${inputCls} min-h-36 resize-y bg-white`}
      />
      <DictationButton value={report} onChange={setReport} disabled={busy} />
      <TechPhotos caseId={caseId} photos={photos} editable endpoint={endpoint} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={submit} loading={busy} disabled={!outcome || busy}>Enregistrer le retour</Button>
        {onCancel && <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>Annuler</Button>}
      </div>
    </div>
  )
}
