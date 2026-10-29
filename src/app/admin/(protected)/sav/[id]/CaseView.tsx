'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'
import { PRESENCE_STYLES, type Presence } from '@/lib/sav/presence'
import { smsLength } from '@/lib/sav/smsText'
import DictationButton from './DictationButton'
import DurationSelect from '../DurationSelect'
import { CATEGORY_COLORS, CATEGORY_LABELS, STATUS_COLORS, STATUS_LABELS } from '@/lib/sav/status'
import { TechPhotos, TechReportForm, TechReportView, type CasePhoto } from './TechReport'
import PhotoGallery, { type GalleryPhoto } from './PhotoGallery'
import CaseRating from '../CaseRating'
import TechnicianSuggestions from '../TechnicianSuggestions'
import type { SavCategory, SavStatus } from '@prisma/client'

interface CaseData {
  technicianId: string | null
  techOutcome: string | null
  techReport: string | null
  techReportAt: string | null
  techReportBy: string | null
  techPhotos: CasePhoto[]
  id: string
  number: number
  source: string
  status: SavStatus
  category: SavCategory
  urgent: boolean
  urgentReason: string
  urgency: number | null
  difficulty: number | null
  noHeating: boolean
  receivedAt: string
  phone: string
  callbackPhone: string
  customerName: string
  email: string
  address: string
  postalCode: string
  city: string
  equipment: string
  clientMatch: string
  clientIdentified: boolean
  contract: string
  summary: string
  errorCode: string
  assistantId: string
  emailTemplate: string | null
  emailSubject: string
  emailBody: string
  emailPlanned: string | null
  emailSentAt: string | null
  emailInFuture: boolean
  emailError: string | null
  appointmentAt: string | null
  appointmentIso: string | null
  appointmentMinutes: number
  planningLink: string | null
  messages: { id: string; source: string; text: string; at: string; phone: string; durationSec: number | null; photos: CasePhoto[]; photoNote: string | null }[]
  events: { id: string; label: string; kind: string; detail: string | null; author: string | null; at: string }[]
  /** Toutes les photos du dossier, des plus récentes aux plus anciennes */
  gallery: GalleryPhoto[]
  conversation: { id: string; user: string; kingso: string; at: string; fromCase: boolean; photos: CasePhoto[]; photoNote: string | null }[]
}

interface ClientOption {
  id: string
  name: string
  email: string | null
  phones: string[]
  address: string | null
  postalCode: string | null
  city: string | null
  equipment: string | null
  reasons: string[]
}

interface Props {
  data: CaseData
  link: string
  paused: boolean
  /** SMS d'accusé de réception : mobile du client (sinon null), texte prévu, envoi fait ou dernière erreur */
  sms: { phone: string | null; text: string; sent: string | null; error: string | null }
  templates: { key: string; name: string; autoSend: boolean }[]
  assistants: { id: string; name: string }[]
  suggestions: ClientOption[]
  kingso: { tone: Presence['tone']; label: string; detail: string } | null
  calendarConnected: boolean
  technicians: TechnicianOption[]
  canDelete: boolean
}

interface TechnicianOption { id: string; name: string; kind: 'SAV' | 'POSEUR'; phone: string }

const SOURCE_LABELS: Record<string, string> = { VOICEMAIL: 'Répondeur', CHAT: 'Chat', MANUAL: 'Saisie manuelle' }

