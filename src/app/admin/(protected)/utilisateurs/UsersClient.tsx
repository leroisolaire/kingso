'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'
import { ROLE_DESCRIPTIONS, ROLE_LABELS, type UserRole } from '@/lib/auth/permissions'

interface UserRow {
  id: string
  email: string
  name: string
  roles: UserRole[]
  active: boolean
  hasPassword: boolean
  lastLogin: string | null
}

const ROLES = Object.keys(ROLE_LABELS) as UserRole[]
const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500'
const ROLE_COLORS: Record<UserRole, string> = {
  SUPER_ADMIN: 'bg-slate-800 text-white',
  SAV: 'bg-amber-100 text-amber-900',
  PLANNING: 'bg-sky-100 text-sky-900',
  TECHNICIAN: 'bg-emerald-100 text-emerald-900',
}

function RoleChecks({ value, onChange, disabled }: { value: UserRole[]; onChange: (roles: UserRole[]) => void; disabled?: (r: UserRole) => boolean }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
      {ROLES.map((r) => (
        <label key={r} className="flex items-center gap-1.5 text-sm text-gray-700" title={ROLE_DESCRIPTIONS[r]}>
          <input
            type="checkbox"
            checked={value.includes(r)}
            disabled={disabled?.(r)}
            onChange={(e) => onChange(e.target.checked ? [...value, r] : value.filter((x) => x !== r))}
            className="h-4 w-4 accent-amber-500"
          />
          {ROLE_LABELS[r]}
        </label>
      ))}
    </div>
  )
}

const MIN_PASSWORD = 10

/** Mot de passe facile à dicter ou recopier : sans caractères ambigus (0/O, 1/l/I). */
function generatePassword(length = 12): string {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const values = crypto.getRandomValues(new Uint32Array(length))
  return Array.from(values, (v) => chars[v % chars.length]).join('')
}

/** Champ mot de passe visible (le Super admin doit pouvoir le lire pour le transmettre) + bouton Générer. */
function PasswordField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-2">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="new-password"
        spellCheck={false}
        placeholder={`${MIN_PASSWORD} caractères minimum`}
        className={`${inputCls} font-mono`}
      />
      <Button type="button" size="sm" variant="secondary" onClick={() => onChange(generatePassword())}>Générer</Button>
    </div>
  )
}

function connectionLabel(u: UserRow, domain: string): string {
  const google = u.email.endsWith(`@${domain}`)
  if (google && u.hasPassword) return 'Connexion : Google ou mot de passe'
  return google ? 'Connexion : Google' : 'Connexion : identifiant + mot de passe'
}

