'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Button from '@/components/ui/Button'

interface VideoRow {
  id: string
  videoId: string
  title: string
  source: string
  durationSec: number | null
  publishedAt: string | null
  topic: string | null
  reason: string | null
  status: string
  note: string | null
}

interface SourceRow {
  id: string
  name: string
  url: string
  visibility: 'PUBLIC' | 'INTERNAL'
  active: boolean
  lastCheckedAt: string | null
  videoCount: number
}

interface Props {
  apiKeyConfigured: boolean
  geminiConfigured: boolean
  driveConnected: boolean
  sources: SourceRow[]
  toReview: VideoRow[]
  recent: VideoRow[]
  skipped: VideoRow[]
  selectedCount: number
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const duration = (s: number | null) => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '')
const youtube = (id: string) => `https://www.youtube.com/watch?v=${id}`

function Card({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function VideoLine({ v, children }: { v: VideoRow; children?: React.ReactNode }) {
  return (
    <div className="min-w-0 flex-1">
      <a href={youtube(v.videoId)} target="_blank" rel="noopener noreferrer" className="font-medium text-gray-900 hover:text-amber-600">
        {v.title}
      </a>
      <p className="text-xs text-gray-400">
        {v.source}
        {v.durationSec ? ` · ${duration(v.durationSec)}` : ''}
        {v.publishedAt ? ` · ${new Date(v.publishedAt).toLocaleDateString('fr-FR')}` : ''}
        {v.topic ? ` · ${v.topic}` : ''}
        {v.reason ? ` — ${v.reason}` : ''}
      </p>
      {children}
    </div>
  )
}

export default function VideosClient({ apiKeyConfigured, geminiConfigured, driveConnected, sources, toReview, recent, skipped, selectedCount }: Props) {
  const router = useRouter()
  const [url, setUrl] = useState('')
  const [visibility, setVisibility] = useState<'PUBLIC' | 'INTERNAL'>('PUBLIC')
  const [busy, setBusy] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [unchecked, setUnchecked] = useState<Set<string>>(new Set())
  const [showSkipped, setShowSkipped] = useState(false)

  const post = async (path: string, body?: unknown, method = 'POST') => {
    const res = await fetch(path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error ?? `Erreur ${res.status}`)
    return data
  }

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setBusy(null)
    setStatus(null)
    router.refresh()
  }

  const addSource = () => run('add', async () => {
    await post('/api/videos/sources', { url, visibility })
    setUrl('')
  })

  const check = () => run('check', async () => {
    setStatus('Récupération et tri des vidéos… (une chaîne avec beaucoup de vidéos peut prendre une minute)')
    const r = await post('/api/videos/check')
    if (r.errors?.length) setError(r.errors.join(' / '))
  })

  /** Fiches rédigées par Gemini puis synchronisation du Drive (rangement, contrôle, indexation). */
  const processAll = async () => {
    let done = 0
    for (;;) {
      setStatus(`Rédaction des fiches : ${done} faite(s)… (environ une minute par vidéo)`)
      const r = await post('/api/videos/process')
      done += r.done.length
      if (r.errors.length) setError(r.errors.map((e: { title: string; message: string }) => `${e.title} : ${e.message}`).join(' / '))
      if (r.remaining === 0) break
    }
    setStatus('Fiches déposées dans « A trier » : synchronisation du Drive…')
    await post('/api/drive/sync')
    for (;;) {
      const q = await post('/api/drive/process')
      setStatus(`Rangement et indexation des fiches… (${q.remaining} restante(s))`)
      if (q.remaining === 0) break
      if (q.retryAfter) await sleep(q.retryAfter * 1000)
    }
  }

  const validate = () => run('validate', async () => {
    const selected = toReview.filter((v) => !unchecked.has(v.id)).map((v) => v.id)
    const skippedIds = toReview.filter((v) => unchecked.has(v.id)).map((v) => v.id)
    await post('/api/videos/review', { selected, skipped: skippedIds })
    setUnchecked(new Set())
    if (selected.length) await processAll()
  })

  const reselect = (id: string) => run(`re-${id}`, async () => {
    await post('/api/videos/review', { selected: [id] })
    await processAll()
  })

  const toggle = (id: string) => setUnchecked((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const selectCount = toReview.length - unchecked.size

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Vidéos</h1>
        <p className="mt-1 text-sm text-gray-500">
          Kingso suit des chaînes YouTube, ne garde que les vidéos qui aident au dépannage, et en fait des fiches pratiques
          (avec le lien de la vidéo) déposées dans « A trier » du Drive.
        </p>
      </div>

      {!apiKeyConfigured && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          Clé Google absente : ajoutez GOOGLE_API_KEY (YouTube Data API v3 + Generative Language API).
        </p>
      )}
      {apiKeyConfigured && !geminiConfigured && (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Gemini n&apos;est pas configuré : les fiches ne contiendront que le titre, la description et le lien.
        </p>
      )}
      {!driveConnected && (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Aucun Drive connecté : connectez-le dans <Link href="/admin/drive" className="underline">Google Drive</Link> pour y déposer les fiches.
        </p>
      )}
      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {status && (
        <p className="flex items-center gap-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-amber-200 border-t-amber-600" />
          {status} Gardez la page ouverte.
        </p>
      )}

      <Card
        title="Chaînes suivies"
        action={sources.length > 0 && (
          <Button type="button" size="sm" onClick={check} loading={busy === 'check'} disabled={busy !== null || !apiKeyConfigured}>
            Vérifier les nouvelles vidéos
          </Button>
        )}
      >
        {sources.length === 0 && <p className="mb-3 text-sm text-gray-500">Aucune chaîne pour l&apos;instant.</p>}
        <ul className="mb-4 space-y-2">
          {sources.map((s) => (
            <li key={s.id} className="flex flex-col gap-2 rounded-lg border border-gray-100 p-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <a href={s.url} target="_blank" rel="noopener noreferrer" className={`font-medium hover:text-amber-600 ${s.active ? 'text-gray-900' : 'text-gray-400 line-through'}`}>
                  {s.name}
                </a>
                <p className="text-xs text-gray-400">
                  {s.videoCount} vidéo(s) vue(s)
                  {s.lastCheckedAt ? ` · vérifiée le ${new Date(s.lastCheckedAt).toLocaleString('fr-FR')}` : ' · jamais vérifiée'}
                </p>
              </div>
              <select
                value={s.visibility}
                onChange={(e) => run(`vis-${s.id}`, () => post('/api/videos/sources', { id: s.id, visibility: e.target.value }, 'PATCH'))}
                className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm"
                title="Espace du Drive où déposer les fiches"
              >
                <option value="PUBLIC">Fiches en Public</option>
                <option value="INTERNAL">Fiches en Interne</option>
              </select>
              <button
                type="button"
                onClick={() => run(`act-${s.id}`, () => post('/api/videos/sources', { id: s.id, active: !s.active }, 'PATCH'))}
                className="text-sm text-gray-500 hover:underline"
              >
                {s.active ? 'Suspendre' : 'Reprendre'}
              </button>
              <button
                type="button"
                onClick={() => confirm(`Ne plus suivre « ${s.name} » ? Les fiches déjà créées restent dans le Drive.`)
                  && run(`del-${s.id}`, () => post(`/api/videos/sources?id=${s.id}`, undefined, 'DELETE'))}
                className="text-sm text-red-500 hover:underline"
              >
                Retirer
              </button>
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Adresse de la chaîne (https://www.youtube.com/@NomDeLaChaine)"
            className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
          <select value={visibility} onChange={(e) => setVisibility(e.target.value as 'PUBLIC' | 'INTERNAL')} className="rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm">
            <option value="PUBLIC">Fabricant → Public</option>
            <option value="INTERNAL">Installateur → Interne</option>
          </select>
          <Button type="button" variant="secondary" onClick={addSource} loading={busy === 'add'} disabled={!url.trim() || busy !== null || !apiKeyConfigured}>
            Ajouter
          </Button>
        </div>
      </Card>

      {(toReview.length > 0 || selectedCount > 0) && (
        <Card
          title={`${toReview.length} vidéo(s) utile(s) à valider`}
          action={toReview.length > 0 && (
            <div className="flex gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setUnchecked(unchecked.size ? new Set() : new Set(toReview.map((v) => v.id)))}>
                {unchecked.size ? 'Tout cocher' : 'Tout décocher'}
              </Button>
              <Button type="button" size="sm" onClick={validate} loading={busy === 'validate'} disabled={busy !== null}>
                Créer les fiches ({selectCount})
              </Button>
            </div>
          )}
        >
          <p className="mb-3 text-sm text-gray-500">
            Kingso a présélectionné ces vidéos d&apos;après leur titre et leur description. Décochez celles à écarter.
          </p>
          {selectedCount > 0 && toReview.length === 0 && (
            <Button type="button" size="sm" onClick={() => run('process', processAll)} loading={busy === 'process'}>
              Reprendre le traitement ({selectedCount} en attente)
            </Button>
          )}
          <ul className="divide-y divide-gray-100">
            {toReview.map((v) => (
              <li key={v.id} className="flex items-start gap-3 py-2.5">
                <input type="checkbox" checked={!unchecked.has(v.id)} onChange={() => toggle(v.id)} className="mt-1 h-4 w-4 accent-amber-500" />
                <VideoLine v={v} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {recent.length > 0 && (
        <Card title="Fiches créées">
          <ul className="divide-y divide-gray-100">
            {recent.map((v) => (
              <li key={v.id} className="flex items-start gap-3 py-2.5">
                <span className="mt-0.5 w-5 shrink-0 text-center">{v.status === 'DONE' ? '✓' : '✗'}</span>
                <VideoLine v={v}>
                  {v.status === 'ERROR' && <p className="text-xs text-red-600">{v.note}</p>}
                </VideoLine>
                {v.status === 'ERROR' && (
                  <button type="button" onClick={() => reselect(v.id)} disabled={busy !== null} className="shrink-0 text-sm text-amber-600 hover:underline">
                    Réessayer
                  </button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {skipped.length > 0 && (
        <Card
          title={`${skipped.length} vidéo(s) écartée(s)`}
          action={<button type="button" onClick={() => setShowSkipped((s) => !s)} className="text-sm text-amber-600 hover:underline">{showSkipped ? 'Masquer' : 'Afficher'}</button>}
        >
          <p className="text-sm text-gray-500">Publicités, événements, présentations… Une vidéo écartée à tort peut être retenue ici.</p>
          {showSkipped && (
            <ul className="mt-3 divide-y divide-gray-100">
              {skipped.map((v) => (
                <li key={v.id} className="flex items-start gap-3 py-2.5">
                  <VideoLine v={v} />
                  <button type="button" onClick={() => reselect(v.id)} disabled={busy !== null} className="shrink-0 text-sm text-amber-600 hover:underline">
                    Retenir
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  )
}
