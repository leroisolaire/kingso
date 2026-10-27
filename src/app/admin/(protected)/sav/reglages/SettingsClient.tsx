'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'
import type { ClientFileState } from '@/lib/sav/clientSync'
import type { SavSettings } from '@/lib/sav/settings'

interface Template {
  key: string
  name: string
  subject: string
  body: string
  autoSend: boolean
}

const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500'
const PRODUCTS: [string, string][] = [['PAC', 'Pompe à chaleur'], ['CLIM', 'Climatisation'], ['CET', 'Chauffe-eau thermodynamique'], ['PV', 'Panneaux solaires'], ['BATTERIE', 'Batterie']]

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="font-semibold text-gray-900">{title}</h2>
      {children}
    </section>
  )
}

function TemplateEditor({ t }: { t: Template }) {
  const router = useRouter()
  const [subject, setSubject] = useState(t.subject)
  const [body, setBody] = useState(t.body)
  const [autoSend, setAutoSend] = useState(t.autoSend)
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const dirty = subject !== t.subject || body !== t.body || autoSend !== t.autoSend

  const save = async () => {
    setState('saving')
    const res = await fetch('/api/sav/templates', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: t.key, subject, body, autoSend }),
    })
    setState(res.ok ? 'saved' : 'error')
    router.refresh()
  }

  return (
    <details className="rounded-lg border border-gray-200 p-3">
      <summary className="cursor-pointer text-sm font-medium text-gray-800">
        {t.name} <span className={`ml-2 text-xs ${t.autoSend ? 'text-green-700' : 'text-gray-400'}`}>{t.autoSend ? 'envoi direct' : 'à valider'}</span>
      </summary>
      <div className="mt-3 space-y-2">
        <input value={subject} onChange={(e) => setSubject(e.target.value)} className={inputCls} />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={10} className={inputCls} />
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={autoSend} onChange={(e) => setAutoSend(e.target.checked)} className="h-4 w-4 accent-amber-500" />
          Envoi direct, sans validation (si l&apos;adresse email du client est connue)
        </label>
        <div className="flex items-center gap-3">
          <Button type="button" size="sm" onClick={save} disabled={!dirty} loading={state === 'saving'}>Enregistrer</Button>
          {state === 'saved' && !dirty && <span className="text-xs text-green-700">Enregistré</span>}
          {state === 'error' && <span className="text-xs text-red-600">Erreur</span>}
        </div>
      </div>
    </details>
  )
}

/** Fichier client (export Extrabat) déposé dans un dossier Drive à part, relu automatiquement. */
function ClientFileCard({ folderId, state }: { folderId: string; state: ClientFileState & { count: number } }) {
  const router = useRouter()
  const [folder, setFolder] = useState(folderId ? `https://drive.google.com/drive/folders/${folderId}` : '')
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const run = async (key: string, url: string, method: string, body?: unknown) => {
    setBusy(key)
    setMessage(null)
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    const json = await res.json().catch(() => ({}))
    setBusy(null)
    setMessage(res.ok
      ? { ok: true, text: key === 'import' ? `${json.result?.imported ?? 0} clients importés, ${json.rematched ?? 0} dossier(s) SAV complété(s).` : 'Dossier enregistré.' }
      : { ok: false, text: json.error ?? `Erreur ${res.status}` })
    router.refresh()
  }
  const date = (iso?: string) => (iso ? new Date(iso).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '')

  return (
    <Card title="Fichier client (export Extrabat)">
      <p className="text-sm text-gray-500">
        Déposez l&apos;export clients d&apos;Extrabat (.xlsx) dans un dossier Drive à part, partagé en lecture avec Kingso. Il est relu
        automatiquement dès qu&apos;une nouvelle version y est déposée. Seuls l&apos;identifiant, le nom, les téléphones, l&apos;email,
        l&apos;adresse et les ouvrages sont gardés.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="Lien du dossier Drive « Kingso - Clients »" className={inputCls} />
        <Button type="button" variant="secondary" onClick={() => run('folder', '/api/sav/settings', 'PUT', { clientFolder: folder })} loading={busy === 'folder'} disabled={busy !== null}>
          Enregistrer
        </Button>
      </div>
      <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
        <p><strong>{state.count}</strong> client(s) en base.</p>
        {state.fileName && <p>Dernier import : « {state.fileName} » le {date(state.importedAt)}{state.result ? ` — ${state.result.imported} lus, ${state.result.removed} retirés` : ''}.</p>}
        {state.checkedAt && <p className="text-xs text-gray-400">Dernière vérification : {date(state.checkedAt)}</p>}
        {state.error && <p className="text-red-600">Erreur : {state.error}</p>}
      </div>
      <Button type="button" onClick={() => run('import', '/api/sav/clients', 'POST')} loading={busy === 'import'} disabled={busy !== null || !folderId}>
        Importer maintenant
      </Button>
      {message && <p className={`text-sm ${message.ok ? 'text-green-700' : 'text-red-600'}`}>{message.text}</p>}
    </Card>
  )
}

