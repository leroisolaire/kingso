'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'
import { KIND_LABELS, parseSkillLevels, SKILL_LEVEL_LABELS, SKILLS, type Skill, type SkillLevels, type TechnicianKind } from '@/lib/sav/skills'

export interface TechnicianRow {
  id: string
  name: string
  kind: TechnicianKind
  phone: string
  userId: string | null
  skills: string[]
  maxDifficulty: number | null
  sector: string
  agendaCodes: string[]
  active: boolean
  upcoming: number
  assigned: number
}

interface UserOption { id: string; label: string; technicianRole: boolean }

interface FormValues {
  name: string
  kind: TechnicianKind
  phone: string
  userId: string
  skills: SkillLevels
  sector: string
  agendaCodes: string
}

const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500'
const KIND_STYLES: Record<TechnicianKind, string> = { SAV: 'bg-emerald-100 text-emerald-900', POSEUR: 'bg-orange-100 text-orange-900' }

const empty: FormValues = { name: '', kind: 'POSEUR', phone: '', userId: '', skills: {}, sector: '', agendaCodes: '' }
const toForm = (t: TechnicianRow): FormValues => ({
  name: t.name, kind: t.kind, phone: t.phone, userId: t.userId ?? '', skills: parseSkillLevels(t.skills, t.maxDifficulty),
  sector: t.sector, agendaCodes: t.agendaCodes.join(', '),
})

/** Une compétence : 5 étoiles cliquables (un clic sur la note choisie retire la compétence). */
function SkillRow({ label, level, onChange }: { label: string; level: number | null | undefined; onChange: (level: number | null | undefined) => void }) {
  const [hover, setHover] = useState<number | null>(null)
  const has = level !== undefined
  const shown = hover ?? level ?? 0
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-1">
      <span className={`w-44 shrink-0 text-sm ${has ? 'font-medium text-gray-900' : 'text-gray-500'}`}>{label}</span>
      <div className="flex" onMouseLeave={() => setHover(null)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onMouseEnter={() => setHover(n)}
            onClick={() => onChange(n === level ? undefined : n)}
            className={`px-0.5 text-xl leading-none ${n <= shown ? 'text-amber-500' : 'text-gray-300'}`}
            aria-label={`${label} : ${n} sur 5, ${SKILL_LEVEL_LABELS[n]}`}
            title={`${n}/5 : ${SKILL_LEVEL_LABELS[n]}`}
          >
            ★
          </button>
        ))}
      </div>
      <span className="text-xs text-gray-500">
        {hover ? `${hover}/5 · ${SKILL_LEVEL_LABELS[hover]}` : level ? `${level}/5 · ${SKILL_LEVEL_LABELS[level]}` : has ? <span className="text-orange-700">à noter</span> : 'non'}
      </span>
      {has && <button type="button" onClick={() => onChange(undefined)} className="text-xs text-gray-400 hover:text-red-600" aria-label={`Retirer ${label}`}>retirer</button>}
    </div>
  )
}

