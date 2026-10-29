'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'

interface NotificationItem {
  id: string
  icon: string
  title: string
  detail: string | null
  caseId: string
  caseLabel: string
  createdAt: string
  unread: boolean
}

const POLL_MS = 60_000

function ago(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return 'à l’instant'
  if (minutes < 60) return `il y a ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `il y a ${hours} h`
  return new Date(iso).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

/** Cloche des notifications (nouveaux dossiers, demandes des chats, rendez-vous qui bougent…), relue chaque minute. */
export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const [items, setItems] = useState<NotificationItem[] | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/sav/notifications', { cache: 'no-store' })
      if (!res.ok) return
      const data = (await res.json()) as { unread: number; items: NotificationItem[] }
      setUnread(data.unread)
      setItems(data.items)
    } catch {
      // réseau indisponible : nouvel essai à la prochaine minute
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- premier chargement des notifications
    load()
    const timer = setInterval(() => { if (document.visibilityState === 'visible') load() }, POLL_MS)
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible) }
  }, [load])

  // Fermeture au clic à l'extérieur ou avec Échap
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => { if (!panelRef.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey) }
  }, [open])

  const toggle = async () => {
    const next = !open
    setOpen(next)
    if (next) {
      await load()
      // Ouverte : tout est vu (les nouveautés restent surlignées tant que la cloche est ouverte)
      if (unread > 0) {
        setUnread(0)
        fetch('/api/sav/notifications', { method: 'POST' }).catch(() => null)
      }
    } else {
      setItems((list) => list?.map((n) => ({ ...n, unread: false })) ?? null)
    }
  }

  return (
    <div ref={panelRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white"
        aria-label={unread > 0 ? `Notifications : ${unread} nouvelle${unread > 1 ? 's' : ''}` : 'Notifications'}
        aria-expanded={open}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 min-w-[1.1rem] rounded-full bg-red-500 px-1 text-center text-[11px] font-bold leading-[1.1rem] text-white">
            {unread > 30 ? '30+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed left-3 top-16 z-50 flex max-h-[75vh] w-[23rem] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-xl bg-white text-gray-900 shadow-2xl ring-1 ring-gray-200">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <p className="text-sm font-semibold">Notifications</p>
            <span className="text-xs text-gray-400">14 derniers jours</span>
          </div>
          <ul className="flex-1 divide-y divide-gray-100 overflow-y-auto">
            {items === null && <li className="px-4 py-6 text-center text-sm text-gray-400">Chargement…</li>}
            {items?.length === 0 && <li className="px-4 py-6 text-center text-sm text-gray-400">Rien de nouveau.</li>}
            {items?.map((n) => (
              <li key={n.id}>
                <Link
                  href={`/admin/sav/${n.caseId}`}
                  onClick={() => setOpen(false)}
                  className={`flex gap-3 px-4 py-2.5 hover:bg-gray-50 ${n.unread ? 'bg-amber-50' : ''}`}
                >
                  <span className="mt-0.5 w-5 shrink-0 text-center" aria-hidden="true">{n.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={`text-sm ${n.unread ? 'font-semibold' : 'font-medium text-gray-700'}`}>{n.title}</span>
                      <span className="shrink-0 text-[11px] text-gray-400">{ago(n.createdAt)}</span>
                    </span>
                    <span className="block truncate text-xs text-gray-600">{n.caseLabel}</span>
                    {n.detail && <span className="line-clamp-2 block text-xs text-gray-400">{n.detail}</span>}
                  </span>
                  {n.unread && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-red-500" aria-label="Nouveau" />}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
