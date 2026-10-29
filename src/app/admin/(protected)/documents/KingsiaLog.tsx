'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { KingsiaLogEntry } from '@/lib/kingsia/ingest'

const STATUS: Record<KingsiaLogEntry['status'], { label: string; cls: string }> = {
  created: { label: 'Ajouté', cls: 'bg-green-100 text-green-800' },
  empty: { label: 'Rien à ajouter', cls: 'bg-gray-100 text-gray-700' },
  refused: { label: 'Refusé', cls: 'bg-red-100 text-red-700' },
  error: { label: 'Erreur', cls: 'bg-red-100 text-red-700' },
}

/** Derniers mails « kingsia » reçus par kingso@ et ce qu'ils ont ajouté à la base. */
export default function KingsiaLog() {
  const [entries, setEntries] = useState<KingsiaLogEntry[] | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    fetch('/api/documents/kingsia').then((r) => r.json()).then((j) => setEntries(j.entries ?? [])).catch(() => setEntries([]))
  }, [])

  return (
    <section className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between gap-2 text-left">
        <span>
          <span className="font-semibold text-gray-900">📧 Ajouts par email (Kingsia)</span>
          <span className="ml-2 text-sm text-gray-500">
            {entries === null ? '…' : entries.length ? `dernier le ${new Date(entries[0].at).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : 'aucun pour l’instant'}
          </span>
        </span>
        <span className="text-sm text-amber-700">{open ? 'Masquer' : 'Voir'}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-3 text-sm">
          <p className="text-xs text-gray-500">
            Un collaborateur (adresse @leroisolaire.fr) écrit à kingso@ avec « kingsia » dans l&apos;objet : Kingso met le mail en forme en fiche,
            importe les PDF et documents Word joints, les range et les met en ligne, puis lui confirme par email. « kingsia interne » ou
            « kingsia public » au début de l&apos;objet impose la visibilité.
          </p>
          {entries?.length === 0 && <p className="text-gray-400">Aucun mail Kingsia reçu.</p>}
          <ul className="divide-y divide-gray-100">
            {entries?.map((e, i) => (
              <li key={i} className="py-2">
                <p className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS[e.status].cls}`}>{STATUS[e.status].label}</span>
                  <span className="font-medium text-gray-900">{e.subject || '(sans objet)'}</span>
                  <span className="text-xs text-gray-500">
                    {e.from} · {new Date(e.at).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </p>
                {e.reason && <p className="mt-0.5 text-xs text-gray-600">{e.reason}</p>}
                {e.documents.length > 0 && (
                  <ul className="mt-1 space-y-0.5 pl-4 text-xs">
                    {e.documents.map((d, j) => (
                      <li key={j}>
                        {d.id ? <Link href={`/admin/documents/${d.id}`} className="text-amber-700 hover:underline">{d.title}</Link> : <span>{d.title}</span>}
                        <span className="text-gray-500"> · {d.type === 'PUBLIC' ? 'Public' : d.type === 'INTERNAL' ? 'Interne' : 'Franchisés'}{d.category ? ` · ${d.category}` : ''}{d.note ? ` · ${d.note}` : ''}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
