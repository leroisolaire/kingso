'use client'

import { useEffect, useState } from 'react'

export interface GalleryPhoto { path: string; url: string | null; label: string; at: string }

/** Toutes les photos du dossier (chat du client, messages, technicien), en grand d'un clic, avec flèches. */
export default function PhotoGallery({ photos }: { photos: GalleryPhoto[] }) {
  const [open, setOpen] = useState<number | null>(null)
  const viewable = photos.filter((p) => p.url)
  const current = open === null ? null : viewable[open]

  useEffect(() => {
    if (open === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null)
      if (e.key === 'ArrowRight') setOpen((i) => (i === null ? i : (i + 1) % viewable.length))
      if (e.key === 'ArrowLeft') setOpen((i) => (i === null ? i : (i - 1 + viewable.length) % viewable.length))
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, viewable.length])

  return (
    <>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {photos.map((p) => (
          <figure key={p.path} className="min-w-0">
            {p.url ? (
              <button type="button" onClick={() => setOpen(viewable.indexOf(p))} className="block w-full">
                {/* eslint-disable-next-line @next/next/no-img-element -- URL signée temporaire du stockage privé */}
                <img src={p.url} alt={p.label} className="aspect-square w-full rounded-lg object-cover ring-1 ring-gray-200 hover:ring-2 hover:ring-amber-500" />
              </button>
            ) : (
              <div className="flex aspect-square items-center justify-center rounded-lg bg-gray-100 text-xs text-gray-400">Photo</div>
            )}
            <figcaption className="mt-1 truncate text-[11px] leading-tight text-gray-500" title={`${p.label} · ${p.at}`}>
              {p.label}<br />{p.at}
            </figcaption>
          </figure>
        ))}
      </div>

      {current && open !== null && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/90" onClick={() => setOpen(null)} role="dialog" aria-modal="true">
          <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-white">
            <span className="truncate">{current.label} · {current.at} · {open + 1}/{viewable.length}</span>
            <div className="flex shrink-0 gap-2">
              <a href={current.url!} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="rounded-lg bg-white/10 px-3 py-1.5 hover:bg-white/20">
                Ouvrir l&apos;original
              </a>
              <button type="button" className="rounded-lg bg-white/10 px-3 py-1.5 hover:bg-white/20" aria-label="Fermer">✕</button>
            </div>
          </div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center px-12 pb-6">
            {/* eslint-disable-next-line @next/next/no-img-element -- URL signée temporaire du stockage privé */}
            <img src={current.url!} alt={current.label} className="max-h-full max-w-full object-contain" onClick={(e) => e.stopPropagation()} />
            {viewable.length > 1 && (
              <>
                <button type="button" aria-label="Photo précédente" onClick={(e) => { e.stopPropagation(); setOpen((open - 1 + viewable.length) % viewable.length) }}
                  className="absolute left-2 rounded-full bg-white/10 px-3 py-2 text-2xl text-white hover:bg-white/25">‹</button>
                <button type="button" aria-label="Photo suivante" onClick={(e) => { e.stopPropagation(); setOpen((open + 1) % viewable.length) }}
                  className="absolute right-2 rounded-full bg-white/10 px-3 py-2 text-2xl text-white hover:bg-white/25">›</button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