function UserItem({ u, isMe, domain }: { u: UserRow; isMe: boolean; domain: string }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [settingPassword, setSettingPassword] = useState(false)
  const [password, setPassword] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const isGoogle = u.email.endsWith(`@${domain}`)
  const [name, setName] = useState(u.name)
  const [roles, setRoles] = useState<UserRole[]>(u.roles)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const patch = async (data: Record<string, unknown>) => {
    setBusy(true)
    setError(null)
    const res = await fetch(`/api/users/${u.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    const json = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) {
      setError(json.error ?? `Erreur ${res.status}`)
      return false
    }
    router.refresh()
    return true
  }

  return (
    <li className={`space-y-2 px-4 py-3 ${u.active ? '' : 'bg-gray-50 opacity-70'}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-gray-900">
            {u.name || u.email}
            {isMe && <span className="ml-2 text-xs font-normal text-gray-400">(vous)</span>}
            {!u.active && <span className="ml-2 rounded bg-gray-200 px-1.5 py-0.5 text-xs font-medium text-gray-600">Désactivé</span>}
          </p>
          {u.name && <p className="text-sm text-gray-500">{u.email}</p>}
          <p className="text-xs text-gray-400">
            {connectionLabel(u, domain)} · {u.lastLogin ? `dernière connexion : ${u.lastLogin}` : 'jamais connecté'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {u.roles.map((r) => <span key={r} className={`rounded-md px-2 py-0.5 text-xs font-semibold ${ROLE_COLORS[r]}`}>{ROLE_LABELS[r]}</span>)}
          {u.roles.length === 0 && <span className="text-xs text-red-600">Aucun rôle : pas d&apos;accès</span>}
        </div>
      </div>

      {editing ? (
        <div className="space-y-2 rounded-lg border border-gray-200 bg-white p-3">
          <label className="block text-xs text-gray-500">
            Nom affiché (historique des dossiers)
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
          </label>
          <RoleChecks value={roles} onChange={setRoles} disabled={(r) => isMe && r === 'SUPER_ADMIN'} />
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={() => patch({ name, roles }).then((ok) => ok && setEditing(false))} loading={busy} disabled={roles.length === 0}>
              Enregistrer
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => { setEditing(false); setName(u.name); setRoles(u.roles) }}>Annuler</Button>
          </div>
        </div>
      ) : settingPassword ? (
        <div className="space-y-2 rounded-lg border border-gray-200 bg-white p-3">
          <p className="text-xs text-gray-500">
            Nouveau mot de passe pour <strong>{u.email}</strong>. Notez-le pour le lui transmettre : il ne sera plus affiché.
            {!isMe && ' Ses sessions ouvertes seront fermées.'}
          </p>
          <PasswordField value={password} onChange={setPassword} />
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              loading={busy}
              disabled={password.length < MIN_PASSWORD}
              onClick={() => patch({ password }).then((ok) => {
                if (!ok) return
                setNotice(`Mot de passe enregistré. Identifiant : ${u.email} · mot de passe : ${password}`)
                setSettingPassword(false)
                setPassword('')
              })}
            >
              Enregistrer le mot de passe
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => { setSettingPassword(false); setPassword('') }}>Annuler</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-3 text-xs">
          <button type="button" onClick={() => setEditing(true)} className="text-amber-700 hover:underline">Modifier</button>
          <button type="button" onClick={() => { setNotice(null); setSettingPassword(true); setPassword(generatePassword()) }} className="text-amber-700 hover:underline">
            {u.hasPassword ? 'Changer le mot de passe' : 'Attribuer un mot de passe'}
          </button>
          {isGoogle && u.hasPassword && (
            <button
              type="button"
              disabled={busy}
              onClick={() => confirm(`Retirer le mot de passe de ${u.email} ? Il ne pourra plus se connecter qu'avec Google.`) && patch({ password: null })}
              className="text-gray-500 hover:underline"
            >
              Retirer le mot de passe
            </button>
          )}
          {!isMe && (
            <button
              type="button"
              disabled={busy}
              onClick={() => (u.active ? confirm(`Désactiver ${u.email} ? Sa session sera fermée immédiatement.`) : true) && patch({ active: !u.active })}
              className={u.active ? 'text-red-600 hover:underline' : 'text-green-700 hover:underline'}
            >
              {u.active ? 'Désactiver' : 'Réactiver'}
            </button>
          )}
        </div>
      )}
      {notice && (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
          {notice}{' '}
          <button type="button" onClick={() => setNotice(null)} className="ml-1 text-xs text-green-700 underline">Masquer</button>
        </p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </li>
  )
}

export default function UsersClient({ users, meId, domain }: { users: UserRow[]; meId: string; domain: string }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [roles, setRoles] = useState<UserRole[]>(['SAV'])
  const [mode, setMode] = useState<'google' | 'password'>('google')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const choosePassword = () => {
    setMode('password')
    if (!password) setPassword(generatePassword())
  }

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setMessage(null)
    const payload = mode === 'password' ? { email, name, roles, password } : { email, name, roles }
    const res = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const json = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) return setMessage({ ok: false, text: json.error ?? `Erreur ${res.status}` })
    const login = email.trim().toLowerCase()
    setMessage({
      ok: true,
      text: mode === 'password'
        ? `Accès ouvert. Transmettez-lui : identifiant ${login} · mot de passe ${password} (il ne sera plus affiché). Il se connecte avec « Identifiant et mot de passe ».`
        : `Accès ouvert à ${login} : il peut se connecter avec « Se connecter avec Google ».`,
    })
    setEmail('')
    setName('')
    setPassword('')
    router.refresh()
  }

  return (
    <div className="space-y-5">
      <form onSubmit={add} className="space-y-3 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-gray-900">Ajouter un collaborateur</h2>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Mode de connexion">
          {([
            ['google', `Compte Google @${domain}`],
            ['password', 'Identifiant + mot de passe (sans compte Google)'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={mode === key}
              onClick={() => (key === 'password' ? choosePassword() : setMode('google'))}
              className={`rounded-full px-3 py-1.5 text-sm ring-1 ${mode === key ? 'bg-amber-50 font-semibold text-amber-900 ring-amber-400' : 'bg-white text-gray-600 ring-gray-300 hover:bg-gray-50'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {mode === 'google' ? (
            <label className="block text-xs text-gray-500">
              Email Google
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder={`prenom.nom@${domain}`} className={inputCls} />
            </label>
          ) : (
            <label className="block text-xs text-gray-500">
              Identifiant (email ou nom de connexion)
              <input required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="prenom.nom" autoComplete="off" spellCheck={false} className={inputCls} />
            </label>
          )}
          <label className="block text-xs text-gray-500">
            Nom affiché {mode === 'google' ? '(facultatif, sinon celui du compte Google)' : '(dans l\'historique des dossiers)'}
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
          </label>
          {mode === 'password' && (
            <div className="block text-xs text-gray-500 sm:col-span-2">
              Mot de passe attribué (notez-le pour le lui transmettre)
              <PasswordField value={password} onChange={setPassword} />
            </div>
          )}
        </div>
        <RoleChecks value={roles} onChange={setRoles} />
        <ul className="space-y-0.5 text-xs text-gray-500">
          {ROLES.map((r) => <li key={r}><strong>{ROLE_LABELS[r]}</strong> : {ROLE_DESCRIPTIONS[r]}</li>)}
        </ul>
        <div className="flex items-center gap-3">
          <Button type="submit" loading={busy} disabled={!email.trim() || roles.length === 0 || (mode === 'password' && password.length < MIN_PASSWORD)}>Ouvrir l&apos;accès</Button>
          {message && <p className={`text-sm ${message.ok ? 'text-green-700' : 'text-red-600'}`}>{message.text}</p>}
        </div>
      </form>

      <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
        {users.map((u) => <UserItem key={u.id} u={u} isMe={u.id === meId} domain={domain} />)}
      </ul>
    </div>
  )
}
