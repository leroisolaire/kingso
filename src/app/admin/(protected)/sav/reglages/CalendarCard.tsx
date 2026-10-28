'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'
import { DURATION_OPTIONS, durationLabel } from '@/lib/sav/duration'

export interface CalendarInfo {
  configured: boolean
  connected: boolean
  email: string | null
  calendarId: string | null
  calendarName: string | null
  durationMinutes: number
  connectedAt: string | null
  connectedBy: string | null
  message: string | null
}

interface CalendarOption { id: string; name: string; primary: boolean }


/** Agenda Google du planning des interventions (bouton « Ajouter au planning » des dossiers). */
export default function CalendarCard({ c }: { c: CalendarInfo }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [calendars, setCalendars] = useState<CalendarOption[] | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    c.message ? { ok: c.message === 'ok', text: c.message === 'ok' ? 'Agenda connecté : choisissez ci-dessous l\'agenda du planning.' : c.message } : null,
  )

  useEffect(() => {
    if (!c.connected) return
    let cancelled = false
    fetch('/api/sav/calendar')
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return
        if (json.calendars) setCalendars(json.calendars)
        else setMessage({ ok: false, text: json.error ?? 'Liste des agendas indisponible.' })
      })
      .catch(() => !cancelled && setMessage({ ok: false, text: 'Liste des agendas indisponible.' }))
    return () => { cancelled = true }
  }, [c.connected])

  const post = async (key: string, payload: Record<string, unknown>, done: string) => {
    setBusy(key)
    setMessage(null)
    const res = await fetch('/api/sav/calendar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const json = await res.json().catch(() => ({}))
    setBusy(null)
    setMessage(res.ok ? { ok: true, text: done } : { ok: false, text: json.error ?? `Erreur ${res.status}` })
    router.refresh()
  }

  return (
    <section id="agenda" className="space-y-3 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="font-semibold text-gray-900">Agenda du planning</h2>
      <p className="text-sm text-gray-500">
        Le bouton « Ajouter au planning » d&apos;un dossier planifié crée le rendez-vous dans cet agenda Google (client, adresse,
        téléphone, problème, lien vers le dossier). Ensuite, changer la date dans Kingso déplace le rendez-vous, et un dossier
        remis « À planifier » le retire. Kingso ne touche à aucun autre événement de l&apos;agenda.
      </p>

      {c.connected ? (
        <div className="space-y-3 rounded-lg bg-green-50 p-3 text-sm text-gray-700">
          <p>
            ✓ Compte connecté : <strong>{c.email}</strong>
            {c.connectedAt ? ` depuis le ${new Date(c.connectedAt).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'long' })}` : ''}
            {c.connectedBy ? ` (par ${c.connectedBy})` : ''}
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="block text-xs text-gray-600">
              Agenda du planning
              <select
                value={c.calendarId ?? ''}
                disabled={!calendars || busy !== null}
                onChange={(e) => post('calendar', { action: 'settings', calendarId: e.target.value }, 'Agenda enregistré.')}
                className="mt-1 block rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900"
              >
                {!calendars && <option value={c.calendarId ?? ''}>{c.calendarName ?? 'Chargement…'}</option>}
                {calendars?.map((cal) => <option key={cal.id} value={cal.id}>{cal.name}{cal.primary ? ' (agenda principal)' : ''}</option>)}
              </select>
            </label>
            <label className="block text-xs text-gray-600">
              Durée proposée par défaut
              <select
                value={c.durationMinutes}
                disabled={busy !== null}
                onChange={(e) => post('duration', { action: 'settings', durationMinutes: Number(e.target.value) }, 'Durée enregistrée.')}
                className="mt-1 block rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900"
              >
                {[...new Set([...DURATION_OPTIONS, c.durationMinutes])].sort((a, b) => a - b).map((m) => <option key={m} value={m}>{durationLabel(m)}</option>)}
              </select>
            </label>
          </div>
          <p className="text-xs text-gray-500">
            Conseil : créez dans Google Agenda un agenda dédié (par ex. « Planning SAV »), puis rechargez cette page pour le choisir ici.
          </p>
        </div>
      ) : (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          Pas encore connecté. Cliquez sur « Connecter un agenda », choisissez votre compte Google et autorisez la gestion des événements.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <a
          href={c.configured ? '/api/sav/calendar/connect' : undefined}
          className={`inline-flex items-center rounded-lg px-4 py-2 text-sm font-medium ${c.connected ? 'border border-gray-300 text-gray-700 hover:bg-gray-50' : 'text-white'} ${c.configured ? (c.connected ? '' : 'bg-amber-500 hover:bg-amber-600') : 'cursor-not-allowed bg-gray-300'}`}
        >
          {c.connected ? 'Changer de compte' : 'Connecter un agenda'}
        </a>
        {c.connected && (
          <Button
            type="button"
            variant="ghost"
            loading={busy === 'disconnect'}
            disabled={busy !== null}
            onClick={() => confirm('Déconnecter l\'agenda ? Les rendez-vous déjà créés restent dans l\'agenda, mais ne seront plus mis à jour.') && post('disconnect', { action: 'disconnect' }, 'Agenda déconnecté.')}
          >
            Déconnecter
          </Button>
        )}
      </div>
      {!c.configured && <p className="text-sm text-red-600">Identifiants Google (GOOGLE_OAUTH_CLIENT_ID / SECRET) absents sur ce serveur.</p>}
      {message && <p className={`text-sm ${message.ok ? 'text-green-700' : 'text-red-600'}`}>{message.text}</p>}
    </section>
  )
}