export interface MailboxInfo {
  expected: string
  configured: boolean
  connected: boolean
  email: string | null
  connectedAt: string | null
  connectedBy: string | null
  checkedAt: string | null
  lastImportAt: string | null
  imported: number
  error: string | null
  instant: boolean
  message: string | null
}

const parisDate = (iso?: string | null) =>
  (iso ? new Date(iso).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '')

/** Boîte kingso@ : réception automatique des messages du répondeur (lecture seule). */
function MailboxCard({ m }: { m: MailboxInfo }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    m.message ? { ok: m.message === 'ok', text: m.message === 'ok' ? 'Boîte connectée.' : m.message } : null,
  )

  const run = async (action: 'check' | 'disconnect') => {
    if (action === 'disconnect' && !confirm('Arrêter la réception automatique des messages du répondeur ?')) return
    setBusy(action)
    setMessage(null)
    const res = await fetch('/api/sav/gmail', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) })
    const json = await res.json().catch(() => ({}))
    setBusy(null)
    if (!res.ok) setMessage({ ok: false, text: json.error ?? `Erreur ${res.status}` })
    else if (action === 'check') {
      const parts = [
        `${json.found} nouveau(x) message(s) du répondeur`,
        json.created ? `${json.created} dossier(s) créé(s)` : '',
        json.followUps ? `${json.followUps} relance(s) ajoutée(s)` : '',
        json.duplicates ? `${json.duplicates} déjà importé(s)` : '',
        json.remaining ? `${json.remaining} restant(s) : relancez` : '',
      ].filter(Boolean)
      setMessage({ ok: true, text: `${parts.join(', ')}.` })
    } else setMessage({ ok: true, text: 'Boîte déconnectée.' })
    router.refresh()
  }

  return (
    <Card title={`Boîte mail ${m.expected}`}>
      <p className="text-sm text-gray-500">
        Les emails du répondeur (Connectel) transférés vers {m.expected} deviennent automatiquement des dossiers SAV.
        Kingso a seulement le droit de <strong>lire</strong> cette boîte : il ne peut ni envoyer, ni supprimer, ni modifier.
      </p>
      {m.connected ? (
        <div className="space-y-1 rounded-lg bg-green-50 p-3 text-sm text-gray-700">
          <p>✓ Connectée : <strong>{m.email}</strong>{m.connectedAt ? ` depuis le ${parisDate(m.connectedAt)}` : ''}{m.connectedBy ? ` (par ${m.connectedBy})` : ''}</p>
          <p>
            {m.instant
              ? 'Réception instantanée active.'
              : 'Relevé à chaque ouverture de l\'espace SAV et chaque nuit (réception instantanée pas encore configurée).'}
          </p>
          {m.checkedAt && <p className="text-xs text-gray-500">Dernier relevé : {parisDate(m.checkedAt)}{m.lastImportAt ? ` · dernier message importé : ${parisDate(m.lastImportAt)}` : ''} · {m.imported} message(s) importé(s) au total</p>}
          {m.error && <p className="text-red-600">Erreur au dernier relevé : {m.error}</p>}
        </div>
      ) : (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          Pas encore connectée. Cliquez sur « Connecter », puis choisissez le compte <strong>{m.expected}</strong> chez Google et acceptez la lecture des emails.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {m.connected ? (
          <>
            <Button type="button" onClick={() => run('check')} loading={busy === 'check'} disabled={busy !== null}>Relever maintenant</Button>
            <Button type="button" variant="ghost" onClick={() => run('disconnect')} loading={busy === 'disconnect'} disabled={busy !== null}>Déconnecter</Button>
          </>
        ) : (
          <a
            href={m.configured ? '/api/sav/gmail/connect' : undefined}
            className={`inline-flex items-center rounded-lg px-4 py-2 text-sm font-medium text-white ${m.configured ? 'bg-amber-500 hover:bg-amber-600' : 'cursor-not-allowed bg-gray-300'}`}
          >
            Connecter {m.expected}
          </a>
        )}
      </div>
      {!m.configured && <p className="text-sm text-red-600">Identifiants Google (GOOGLE_OAUTH_CLIENT_ID / SECRET) absents sur ce serveur.</p>}
      {message && <p className={`text-sm ${message.ok ? 'text-green-700' : 'text-red-600'}`}>{message.text}</p>}
    </Card>
  )
}

export default function SettingsClient({ settings, templates, assistants, clientFile, mailbox }: {
  settings: SavSettings
  templates: Template[]
  assistants: { slug: string; name: string }[]
  clientFile: ClientFileState & { count: number }
  mailbox: MailboxInfo
}) {
  const router = useRouter()
  const [s, setS] = useState(settings)
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  const save = async (patch: Partial<SavSettings>) => {
    setState('saving')
    const res = await fetch('/api/sav/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
    if (res.ok) setS(await res.json())
    setState(res.ok ? 'saved' : 'error')
    router.refresh()
  }
  const num = (key: keyof SavSettings, label: string, suffix: string) => (
    <label className="flex items-center justify-between gap-3 text-sm text-gray-700">
      {label}
      <span className="flex items-center gap-1.5">
        <input
          type="number"
          min={0}
          value={s[key] as number}
          onChange={(e) => setS({ ...s, [key]: Number(e.target.value) })}
          className="w-20 rounded-lg border border-gray-300 px-2 py-1 text-right text-sm"
        />
        <span className="w-10 text-xs text-gray-400">{suffix}</span>
      </span>
    </label>
  )

  return (
    <div className="space-y-4">
      <MailboxCard m={mailbox} />

      <Card title="Envoi des emails">
        <div className={`flex flex-wrap items-center justify-between gap-3 rounded-lg p-3 ${s.paused ? 'bg-amber-50' : 'bg-green-50'}`}>
          <p className="text-sm">
            {s.paused
              ? <>Envois <strong>en pause</strong> : les emails sont préparés mais ne partent pas.</>
              : <>Envois <strong>actifs</strong> : les emails validés (ou en envoi direct) partent aux clients.</>}
          </p>
          <Button type="button" size="sm" variant={s.paused ? 'primary' : 'danger'} onClick={() => save({ paused: !s.paused })} loading={state === 'saving'}>
            {s.paused ? 'Activer les envois' : 'Mettre en pause'}
          </Button>
        </div>
        <label className="block text-sm text-gray-700">
          Expéditeur (validé dans Brevo)
          <input value={s.senderEmail} onChange={(e) => setS({ ...s, senderEmail: e.target.value })} className={inputCls} />
        </label>
        <label className="block text-sm text-gray-700">
          Nom de l&apos;expéditeur
          <input value={s.senderName} onChange={(e) => setS({ ...s, senderName: e.target.value })} className={inputCls} />
        </label>
        <label className="block text-sm text-gray-700">
          Signature
          <input value={s.signature} onChange={(e) => setS({ ...s, signature: e.target.value })} className={inputCls} />
        </label>
      </Card>

      <Card title="Délais">
        {num('sendDelayMinutes', 'Envoi de l\'email après l\'appel (environ)', 'min')}
        {num('selfHelpLastHour', '« Kingso peut aider » : envoi possible jusqu\'à', 'h')}
        {num('officeStartHour', 'Autres emails : du lundi au vendredi, à partir de', 'h')}
        {num('officeEndHour', '… et jusqu\'à', 'h')}
        {num('noClickHoursUrgent', 'Sans clic sur le lien, à rappeler après (sans chauffage)', 'h')}
        {num('noClickHours', 'Sans clic sur le lien, à rappeler après (autres cas)', 'h')}
      </Card>

      <Card title="Chat proposé selon le produit">
        {PRODUCTS.map(([key, label]) => (
          <label key={key} className="flex items-center justify-between gap-3 text-sm text-gray-700">
            {label}
            <select
              value={s.productChats[key] ?? ''}
              onChange={(e) => setS({ ...s, productChats: { ...s.productChats, [key]: e.target.value } })}
              className="w-56 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm"
            >
              <option value="">Aucun (pas de lien Kingso)</option>
              {assistants.map((a) => <option key={a.slug} value={a.slug}>{a.name}</option>)}
            </select>
          </label>
        ))}
      </Card>

      <div className="flex items-center gap-3">
        <Button type="button" onClick={() => save(s)} loading={state === 'saving'}>Enregistrer les réglages</Button>
        {state === 'saved' && <span className="text-sm text-green-700">Enregistré</span>}
        {state === 'error' && <span className="text-sm text-red-600">Erreur</span>}
      </div>

      <ClientFileCard folderId={settings.clientFolderId} state={clientFile} />

      <Card title="Modèles d'email">
        <p className="text-sm text-gray-500">
          Zones remplies automatiquement : {'{{salutation}}'}, {'{{date}}'}, {'{{probleme}}'}, {'{{machine}}'}, {'{{explication}}'} (rédigée par Kingso),
          {' '}{'{{lien}}'} (bouton vers Kingso), {'{{signature}}'}.
        </p>
        {templates.map((t) => <TemplateEditor key={t.key} t={t} />)}
      </Card>
    </div>
  )
}