function TechnicianForm({ initial, users, linkedUserIds, onSave, onCancel, busy }: {
  initial: FormValues
  users: UserOption[]
  linkedUserIds: Set<string>
  onSave: (values: FormValues) => void
  onCancel: () => void
  busy: boolean
}) {
  const [v, setV] = useState(initial)
  const user = users.find((u) => u.id === v.userId)
  const setSkill = (key: Skill, level: number | null | undefined) => {
    const skills = { ...v.skills }
    if (level === undefined) delete skills[key]
    else skills[key] = level
    setV({ ...v, skills })
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSave(v) }}
      className="space-y-3 rounded-xl border border-amber-300 bg-amber-50/40 p-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs text-gray-600">
          Nom
          <input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="Prénom Nom" className={inputCls} required autoFocus />
        </label>
        <div className="text-xs text-gray-600">
          Type
          <div className="mt-1 flex gap-2">
            {(Object.keys(KIND_LABELS) as TechnicianKind[]).map((k) => (
              <button key={k} type="button" onClick={() => setV({ ...v, kind: k })}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ring-1 ${v.kind === k ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-gray-700 ring-gray-300 hover:bg-gray-50'}`}>
                {KIND_LABELS[k]}
              </button>
            ))}
          </div>
        </div>
        <label className="block text-xs text-gray-600">
          Téléphone mobile {v.kind === 'POSEUR' && <span className="text-gray-400">(pour lui envoyer ses liens d&apos;intervention)</span>}
          <input value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} placeholder="06 12 34 56 78" inputMode="tel" className={inputCls} />
        </label>
        {v.kind === 'SAV' ? (
          <label className="block text-xs text-gray-600">
            Compte de connexion
            <select value={v.userId} onChange={(e) => setV({ ...v, userId: e.target.value })} className={inputCls}>
              <option value="">Aucun</option>
              {users.filter((u) => u.id === v.userId || !linkedUserIds.has(u.id)).map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
            </select>
            {user && !user.technicianRole && <span className="mt-1 block text-orange-700">Ce compte n&apos;a pas le rôle Technicien (à donner dans Utilisateurs).</span>}
            {!v.userId && <span className="mt-1 block text-gray-400">Compte Google ou identifiant + mot de passe, créé dans Utilisateurs.</span>}
          </label>
        ) : (
          <p className="self-end text-xs text-gray-500">Pas de compte : il reçoit un lien personnel pour chaque intervention, qui ne montre que ce dossier.</p>
        )}
      </div>

      <div className="text-xs text-gray-600">
        Compétences et niveau <span className="text-gray-400">(1 débutant … 5 expert ; comparé à la difficulté 🔧 du dossier)</span>
        <div className="mt-1 divide-y divide-gray-100 rounded-lg bg-white px-3 ring-1 ring-gray-200">
          {(Object.entries(SKILLS) as [Skill, string][]).map(([key, label]) => (
            <SkillRow key={key} label={label} level={v.skills[key]} onChange={(level) => setSkill(key, level)} />
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs text-gray-600">
          Secteur
          <input value={v.sector} onChange={(e) => setV({ ...v, sector: e.target.value })} placeholder="13, 83, Aubagne" className={inputCls} />
          <span className="mt-0.5 block text-gray-400">Départements, codes postaux ou communes</span>
        </label>
        <label className="block text-xs text-gray-600">
          Repères dans l&apos;agenda des chantiers
          <input value={v.agendaCodes} onChange={(e) => setV({ ...v, agendaCodes: e.target.value })} placeholder="MAR" className={`${inputCls} uppercase`} />
          <span className="mt-0.5 block text-gray-400">Comme écrit dans le titre des chantiers ; plusieurs : « MAR, MARC »</span>
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" loading={busy} disabled={busy || !v.name.trim()}>Enregistrer</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={busy}>Annuler</Button>
      </div>
    </form>
  )
}

export default function TechniciansClient({ technicians, users }: { technicians: TechnicianRow[]; users: UserOption[] }) {
  const router = useRouter()
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const linkedUserIds = new Set(technicians.map((t) => t.userId).filter((id): id is string => Boolean(id)))
  const userLabel = (id: string | null) => users.find((u) => u.id === id)?.label

  const send = async (url: string, method: string, payload?: unknown) => {
    setBusy(true)
    setError(null)
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: payload ? JSON.stringify(payload) : undefined })
    const json = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setError(json.error ?? `Erreur ${res.status}`); return false }
    router.refresh()
    return true
  }
  const save = async (id: string | 'new', v: FormValues) => {
    const payload = {
      name: v.name, kind: v.kind, phone: v.phone, userId: v.kind === 'SAV' ? v.userId || null : null, skills: v.skills,
      // Le niveau par compétence remplace l'ancienne « difficulté maximale » de la fiche
      maxDifficulty: null, sector: v.sector, agendaCodes: v.agendaCodes,
    }
    const ok = id === 'new' ? await send('/api/sav/technicians', 'POST', payload) : await send(`/api/sav/technicians/${id}`, 'PATCH', payload)
    if (ok) setEditing(null)
  }

  return (
    <div className="space-y-3">
      {error && <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
      {editing === 'new' ? (
        <TechnicianForm initial={empty} users={users} linkedUserIds={linkedUserIds} onSave={(v) => save('new', v)} onCancel={() => setEditing(null)} busy={busy} />
      ) : (
        <Button type="button" onClick={() => { setError(null); setEditing('new') }}>+ Ajouter un intervenant</Button>
      )}

      {technicians.length === 0 && <p className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">Aucun intervenant pour l&apos;instant.</p>}
      <ul className="space-y-2">
        {technicians.map((t) => (
          <li key={t.id}>
            {editing === t.id ? (
              <TechnicianForm initial={toForm(t)} users={users} linkedUserIds={linkedUserIds} onSave={(v) => save(t.id, v)} onCancel={() => setEditing(null)} busy={busy} />
            ) : (
              <div className={`rounded-xl border border-gray-200 bg-white p-4 shadow-sm ${t.active ? '' : 'opacity-60'}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-gray-900">{t.name}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${KIND_STYLES[t.kind]}`}>{KIND_LABELS[t.kind]}</span>
                      {!t.active && <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-600">Désactivé</span>}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {[
                        t.phone || 'pas de téléphone',
                        t.kind === 'SAV' ? (t.userId ? `compte : ${userLabel(t.userId) ?? 'désactivé'}` : 'sans compte de connexion') : null,
                        `${t.upcoming} intervention${t.upcoming > 1 ? 's' : ''} à venir`,
                      ].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Button type="button" size="sm" variant="secondary" onClick={() => { setError(null); setEditing(t.id) }} disabled={busy}>Modifier</Button>
                    <Button type="button" size="sm" variant="ghost" disabled={busy}
                      onClick={() => send(`/api/sav/technicians/${t.id}`, 'PATCH', { active: !t.active })}>
                      {t.active ? 'Désactiver' : 'Réactiver'}
                    </Button>
                    {t.assigned === 0 && (
                      <Button type="button" size="sm" variant="ghost" disabled={busy}
                        onClick={() => confirm(`Supprimer la fiche de ${t.name} ?`) && send(`/api/sav/technicians/${t.id}`, 'DELETE')}>
                        Supprimer
                      </Button>
                    )}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                  {t.skills.length
                    ? (Object.entries(parseSkillLevels(t.skills, t.maxDifficulty)) as [Skill, number | null][]).map(([key, level]) => (
                      <span key={key} className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-800 ring-1 ring-emerald-200" title={level ? SKILL_LEVEL_LABELS[level] : 'Niveau à noter'}>
                        {SKILLS[key]} {level ? <span className="text-amber-600">{'★'.repeat(level)}</span> : <span className="text-orange-700">· à noter</span>}
                      </span>
                    ))
                    : <span className="text-orange-700">Compétences à renseigner</span>}
                  {t.sector && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-700">📍 {t.sector}</span>}
                  {t.agendaCodes.length > 0 && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-sky-800 ring-1 ring-sky-200">Agenda : {t.agendaCodes.join(', ')}</span>}
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
