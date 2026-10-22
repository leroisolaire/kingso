'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export interface DriveAlert {
  id: string
  title: string
  drivePath: string | null
  kind: 'confidential' | 'error'
  note: string | null
  hasFile: boolean
}

export interface DriveEventItem {
  id: string
  kind: string
  title: string
  detail: string | null
  createdAt: string
}

/** Documents mis de côté par la synchronisation : l'équipe décide. */
export function DriveAlerts({ alerts }: { alerts: DriveAlert[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const act = async (documentId: string, action: 'public' | 'internal' | 'ignore' | 'retry') => {
    setBusy(documentId)
    setError(null)
    const res = await fetch('/api/drive/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentId, action }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(null)
    if (!res.ok) return setError(data.error ?? 'Erreur')
    router.refresh()
  }

  if (alerts.length === 0) return null

  const btn = 'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50'
  return (
    <section className="rounded-xl border-2 border-red-200 bg-red-50/50 p-5 sm:p-6">
      <h2 className="text-base font-semibold text-red-800">⚠ {alerts.length} document(s) à valider</h2>
      <p className="mb-4 mt-1 text-sm text-red-700/80">
        Ces documents ne sont pas utilisés par Kingso tant que vous n&apos;avez pas décidé.
      </p>
      {error && <p className="mb-3 rounded-lg bg-white px-3 py-2 text-sm text-red-700">{error}</p>}
      <ul className="space-y-3">
        {alerts.map((a) => (
          <li key={a.id} className="rounded-lg bg-white p-4 shadow-sm">
            <p className="font-medium text-gray-900">{a.title}</p>
            {a.drivePath && <p className="text-xs text-gray-400">⇅ {a.drivePath.split('/').join(' › ')}</p>}
            <p className="mt-2 text-sm text-red-700">
              {a.kind === 'confidential' ? `Déposé dans Public mais semble confidentiel : ${a.note}` : a.note}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {a.hasFile && (
                <a href={`/api/documents/${a.id}/file`} target="_blank" rel="noopener noreferrer" className={`${btn} text-gray-600 hover:bg-gray-100`}>
                  Voir le document ↗
                </a>
              )}
              {a.kind === 'confidential' ? (
                <>
                  <button type="button" disabled={busy === a.id} onClick={() => act(a.id, 'internal')} className={`${btn} bg-slate-800 text-white hover:bg-slate-900`}>
                    Passer en Interne
                  </button>
                  <button type="button" disabled={busy === a.id} onClick={() => act(a.id, 'public')} className={`${btn} border border-gray-300 text-gray-700 hover:bg-gray-50`}>
                    C&apos;est bien public
                  </button>
                </>
              ) : (
                <button type="button" disabled={busy === a.id} onClick={() => act(a.id, 'retry')} className={`${btn} bg-slate-800 text-white hover:bg-slate-900`}>
                  Réessayer à la prochaine synchronisation
                </button>
              )}
              <button type="button" disabled={busy === a.id} onClick={() => act(a.id, 'ignore')} className={`${btn} text-gray-500 hover:bg-gray-100`}>
                Ignorer
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

const EVENT_STYLE: Record<string, { icon: string; label: string }> = {
  SORTED: { icon: '📂', label: 'Rangé' },
  FAMILY_CREATED: { icon: '✨', label: 'Nouvelle famille' },
  CONFIDENTIAL: { icon: '⚠', label: 'Mis de côté (confidentiel ?)' },
  NEW: { icon: '＋', label: 'Nouveau' },
  MODIFIED: { icon: '✎', label: 'Modifié' },
  DELETED: { icon: '−', label: 'Retiré' },
  VALIDATED_PUBLIC: { icon: '✓', label: 'Validé public' },
  MOVED_INTERNAL: { icon: '🔒', label: 'Passé en Interne' },
  IGNORED: { icon: '⊘', label: 'Ignoré' },
  ERROR: { icon: '✗', label: 'Erreur' },
}

/** Récapitulatif des actions de la synchronisation, regroupées par jour. */
export function DriveRecap({ events }: { events: DriveEventItem[] }) {
  if (events.length === 0) return <p className="text-sm text-gray-500">Aucune action pour l&apos;instant.</p>
  const byDay = new Map<string, DriveEventItem[]>()
  for (const e of events) {
    const day = new Date(e.createdAt).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
    byDay.set(day, [...(byDay.get(day) ?? []), e])
  }
  return (
    <div className="space-y-5">
      {[...byDay.entries()].map(([day, items]) => (
        <div key={day}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">{day}</p>
          <ul className="space-y-1.5">
            {items.map((e) => {
              const style = EVENT_STYLE[e.kind] ?? { icon: '•', label: e.kind }
              return (
                <li key={e.id} className="flex gap-3 text-sm">
                  <span className="w-5 shrink-0 text-center">{style.icon}</span>
                  <div className="min-w-0">
                    <span className={`font-medium ${e.kind === 'CONFIDENTIAL' || e.kind === 'ERROR' ? 'text-red-700' : 'text-gray-900'}`}>
                      {style.label}
                    </span>
                    <span className="text-gray-700"> — {e.title}</span>
                    {e.detail && <p className="truncate text-xs text-gray-400" title={e.detail}>{e.detail}</p>}
                  </div>
                  <span className="ml-auto shrink-0 text-xs text-gray-400">
                    {new Date(e.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}
