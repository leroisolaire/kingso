'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Button from '@/components/ui/Button'
import type { SyncReport, QueueResult } from '@/lib/drive/sync'

interface Props {
  serviceAccountEmail: string | null
  source: { name: string; folderId: string; lastSyncAt: string | null; lastSyncReport: SyncReport | null } | null
  mappings: { folderName: string; categoryName: string }[]
  categories: { id: string; name: string }[]
  counts: { driveDocs: number; pending: number; errors: number }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="mb-3 text-base font-semibold text-gray-900">{title}</h2>
      {children}
    </section>
  )
}

function ReportSummary({ report }: { report: SyncReport }) {
  const items = [
    [report.filesSeen, 'fichier(s) dans le Drive'],
    [report.linked, 'rattaché(s) à un document déjà importé'],
    [report.created, 'nouveau(x)'],
    [report.modified, 'modifié(s), à retraiter'],
    [report.updated, 'déplacé(s) ou renommé(s)'],
    [report.deleted, 'retiré(s) de Kingso'],
  ] as const
  return (
    <div className="space-y-3 text-sm">
      {report.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700">{report.error}</p>}
      <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
        {items.map(([n, label]) => (
          <li key={label} className={n ? 'text-gray-800' : 'text-gray-400'}>
            <span className="font-semibold">{n}</span> {label}
          </li>
        ))}
      </ul>
      {report.skipped.length > 0 && (
        <details className="rounded-lg bg-gray-50 px-3 py-2">
          <summary className="cursor-pointer text-gray-700">{report.skipped.length} fichier(s) ignoré(s)</summary>
          <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto text-xs text-gray-600">
            {report.skipped.map((s, i) => (
              <li key={i}><span className="font-mono">{s.path}</span> — {s.reason}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

export default function DriveSyncClient({ serviceAccountEmail, source, mappings, categories, counts }: Props) {
  const router = useRouter()
  const [link, setLink] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [stopRequested, setStopRequested] = useState(false)
  const stopRef = useRef(false)
  const [status, setStatus] = useState<string | null>(null)
  const [report, setReport] = useState<SyncReport | null>(source?.lastSyncReport ?? null)
  const [processed, setProcessed] = useState<string[]>([])
  const [processErrors, setProcessErrors] = useState<{ title: string; message: string }[]>([])
  const [mappingChoice, setMappingChoice] = useState<Record<string, string>>({})

  const saveSource = async () => {
    setSaving(true)
    setError(null)
    const res = await fetch('/api/drive', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ link }) })
    const data = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) return setError(data.error ?? 'Erreur')
    setLink('')
    router.refresh()
  }

  const processQueue = async () => {
    stopRef.current = false
    setStopRequested(false)
    for (;;) {
      const res = await fetch('/api/drive/process', { method: 'POST' })
      const data: QueueResult & { error?: string } = await res.json().catch(() => ({ error: `Erreur ${res.status}` }))
      if (!res.ok) {
        setProcessErrors((prev) => [...prev, { title: 'Traitement', message: data.error ?? 'Erreur' }])
        break
      }
      setProcessed((prev) => [...prev, ...data.processed])
      setProcessErrors((prev) => [...prev, ...data.errors])
      setStatus(data.remaining > 0 ? `Traitement des fichiers : ${data.remaining} restant(s)…` : null)
      if (data.remaining === 0 || stopRef.current) break
      if (data.retryAfter) await sleep(data.retryAfter * 1000)
    }
  }

  const sync = async () => {
    setRunning(true)
    setError(null)
    setProcessed([])
    setProcessErrors([])
    setStatus('Lecture du Drive…')
    const res = await fetch('/api/drive/sync', { method: 'POST' })
    const data: SyncReport & { error?: string } = await res.json().catch(() => ({ error: `Erreur ${res.status}` }))
    if (data.filesSeen !== undefined) setReport(data)
    if (!res.ok) {
      setError(data.error ?? 'Synchronisation impossible')
    } else {
      setStatus('Traitement des fichiers…')
      await processQueue()
    }
    setStatus(null)
    setRunning(false)
    router.refresh()
  }

  const saveMapping = async (folderName: string) => {
    const categoryId = mappingChoice[folderName]
    if (!categoryId) return
    const res = await fetch('/api/drive/mappings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folderName, categoryId }) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return setError(data.error ?? 'Erreur')
    setReport((r) => (r ? { ...r, unmappedFolders: r.unmappedFolders.filter((f) => f !== folderName) } : r))
    router.refresh()
  }

  const deleteMapping = async (folderName: string) => {
    await fetch(`/api/drive/mappings?folderName=${encodeURIComponent(folderName)}`, { method: 'DELETE' })
    router.refresh()
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Google Drive</h1>
        <p className="mt-1 text-sm text-gray-500">
          Le Drive fait foi : les documents ajoutés, modifiés, déplacés ou supprimés dans le Drive le sont aussi dans Kingso,
          chaque nuit ou avec « Synchroniser maintenant ».
        </p>
      </div>

      <Card title="Connexion">
        {!serviceAccountEmail ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            Clé Google absente : ajoutez la variable GOOGLE_SERVICE_ACCOUNT_KEY (en local et sur Vercel).
          </p>
        ) : (
          <div className="space-y-4 text-sm">
            <p className="text-gray-600">
              Compte de service à ajouter en <strong>Lecteur</strong> du Drive partagé :
              <span className="mt-1 block break-all rounded bg-gray-50 px-2 py-1 font-mono text-xs text-gray-800">{serviceAccountEmail}</span>
            </p>
            {source && (
              <p className="text-gray-700">
                Dossier synchronisé : <strong>{source.name}</strong>
                {source.lastSyncAt && <span className="text-gray-500"> · dernière synchronisation le {new Date(source.lastSyncAt).toLocaleString('fr-FR')}</span>}
              </p>
            )}
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="Lien du Drive partagé « Kingso » (https://drive.google.com/drive/folders/…)"
                className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <Button type="button" variant="secondary" onClick={saveSource} loading={saving} disabled={!link.trim()}>
                {source ? 'Changer de dossier' : 'Connecter'}
              </Button>
            </div>
          </div>
        )}
      </Card>

      {source && (
        <Card title="Synchronisation">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Button type="button" onClick={sync} loading={running}>Synchroniser maintenant</Button>
            {running && status?.startsWith('Traitement') && (
              <Button type="button" variant="ghost" size="sm" onClick={() => { stopRef.current = true; setStopRequested(true) }}>
                {stopRequested ? 'Arrêt après ce fichier…' : 'Arrêter'}
              </Button>
            )}
            <span className="text-sm text-gray-500">
              {counts.driveDocs} document(s) liés au Drive
              {counts.pending > 0 && ` · ${counts.pending} en attente`}
              {counts.errors > 0 && <> · <Link href="/admin/documents" className="text-red-600 underline">{counts.errors} en erreur</Link></>}
            </span>
          </div>
          {status && (
            <p className="mb-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-amber-200 border-t-amber-600" />
              {status} Gardez la page ouverte.
            </p>
          )}
          {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {report ? <ReportSummary report={report} /> : <p className="text-sm text-gray-500">Aucune synchronisation pour l&apos;instant.</p>}
          {(processed.length > 0 || processErrors.length > 0) && (
            <div className="mt-4 space-y-1 text-sm">
              {processed.length > 0 && <p className="text-green-700">✓ {processed.length} fichier(s) traité(s)</p>}
              {processErrors.map((e, i) => <p key={i} className="text-red-600">✗ {e.title} : {e.message}</p>)}
            </div>
          )}
        </Card>
      )}

      {source && (
        <Card title="Dossiers et catégories">
          <p className="mb-3 text-sm text-gray-600">
            Un dossier de 2e niveau (ex. <span className="font-mono">Public/PAC</span>) est rangé dans la catégorie du même nom.
            Sinon, associez-le ici à une catégorie : ses sous-dossiers deviennent des sous-catégories.
          </p>
          {report && report.unmappedFolders.length > 0 && (
            <div className="mb-4 space-y-2">
              {report.unmappedFolders.map((folder) => (
                <div key={folder} className="flex flex-col gap-2 rounded-lg bg-amber-50 p-3 sm:flex-row sm:items-center">
                  <span className="text-sm text-amber-900">Dossier <strong>« {folder} »</strong> → </span>
                  <select
                    value={mappingChoice[folder] ?? ''}
                    onChange={(e) => setMappingChoice((m) => ({ ...m, [folder]: e.target.value }))}
                    className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">— Choisir une catégorie —</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <Button type="button" size="sm" onClick={() => saveMapping(folder)} disabled={!mappingChoice[folder]}>Associer</Button>
                </div>
              ))}
              <p className="text-xs text-gray-500">Après avoir associé les dossiers, relancez « Synchroniser maintenant ».</p>
            </div>
          )}
          {mappings.length > 0 ? (
            <ul className="space-y-1 text-sm">
              {mappings.map((m) => (
                <li key={m.folderName} className="flex items-center justify-between gap-3">
                  <span><span className="font-mono">{m.folderName}</span> → {m.categoryName}</span>
                  <button type="button" onClick={() => deleteMapping(m.folderName)} className="text-xs text-red-500 hover:underline">Retirer</button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-400">Aucune correspondance enregistrée.</p>
          )}
        </Card>
      )}
    </div>
  )
}