function Card({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

/** Date ISO → valeur d'un champ datetime-local (heure du navigateur). */
function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500'

function ClientRow({ c, onPick, disabled }: { c: ClientOption; onPick: () => void; disabled: boolean }) {
  return (
    <li className="space-y-1 rounded-lg border border-gray-200 p-2.5 text-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-gray-900">{c.name}</p>
        <Button type="button" size="sm" variant="secondary" onClick={onPick} disabled={disabled}>C&apos;est lui</Button>
      </div>
      <p className="text-xs text-gray-600">{[c.address, c.postalCode, c.city].filter(Boolean).join(', ') || '—'}</p>
      <p className="text-xs text-gray-600">{c.phones.join(' · ') || 'pas de téléphone'} · {c.email ?? <span className="text-orange-700">pas d&apos;email</span>}</p>
      {c.equipment && <p className="text-xs text-gray-400">{c.equipment}</p>}
      {c.reasons.length > 0 && <p className="text-xs text-amber-700">{c.reasons.join(', ')}</p>}
    </li>
  )
}

/** Numéro absent du fichier client : clients possibles (nom et commune approchés) et recherche manuelle. */
function ClientPicker({ suggestions, onPick, disabled }: { suggestions: ClientOption[]; onPick: (id: string) => void; disabled: boolean }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<ClientOption[] | null>(null)
  const [searching, setSearching] = useState(false)

  const search = async (e: React.FormEvent) => {
    e.preventDefault()
    setSearching(true)
    const res = await fetch(`/api/sav/clients?q=${encodeURIComponent(q)}`)
    const json = await res.json().catch(() => ({}))
    setResults(json.clients ?? [])
    setSearching(false)
  }

  return (
    <div className="mt-4 space-y-2 border-t border-gray-100 pt-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Clients possibles</p>
      {suggestions.length > 0 ? (
        <>
          <p className="text-xs text-gray-500">Le nom et la commune viennent du répondeur et peuvent être mal transcrits : vérifiez avant de choisir.</p>
          <ul className="space-y-2">{suggestions.map((c) => <ClientRow key={c.id} c={c} onPick={() => onPick(c.id)} disabled={disabled} />)}</ul>
        </>
      ) : (
        <p className="text-xs text-gray-500">Aucun client proche trouvé dans le fichier.</p>
      )}
      <form onSubmit={search} className="flex gap-2 pt-1">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher : nom, commune, n° de téléphone" className={inputCls} />
        <Button type="submit" size="sm" variant="secondary" loading={searching} disabled={q.trim().length < 2}>Chercher</Button>
      </form>
      {results && (results.length === 0
        ? <p className="text-xs text-gray-500">Aucun résultat.</p>
        : <ul className="space-y-2">{results.map((c) => <ClientRow key={c.id} c={c} onPick={() => onPick(c.id)} disabled={disabled} />)}</ul>)}
    </div>
  )
}

export default function CaseView({ data, link, paused, sms, templates, assistants, suggestions, kingso, calendarConnected, technicians, canDelete }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    customerName: data.customerName, email: data.email, callbackPhone: data.callbackPhone, address: data.address,
    postalCode: data.postalCode, city: data.city, equipment: data.equipment, summary: data.summary,
  })
  const [subject, setSubject] = useState(data.emailSubject)
  const [body, setBody] = useState(data.emailBody)
  // Email (re)préparé côté serveur (modèle choisi, catégorie changée, client relié) : on affiche la nouvelle version
  const [loadedEmail, setLoadedEmail] = useState({ subject: data.emailSubject, body: data.emailBody })
  if (loadedEmail.subject !== data.emailSubject || loadedEmail.body !== data.emailBody) {
    setLoadedEmail({ subject: data.emailSubject, body: data.emailBody })
    setSubject(data.emailSubject)
    setBody(data.emailBody)
  }
  const [smsText, setSmsText] = useState(sms.text)
  const [alsoSms, setAlsoSms] = useState(true)
  const canSms = Boolean(sms.phone) && !sms.sent
  const smsInfo = smsLength(smsText)
  const [note, setNote] = useState('')
  const [callNote, setCallNote] = useState('')
  const [appointment, setAppointment] = useState('')
  const [reschedule, setReschedule] = useState(false)
  const [minutes, setMinutes] = useState(data.appointmentMinutes)
  const [techId, setTechId] = useState(data.technicianId ?? '')
  const [reporting, setReporting] = useState(false)
  const assignedTech = technicians.find((t) => t.id === data.technicianId)
  const technicianName = assignedTech?.name

  const call = async (key: string, url: string, payload: unknown, method = 'POST') => {
    setBusy(key)
    setError(null)
    setInfo(null)
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const json = await res.json().catch(() => ({}))
    setBusy(null)
    if (!res.ok) {
      setError(json.error ?? `Erreur ${res.status}`)
      return null
    }
    // Action faite, mais l'agenda du planning n'a pas suivi
    if (json.warning) setError(json.warning)
    router.refresh()
    return json
  }
  const action = (key: string, payload: Record<string, unknown>) => call(key, `/api/sav/cases/${data.id}/actions`, { action: key, ...payload })
  const patch = (key: string, payload: Record<string, unknown>) => call(key, `/api/sav/cases/${data.id}`, payload, 'PATCH')

  const emailDirty = subject !== data.emailSubject || body !== data.emailBody
  const sendEmail = async () => {
    if (emailDirty && !(await patch('save-email', { emailSubject: subject, emailBody: body }))) return
    const withSms = canSms && alsoSms
    const res = await action('send', withSms ? { sms: true, smsText } : {})
    if (res?.scheduledAt) {
      const at = new Date(res.scheduledAt)
      setInfo((at.getTime() - Date.now() > 2 * 60_000
        ? `Email confié à l'envoi : il partira le ${at.toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}.`
        : `Email envoyé à ${data.email}.`) + (res.smsPhone ? ` SMS envoyé au ${sms.phone}.` : ''))
    }
  }
  const sendSms = async () => {
    if (!confirm(`Envoyer ce SMS au ${sms.phone} ?`)) return
    const res = await action('send_sms', { smsText })
    if (res?.smsPhone) setInfo(`SMS envoyé au ${sms.phone}.`)
  }
  const deleteCase = async () => {
    if (!confirm(`Supprimer définitivement le dossier n° ${data.number} ? Ses messages et son historique seront effacés.`)) return
    setBusy('delete')
    setError(null)
    const res = await fetch(`/api/sav/cases/${data.id}`, { method: 'DELETE' })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) { setBusy(null); setError(json.error ?? `Erreur ${res.status}`); return }
    router.push('/admin/sav')
    router.refresh()
  }
  const open = !['RESOLVED', 'CLOSED'].includes(data.status)
  const canCall = ['NEW', 'WAITING', 'IN_CHAT', 'TO_CALL'].includes(data.status)

  return (
    <div className="space-y-4">
      {/* En-tête */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Dossier n° {data.number}</h1>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_COLORS[data.status]}`}>{STATUS_LABELS[data.status]}</span>
        <button
          type="button"
          onClick={() => action('urgent', { urgent: !data.urgent })}
          className={`rounded px-2 py-1 text-xs font-bold ${data.urgent ? 'bg-red-600 text-white' : 'border border-gray-300 text-gray-500 hover:bg-gray-50'}`}
          title={data.urgentReason}
        >
          {data.urgent ? 'URGENT' : 'Marquer urgent'}
        </button>
        <select
          value={data.category}
          onChange={(e) => patch('category', { category: e.target.value })}
          className={`rounded-lg px-2 py-1 text-sm font-semibold ring-1 ${CATEGORY_COLORS[data.category]}`}
        >
          {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <span className="text-sm text-gray-400">{SOURCE_LABELS[data.source]} · reçu le {data.receivedAt}</span>
      </div>
      {data.urgent && data.urgentReason && <p className="text-sm text-red-700">Urgent : {data.urgentReason}</p>}
      {kingso && (
        <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-4 py-2.5 text-sm ring-1 ${PRESENCE_STYLES[kingso.tone].cls}`}>
          <span className="inline-flex items-center gap-2 font-semibold">
            <span className={`h-2.5 w-2.5 rounded-full ${PRESENCE_STYLES[kingso.tone].dot}`} />
            {kingso.label}
          </span>
          <span className="text-xs opacity-80">{kingso.detail}</span>
        </div>
      )}

      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {info && <p className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">{info}</p>}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* Demande */}
          <Card title="Demande du client">
            <p className="whitespace-pre-wrap text-sm text-gray-800">{data.summary}</p>
            {(data.errorCode || data.noHeating) && (
              <p className="mt-2 text-xs text-gray-500">
                {data.errorCode && <>Code affiché : <strong>{data.errorCode}</strong>{data.noHeating ? ' · ' : ''}</>}
                {data.noHeating && <span className="text-orange-700">Sans chauffage ou eau chaude</span>}
              </p>
            )}
            <div className="mt-4 space-y-3">
              {data.messages.map((m) => (
                <details key={m.id} className="rounded-lg bg-gray-50 p-3 text-sm" open={data.messages.length === 1}>
                  <summary className="cursor-pointer text-xs text-gray-500">
                    {SOURCE_LABELS[m.source]} · {m.at}{m.phone ? ` · ${m.phone}` : ''}{m.durationSec ? ` · ${m.durationSec} s` : ''}
                  </summary>
                  <p className="mt-2 whitespace-pre-wrap text-gray-700">{m.text}</p>
                  {m.photos.length > 0 && (
                    <div className="mt-3 max-w-sm">
                      <TechPhotos caseId={data.id} photos={m.photos} editable canAdd={false} removeAction="message_photo_remove" />
                    </div>
                  )}
                  {m.photoNote && <p className="mt-2 text-xs text-gray-500"><strong>Lu sur les photos :</strong> {m.photoNote}</p>}
                </details>
              ))}
              {data.messages.length > 0 && (
                <TechPhotos caseId={data.id} photos={[]} editable addAction="message_photo" addLabel="📷 Ajouter des photos" />
              )}
            </div>
          </Card>

          {/* Photos : toutes au même endroit (chat du client, messages, technicien) */}
          {data.gallery.length > 0 && (
            <Card title={`📷 Photos du dossier (${data.gallery.length})`}>
              <PhotoGallery photos={data.gallery} />
            </Card>
          )}

          {/* Email au client */}
          <Card
            title="Email au client"
            action={data.emailTemplate && !data.emailSentAt ? (
              <select
                value={data.emailTemplate}
                onChange={(e) => action('prepare', { template: e.target.value })}
                disabled={busy !== null}
                className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs"
                title="Changer de modèle"
              >
                {templates.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
              </select>
            ) : undefined}
          >
            {!data.emailTemplate ? (
              <div className="space-y-2 text-sm text-gray-500">
                <p>Aucun email préparé pour ce dossier.</p>
                <div className="flex flex-wrap gap-2">
                  {templates.map((t) => (
                    <Button key={t.key} type="button" size="sm" variant="secondary" onClick={() => action('prepare', { template: t.key })} loading={busy === 'prepare'} disabled={busy !== null}>
                      {t.name}
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm">
                  À : {data.email ? <strong>{data.email}</strong> : <span className="text-red-600">aucune adresse email (complétez la fiche client)</span>}
                </p>
                {data.emailSentAt ? (
                  <p className={`text-sm ${data.emailInFuture ? 'text-sky-700' : 'text-green-700'}`}>
                    {data.emailInFuture ? `Programmé pour le ${data.emailSentAt}` : `Envoyé le ${data.emailSentAt}`}
                  </p>
                ) : data.emailPlanned && (
                  <p className="text-xs text-gray-500">Heure d&apos;envoi prévue : {data.emailPlanned} (ou dès la validation si elle est passée)</p>
                )}
                {data.emailError && !data.emailSentAt && <p className="text-sm text-red-600">Dernière erreur : {data.emailError}</p>}
                <input value={subject} onChange={(e) => setSubject(e.target.value)} disabled={Boolean(data.emailSentAt)} className={inputCls} />
                <textarea value={body} onChange={(e) => setBody(e.target.value)} disabled={Boolean(data.emailSentAt)} rows={12} className={`${inputCls} font-sans`} />
                <p className="text-xs text-gray-400">Le lien personnel apparaîtra dans l&apos;email sous forme de bouton « Résoudre mon problème avec Kingso ».</p>
                {!data.emailSentAt && canSms && (
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" checked={alsoSms} onChange={(e) => setAlsoSms(e.target.checked)} className="h-4 w-4 accent-amber-500" />
                    Envoyer aussi le SMS au {sms.phone}
                  </label>
                )}
                <div className="flex flex-wrap gap-2">
                  {!data.emailSentAt && (
                    <>
                      <Button type="button" onClick={sendEmail} loading={busy === 'send'} disabled={busy !== null || !data.email || paused}>
                        Valider et envoyer
                      </Button>
                      {emailDirty && (
                        <Button type="button" variant="secondary" onClick={() => patch('save-email', { emailSubject: subject, emailBody: body })} loading={busy === 'save-email'} disabled={busy !== null}>
                          Enregistrer le texte
                        </Button>
                      )}
                      <Button type="button" variant="ghost" onClick={() => action('skip_email', {})} disabled={busy !== null}>
                        Ne pas envoyer d&apos;email
                      </Button>
                    </>
                  )}
                  {data.emailInFuture && (
                    <Button type="button" variant="secondary" onClick={() => action('cancel_email', {})} loading={busy === 'cancel_email'} disabled={busy !== null}>
                      Annuler l&apos;envoi
                    </Button>
                  )}
                </div>
                {paused && !data.emailSentAt && <p className="text-xs text-amber-700">Envois en pause : activez-les dans les réglages SAV.</p>}
              </div>
            )}
          </Card>

          {/* SMS d'accusé de réception (avec le lien personnel vers Kingso) */}
          <Card title="SMS au client">
            {sms.sent ? (
              <p className="text-sm text-green-700">SMS envoyé le {sms.sent} (voir l&apos;historique).</p>
            ) : !sms.phone ? (
              <p className="text-sm text-gray-500">Pas de numéro de mobile (06 ou 07) pour ce client : pas de SMS possible.</p>
            ) : (
              <div className="space-y-2">
                <p className="text-sm">À : <strong>{sms.phone}</strong></p>
                {sms.error && <p className="text-sm text-red-600">Dernière erreur : {sms.error}</p>}
                <textarea value={smsText} onChange={(e) => setSmsText(e.target.value)} rows={4} className={`${inputCls} font-sans`} />
                <p className={`text-xs ${smsInfo.parts > 1 ? 'font-medium text-amber-700' : 'text-gray-400'}`}>
                  {smsInfo.chars} caractères · {smsInfo.parts} SMS
                  {smsInfo.parts > 1 && ' (facturé ' + smsInfo.parts + ' fois)'}
                  {smsInfo.unicode && ` · caractères spéciaux (${smsInfo.nonGsm.join(' ')}) : 70 caractères par SMS seulement`}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="secondary" onClick={sendSms} loading={busy === 'send_sms'} disabled={busy !== null || paused || smsInfo.parts > 3 || !smsText.trim()}>
                    Envoyer le SMS
                  </Button>
                  {smsText !== sms.text && (
                    <Button type="button" variant="ghost" onClick={() => setSmsText(sms.text)} disabled={busy !== null}>Texte d&apos;origine</Button>
                  )}
                </div>
                {!data.emailSentAt && data.email && <p className="text-xs text-gray-400">Il peut aussi partir avec l&apos;email (case à cocher au-dessus).</p>}
                {paused && <p className="text-xs text-amber-700">Envois en pause : activez-les dans les réglages SAV.</p>}
              </div>
            )}
          </Card>

          {/* Conversation avec Kingso */}
          {data.conversation.length > 0 && (
            <Card title={`Échange avec Kingso (${data.conversation.length})`}>
              <div className="max-h-[32rem] space-y-3 overflow-y-auto">
                {data.conversation.map((h) => (
                  <div key={h.id} className="space-y-1.5 text-sm">
                    <p className="text-xs text-gray-400">{h.at}</p>
                    {h.fromCase ? (
                      <p className="rounded-lg border border-dashed border-orange-300 px-3 py-2 whitespace-pre-wrap text-gray-600">
                        <strong>Message laissé au SAV</strong> <span className="text-xs">(transmis par Kingso, non affiché au client)</span> : {h.user}
                      </p>
                    ) : (
                      <div className="rounded-lg bg-orange-50 px-3 py-2">
                        <p className="whitespace-pre-wrap"><strong>Client :</strong> {h.user || (h.photos.length ? <span className="text-gray-500">(photo)</span> : '')}</p>
                        {h.photos.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {h.photos.map((p) => p.url ? (
                              <a key={p.path} href={p.url} target="_blank" rel="noreferrer">
                                {/* eslint-disable-next-line @next/next/no-img-element -- URL signée temporaire du stockage privé */}
                                <img src={p.url} alt="Photo du client" className="h-20 w-20 rounded-lg object-cover ring-1 ring-orange-200" />
                              </a>
                            ) : null)}
                          </div>
                        )}
                        {h.photoNote && <p className="mt-1 text-xs text-gray-500"><strong>Lu sur la photo :</strong> {h.photoNote}</p>}
                      </div>
                    )}
                    <p className="rounded-lg bg-gray-50 px-3 py-2 whitespace-pre-wrap"><strong>Kingso :</strong> {h.kingso}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          {/* Urgence (proposée par Kingso) et difficulté : modifiables par tous */}
          <Card title="Urgence et difficulté">
            <CaseRating caseId={data.id} urgency={data.urgency} difficulty={data.difficulty} />
          </Card>

          {/* Actions selon l'étape */}
          {open && (
            <Card title="Suivi">
              {canCall && (
                <div className="space-y-2">
                  <p className="text-sm text-gray-600">
                    Rappeler au{' '}
                    <a href={`tel:${(data.callbackPhone || data.phone).replace(/\s/g, '')}`} className="font-semibold text-amber-700 hover:underline">
                      {data.callbackPhone || data.phone || '—'}
                    </a>
                    {data.callbackPhone && data.phone && data.callbackPhone !== data.phone && <span className="text-xs text-gray-400"> (appelant : {data.phone})</span>}
                  </p>
                  <textarea value={callNote} onChange={(e) => setCallNote(e.target.value)} rows={7} placeholder="Compte rendu de l'appel (facultatif) : tapez ou dictez avec le micro" className={`${inputCls} min-h-40 resize-y`} />
                  <DictationButton value={callNote} onChange={setCallNote} disabled={busy !== null} />
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" onClick={() => action('call_resolved', { note: callNote }).then((r) => r && setCallNote(''))} disabled={busy !== null}>Résolu au téléphone</Button>
                    <Button type="button" size="sm" variant="secondary" onClick={() => action('call_intervention', { note: callNote }).then((r) => r && setCallNote(''))} disabled={busy !== null}>Intervention nécessaire</Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => action('call_unreachable', { note: callNote }).then((r) => r && setCallNote(''))} disabled={busy !== null}>Injoignable</Button>
                  </div>
                </div>
              )}
              {(data.status === 'TO_SCHEDULE' || (data.status === 'SCHEDULED' && (!data.appointmentAt || reschedule))) && (
                <div className="space-y-2">
                  <p className="text-sm text-gray-600">
                    {data.status === 'TO_SCHEDULE'
                      ? `Intervention à planifier${data.city ? ` à ${data.city}` : ''}.`
                      : data.appointmentAt ? 'Nouvelle date du rendez-vous :' : 'Planifié sans date : saisissez la date du rendez-vous.'}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <input type="datetime-local" value={appointment} onChange={(e) => setAppointment(e.target.value)} className={`${inputCls} w-auto flex-1`} />
                    <label className="flex items-center gap-2 text-sm text-gray-600">
                      Durée
                      <DurationSelect value={minutes} onChange={setMinutes} className="py-2" />
                    </label>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-gray-600">
                    Intervenant
                    <TechnicianSelect technicians={technicians} value={techId} onChange={setTechId} />
                  </label>
                  <TechnicianSuggestions caseId={data.id} selected={techId} onPick={setTechId} disabled={busy !== null} day={appointment.slice(0, 10)} />
                  <Button type="button" size="sm" onClick={() => action('schedule', { appointmentAt: new Date(appointment).toISOString(), durationMinutes: minutes, technicianId: techId || null }).then((r) => r && setReschedule(false))} disabled={!appointment || busy !== null}>
                    Fixer le rendez-vous
                  </Button>
                  {reschedule && <Button type="button" size="sm" variant="ghost" onClick={() => setReschedule(false)}>Annuler</Button>}
                </div>
              )}
              {data.status === 'SCHEDULED' && data.appointmentAt && !reschedule && (
                <div className="space-y-2">
                  <p className="flex items-center gap-2 rounded-lg bg-sky-50 px-3 py-2 text-base font-semibold text-sky-900 ring-1 ring-sky-300">
                    <span aria-hidden="true">📅</span> Intervention {data.appointmentAt}
                  </p>
                  <label className="flex items-center gap-2 text-sm text-gray-600">
                    Intervenant
                    <TechnicianSelect
                      technicians={technicians}
                      value={data.technicianId ?? ''}
                      onChange={(id) => action('assign', { technicianId: id || null })}
                      disabled={busy !== null}
                    />
                  </label>
                  {!data.technicianId && (
                    <TechnicianSuggestions caseId={data.id} selected="" onPick={(id) => action('assign', { technicianId: id })} disabled={busy !== null} />
                  )}
                  {assignedTech?.kind === 'POSEUR' && (
                    <TechnicianLink caseId={data.id} technician={assignedTech} disabled={busy !== null} onInfo={setInfo} onError={setError} />
                  )}
                  {data.planningLink ? (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                      <span className="font-semibold text-green-700">✓ Ajouté au planning</span>
                      <a href={data.planningLink} target="_blank" rel="noreferrer" className="text-sky-700 hover:underline">Voir dans l&apos;agenda ↗</a>
                      <button type="button" onClick={() => confirm('Retirer ce rendez-vous de l\'agenda ?') && action('calendar_remove', {})} disabled={busy !== null} className="text-xs text-gray-500 hover:underline">
                        Retirer du planning
                      </button>
                    </div>
                  ) : calendarConnected ? (
                    <Button type="button" onClick={() => action('calendar_add', {})} loading={busy === 'calendar_add'} disabled={busy !== null}>
                      📅 Ajouter au planning
                    </Button>
                  ) : (
                    <p className="text-xs text-gray-500">Pour ajouter ce rendez-vous à l&apos;agenda, connectez l&apos;agenda du planning dans Réglages SAV.</p>
                  )}
                  {reporting ? (
                    <TechReportForm caseId={data.id} photos={data.techPhotos} onCancel={() => setReporting(false)} />
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" onClick={() => setReporting(true)} disabled={busy !== null}>Faire le retour d&apos;intervention</Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => { setAppointment(toLocalInput(data.appointmentIso)); setMinutes(data.appointmentMinutes); setTechId(data.technicianId ?? ''); setReschedule(true) }}>Changer la date, la durée ou l&apos;intervenant</Button>
                    </div>
                  )}
                </div>
              )}
              {data.status === 'TECH_REPORT' && (
                <div className="space-y-2">
                  <p className="rounded-lg bg-orange-100 px-3 py-2 text-sm font-semibold text-orange-900 ring-1 ring-orange-300">
                    Intervention passée{data.appointmentAt ? ` (${data.appointmentAt})` : ''}{technicianName ? ` — ${technicianName}` : ''} : retour du technicien attendu.
                  </p>
                  <TechReportForm caseId={data.id} photos={data.techPhotos} />
                </div>
              )}
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
                <select
                  value=""
                  onChange={(e) => e.target.value && action('status', { status: e.target.value })}
                  className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs"
                >
                  <option value="">Changer le statut…</option>
                  {Object.entries(STATUS_LABELS).filter(([k]) => k !== data.status).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </Card>
          )}
          {!open && (
            <Card title="Suivi">
              <Button type="button" size="sm" variant="secondary" onClick={() => action('status', { status: 'TO_CALL' })} disabled={busy !== null}>
                Rouvrir (à rappeler)
              </Button>
            </Card>
          )}
          {canDelete && (
            <div className="text-right">
              <button type="button" onClick={deleteCase} disabled={busy !== null} className="text-xs text-red-600 hover:underline disabled:opacity-50">
                {busy === 'delete' ? 'Suppression…' : 'Supprimer ce dossier'}
              </button>
            </div>
          )}

          {/* Dernier retour du technicien */}
          {data.techReportAt && data.techOutcome && (
            <Card title="Retour technicien">
              <TechReportView
                caseId={data.id}
                outcome={data.techOutcome}
                report={data.techReport}
                at={data.techReportAt}
                by={data.techReportBy}
                photos={data.techPhotos}
                editable={data.status !== 'TECH_REPORT' && !reporting}
              />
            </Card>
          )}

          {/* Client */}
          <Card
            title="Client"
            action={!editing ? <button type="button" onClick={() => setEditing(true)} className="text-xs text-amber-700 hover:underline">Modifier</button> : undefined}
          >
            {editing ? (
              <div className="space-y-2">
                {([
                  ['customerName', 'Nom'], ['email', 'Email'], ['callbackPhone', 'Téléphone de rappel'], ['address', 'Adresse'],
                  ['postalCode', 'Code postal'], ['city', 'Commune'], ['equipment', 'Équipement (marque, modèle)'],
                ] as const).map(([k, label]) => (
                  <label key={k} className="block text-xs text-gray-500">
                    {label}
                    <input value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className={inputCls} />
                  </label>
                ))}
                <label className="block text-xs text-gray-500">
                  Résumé de la demande
                  <textarea value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} rows={4} className={inputCls} />
                </label>
                <div className="flex gap-2">
                  <Button type="button" size="sm" onClick={() => patch('edit', form).then((r) => r && setEditing(false))} loading={busy === 'edit'}>Enregistrer</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>Annuler</Button>
                </div>
              </div>
            ) : (
              <dl className="space-y-1.5 text-sm">
                <div><dt className="inline text-gray-500">Nom : </dt><dd className="inline font-medium">{data.customerName || '—'}</dd></div>
                <div><dt className="inline text-gray-500">Téléphone : </dt><dd className="inline">{data.callbackPhone || data.phone || '—'}</dd></div>
                <div><dt className="inline text-gray-500">Email : </dt><dd className="inline">{data.email || '—'}</dd></div>
                <div><dt className="inline text-gray-500">Adresse : </dt><dd className="inline">{[data.address, data.postalCode, data.city].filter(Boolean).join(', ') || '—'}</dd></div>
                <div><dt className="inline text-gray-500">Équipement : </dt><dd className="inline">{data.equipment || '—'}</dd></div>
                {data.contract && <div><dt className="inline text-gray-500">Contrat : </dt><dd className="inline">{data.contract}</dd></div>}
                <p className={`pt-1 text-xs ${data.clientIdentified ? 'text-green-700' : 'text-orange-700'}`}>
                  {data.clientIdentified ? '✓ Identifié' : 'Non identifié'}{data.clientMatch ? ` — ${data.clientMatch}` : ''}
                </p>
              </dl>
            )}
            {!data.clientIdentified && !editing && (
              <ClientPicker suggestions={suggestions} onPick={(clientId) => action('link_client', { clientId })} disabled={busy !== null} />
            )}
          </Card>

          {/* Lien personnel */}
          <Card title="Lien Kingso du client">
            <p className="break-all text-xs text-gray-500">{link}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" variant="secondary" onClick={() => navigator.clipboard.writeText(link).then(() => setInfo('Lien copié : vous pouvez l\'envoyer par SMS au client.'))}>
                Copier le lien
              </Button>
              <a href={link} target="_blank" rel="noopener noreferrer" className="text-xs text-amber-700 hover:underline">Ouvrir</a>
            </div>
            <label className="mt-3 block text-xs text-gray-500">
              Chat utilisé
              <select
                value={data.assistantId}
                onChange={(e) => patch('assistant', { assistantId: e.target.value })}
                className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm"
              >
                <option value="">—</option>
                {assistants.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
          </Card>

          {/* Historique */}
          <Card title="Historique">
            <div className="mb-3 space-y-2">
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={5} placeholder="Ajouter une note : tapez ou dictez avec le micro" className={`${inputCls} min-h-28 resize-y`} />
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" variant="secondary" onClick={() => action('note', { note }).then((r) => r && setNote(''))} disabled={!note.trim() || busy !== null}>
                  Ajouter
                </Button>
                <DictationButton value={note} onChange={setNote} disabled={busy !== null} />
              </div>
            </div>
            <ol className="space-y-2.5">
              {data.events.map((e) => (
                <li key={e.id} className="text-sm">
                  <p className="text-xs text-gray-400">{e.at}{e.author ? ` · ${e.author}` : ' · Kingso'}</p>
                  <p className={e.kind === 'NOTE' ? 'whitespace-pre-wrap text-gray-800' : 'text-gray-700'}>
                    <strong className="font-medium">{e.label}</strong>{e.detail ? ` — ${e.detail}` : ''}
                  </p>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </div>
  )
}

/** Lien personnel de l'intervention pour un poseur (sans compte) : à copier, ou envoyé par SMS sur clic. */
function TechnicianLink({ caseId, technician, disabled, onInfo, onError }: {
  caseId: string
  technician: TechnicianOption
  disabled: boolean
  onInfo: (text: string) => void
  onError: (text: string) => void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [link, setLink] = useState<string | null>(null)
  const post = async (key: string) => {
    setBusy(key)
    const res = await fetch(`/api/sav/cases/${caseId}/actions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: key }),
    })
    const json = await res.json().catch(() => ({}))
    setBusy(null)
    if (!res.ok) { onError(json.error ?? `Erreur ${res.status}`); return null }
    return json
  }
  const copy = async () => {
    const json = await post('tech_link')
    if (!json?.link) return
    setLink(json.link)
    await navigator.clipboard.writeText(json.link).then(
      () => onInfo(`Lien copié : envoyez-le à ${technician.name} (SMS, WhatsApp…).`),
      () => onInfo('Lien affiché ci-dessous : copiez-le à la main.'),
    )
  }
  const sms = async () => {
    if (!confirm(`Envoyer par SMS à ${technician.name} (${technician.phone}) le lien de cette intervention ?`)) return
    const json = await post('tech_link_sms')
    if (json?.phone) onInfo(`Lien de l'intervention envoyé par SMS à ${technician.name} (${json.phone}).`)
  }
  return (
    <div className="space-y-1.5 rounded-lg bg-orange-50 px-3 py-2 ring-1 ring-orange-200">
      <p className="text-sm text-orange-900">
        <strong>{technician.name}</strong> est poseur (sans compte) : envoyez-lui le lien de l&apos;intervention. Il y voit ce dossier
        seulement et fait son retour depuis son téléphone.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={copy} loading={busy === 'tech_link'} disabled={disabled || busy !== null}>Copier le lien</Button>
        {technician.phone
          ? <Button type="button" size="sm" variant="secondary" onClick={sms} loading={busy === 'tech_link_sms'} disabled={disabled || busy !== null}>Envoyer par SMS au {technician.phone}</Button>
          : <span className="self-center text-xs text-gray-500">Pas de mobile sur sa fiche (Intervenants) pour l&apos;envoi par SMS.</span>}
      </div>
      {link && <p className="break-all text-xs text-gray-500">{link}</p>}
    </div>
  )
}

function TechnicianSelect({ technicians, value, onChange, disabled }: {
  technicians: TechnicianOption[]
  value: string
  onChange: (id: string) => void
  disabled?: boolean
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900"
    >
      <option value="">{technicians.length ? 'Aucun' : 'Aucun intervenant (à ajouter dans Intervenants)'}</option>
      {technicians.map((t) => <option key={t.id} value={t.id}>{t.name}{t.kind === 'POSEUR' ? ' (poseur)' : ''}</option>)}
    </select>
  )
}
