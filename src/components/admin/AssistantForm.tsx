'use client'

import { useState, type ReactNode } from 'react'
import { useOrigin } from '@/hooks/useOrigin'
import Input from '@/components/ui/Input'
import Textarea from '@/components/ui/Textarea'
import Button from '@/components/ui/Button'
import type { Assistant, AssistantInput } from '@/types/assistant'
import type { Category } from '@/types/category'

export interface WebSourceOption {
  id: string
  name: string
  url: string
}

type SubmitResult = { ok: true } | { ok: false; error: string; fields?: Record<string, string> }

interface AssistantFormProps {
  assistant?: Assistant
  categories: Category[]
  webSources: WebSourceOption[]
  onSubmit: (data: AssistantInput) => Promise<SubmitResult>
  onCancel: () => void
}

const lines = (text: string) => text.split('\n').map((l) => l.trim()).filter(Boolean)

function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="text-base font-semibold text-gray-900">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-gray-500">{description}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  )
}

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-amber-500" />
      <span>
        <span className="block text-sm font-medium text-gray-700">{label}</span>
        {hint && <span className="block text-xs text-gray-500">{hint}</span>}
      </span>
    </label>
  )
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-xs text-red-500">{message}</p> : null
}

const selectClass = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500'

export default function AssistantForm({ assistant, categories, webSources, onSubmit, onCancel }: AssistantFormProps) {
  const isNew = !assistant
  const [name, setName] = useState(assistant?.name ?? '')
  const [slug, setSlug] = useState(assistant?.slug ?? '')
  const [slugEdited, setSlugEdited] = useState(!isNew)
  const [status, setStatus] = useState(assistant?.status ?? 'DRAFT')
  const [audience, setAudience] = useState(assistant?.audience ?? 'CUSTOMER')
  const [access, setAccess] = useState(assistant?.access ?? 'PUBLIC')
  const [accessPassword, setAccessPassword] = useState('')
  const [welcomeMessage, setWelcomeMessage] = useState(assistant?.welcomeMessage ?? '')
  const [startButtons, setStartButtons] = useState((assistant?.startButtons ?? []).join('\n'))
  const [suggestedQuestions, setSuggestedQuestions] = useState((assistant?.suggestedQuestions ?? []).join('\n'))
  const [instructions, setInstructions] = useState(assistant?.instructions ?? '')
  const [categoryIds, setCategoryIds] = useState<string[]>(assistant?.categoryIds ?? [])
  const [webSourceIds, setWebSourceIds] = useState<string[]>(assistant?.webSourceIds ?? [])
  const [escalationEnabled, setEscalationEnabled] = useState(assistant?.escalationEnabled ?? false)
  const [escalationEmails, setEscalationEmails] = useState((assistant?.escalationEmails ?? []).join(', '))
  const [attachmentsEnabled, setAttachmentsEnabled] = useState(assistant?.attachmentsEnabled ?? true)
  const [dailyMessageLimit, setDailyMessageLimit] = useState(String(assistant?.dailyMessageLimit ?? 30))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fields, setFields] = useState<Record<string, string>>({})
  const origin = useOrigin()

  const parents = categories.filter((c) => !c.parentId)
  const childrenOf = (id: string) => categories.filter((c) => c.parentId === id)

  const toggleId = (list: string[], id: string, on: boolean) => (on ? [...new Set([...list, id])] : list.filter((x) => x !== id))

  const handleName = (value: string) => {
    setName(value)
    if (!slugEdited) setSlug(slugify(value))
  }

  const slugChanged = assistant && slug !== assistant.slug

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setFields({})
    const result = await onSubmit({
      name, slug, status, audience, access,
      accessPassword: accessPassword || undefined,
      welcomeMessage,
      startButtons: lines(startButtons),
      suggestedQuestions: lines(suggestedQuestions),
      instructions,
      categoryIds,
      webSourceIds,
      escalationEnabled,
      escalationEmails: escalationEmails.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean),
      attachmentsEnabled,
      dailyMessageLimit: Number(dailyMessageLimit) || 0,
    })
    setLoading(false)
    if (!result.ok) {
      setError(result.error)
      setFields(result.fields ?? {})
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <Section title="Général">
        <Input label="Nom du chat" value={name} onChange={(e) => handleName(e.target.value)} placeholder="Ex. : Kingso PAC clients" error={fields.name} required />

        <div className="flex flex-col gap-1">
          <label htmlFor="slug" className="text-sm font-medium text-gray-700">Adresse (URL)</label>
          <div className="flex items-center overflow-hidden rounded-lg border border-gray-300 focus-within:ring-2 focus-within:ring-amber-500">
            <span className="shrink-0 bg-gray-50 px-3 py-2 text-sm text-gray-500">{origin ? `${origin.replace(/^https?:\/\//, '')}` : ''}/</span>
            <input
              id="slug"
              value={slug}
              onChange={(e) => { setSlug(e.target.value.toLowerCase()); setSlugEdited(true) }}
              className="min-w-0 flex-1 px-3 py-2 text-sm text-gray-900 outline-none"
              placeholder="pac"
              required
            />
          </div>
          <FieldError message={fields.slug} />
          {slugChanged && (
            <p className="text-xs text-amber-700">
              ⚠ Les liens déjà envoyés avec /{assistant.slug} seront redirigés automatiquement vers la nouvelle adresse.
            </p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Statut</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className={selectClass}>
              <option value="DRAFT">Brouillon (aperçu admin uniquement)</option>
              <option value="ACTIVE">Actif (lien en ligne)</option>
              <option value="DISABLED">Désactivé</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Public visé</label>
            <select value={audience} onChange={(e) => setAudience(e.target.value as typeof audience)} className={selectClass}>
              <option value="CUSTOMER">Clients (vouvoiement, documents publics)</option>
              <option value="STAFF">Collaborateurs (tous documents)</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Accès</label>
            <select value={access} onChange={(e) => setAccess(e.target.value as typeof access)} className={selectClass}>
              <option value="PUBLIC">Public (lien seul)</option>
              <option value="PASSWORD">Protégé par mot de passe</option>
            </select>
          </div>
        </div>

        {audience === 'STAFF' && access === 'PUBLIC' && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            Attention : un chat « Collaborateurs » lit les documents internes. Avec un accès public, toute personne ayant le lien pourrait y accéder. Choisissez « Protégé par mot de passe ».
          </p>
        )}

        {access === 'PASSWORD' && (
          <Input
            label={assistant?.hasPassword ? 'Nouveau mot de passe (laisser vide pour ne pas changer)' : 'Mot de passe'}
            type="password"
            value={accessPassword}
            onChange={(e) => setAccessPassword(e.target.value)}
            error={fields.accessPassword}
            autoComplete="new-password"
          />
        )}
      </Section>

      <Section title="Accueil" description="Ce que voit la personne en ouvrant le chat.">
        <Textarea label="Message d'accueil" value={welcomeMessage} onChange={(e) => setWelcomeMessage(e.target.value)} rows={3} placeholder="Bonjour ! Je suis Kingso…" required />
        <FieldError message={fields.welcomeMessage} />
        <Textarea
          label="Boutons de démarrage (un par ligne, 6 max)"
          value={startButtons}
          onChange={(e) => setStartButtons(e.target.value)}
          rows={3}
          placeholder={'Ma pompe à chaleur est une Hitachi\nMa pompe à chaleur est une Atlantic\nJe ne connais pas la marque'}
        />
        <p className="-mt-2 text-xs text-gray-500">Gros boutons affichés avant le premier message. Un clic envoie le texte du bouton.</p>
        <Textarea
          label="Questions suggérées (une par ligne, 8 max)"
          value={suggestedQuestions}
          onChange={(e) => setSuggestedQuestions(e.target.value)}
          rows={4}
          placeholder={'Mettre en route ma PAC\nJ\'ai un code erreur\nJe n\'ai plus de chauffage'}
        />
        <p className="-mt-2 text-xs text-gray-500">Raccourcis affichés au-dessus de la zone de saisie pendant les premiers échanges.</p>
      </Section>

      <Section
        title="Consignes à Kingso"
        description="Ton, sujets, étapes à suivre… Les règles de base (répondre uniquement depuis les documents, sécurité, pas d'invention) s'appliquent toujours et ne peuvent pas être désactivées ici."
      >
        <Textarea
          label="Consignes spécifiques"
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          rows={8}
          placeholder={'Ex. : Tu aides les clients de Le Roi Solaire équipés d\'une pompe à chaleur (Hitachi ou Atlantic).\nCommence par identifier la marque…'}
        />
      </Section>

      <Section
        title="Documents accessibles"
        description={audience === 'CUSTOMER'
          ? 'Chat client : seuls les documents « Public » de ces catégories sont utilisés. Les documents internes ne le sont jamais.'
          : 'Chat collaborateurs : tous les documents de ces catégories sont utilisés, y compris internes.'}
      >
        {parents.length === 0 && <p className="text-sm text-gray-500">Aucune catégorie. Créez-en dans « Catégories ».</p>}
        <div className="space-y-3">
          {parents.map((parent) => {
            const parentChecked = categoryIds.includes(parent.id)
            const subs = childrenOf(parent.id)
            return (
              <div key={parent.id} className="rounded-lg border border-gray-100 p-3">
                <Toggle
                  checked={parentChecked}
                  onChange={(on) => setCategoryIds((ids) => toggleId(ids, parent.id, on))}
                  label={parent.name}
                  hint={subs.length > 0 ? 'Inclut toutes ses sous-catégories, y compris celles créées plus tard' : undefined}
                />
                {subs.length > 0 && (
                  <div className="mt-2 space-y-2 pl-7">
                    {subs.map((sub) => (
                      <label key={sub.id} className={`flex items-center gap-3 ${parentChecked ? 'opacity-50' : 'cursor-pointer'}`}>
                        <input
                          type="checkbox"
                          disabled={parentChecked}
                          checked={parentChecked || categoryIds.includes(sub.id)}
                          onChange={(e) => setCategoryIds((ids) => toggleId(ids, sub.id, e.target.checked))}
                          className="h-4 w-4 rounded border-gray-300 accent-amber-500"
                        />
                        <span className="text-sm text-gray-700">{sub.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {webSources.length > 0 && (
          <div className="border-t border-gray-100 pt-4">
            <p className="mb-2 text-sm font-medium text-gray-700">Sites web crawlés</p>
            <div className="space-y-2">
              {webSources.map((w) => (
                <Toggle
                  key={w.id}
                  checked={webSourceIds.includes(w.id)}
                  onChange={(on) => setWebSourceIds((ids) => toggleId(ids, w.id, on))}
                  label={w.name}
                  hint={w.url}
                />
              ))}
            </div>
          </div>
        )}
      </Section>

      <Section title="Demande SAV" description="Kingso propose le formulaire seulement quand c'est utile (dépannage sans succès, danger, information absente, ou demande explicite).">
        <Toggle checked={escalationEnabled} onChange={setEscalationEnabled} label="Permettre de transmettre une demande au SAV" />
        {escalationEnabled && (
          <>
            <Input
              label="Email(s) de réception des demandes"
              value={escalationEmails}
              onChange={(e) => setEscalationEmails(e.target.value)}
              placeholder="lead@leroisolaire.fr, sav@leroisolaire.fr"
              error={fields.escalationEmails}
            />
            <p className="-mt-2 text-xs text-gray-500">Séparez plusieurs adresses par des virgules.</p>
          </>
        )}
      </Section>

      <Section title="Options">
        <Toggle checked={attachmentsEnabled} onChange={setAttachmentsEnabled} label="Autoriser l'envoi de photos" hint="Appareil photo ou galerie — utile pour un code erreur ou une étiquette" />
        <div className="max-w-xs">
          <Input
            label="Messages max par visiteur et par jour"
            type="number"
            min={0}
            max={500}
            value={dailyMessageLimit}
            onChange={(e) => setDailyMessageLimit(e.target.value)}
          />
          <p className="mt-1 text-xs text-gray-500">0 = pas de limite. Protège contre les abus et les coûts.</p>
        </div>
      </Section>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="sticky bottom-0 -mx-6 flex justify-end gap-3 border-t border-gray-200 bg-gray-50/95 px-6 py-4 backdrop-blur lg:-mx-8 lg:px-8">
        <Button type="button" variant="secondary" onClick={onCancel}>Annuler</Button>
        <Button type="submit" loading={loading}>{isNew ? 'Créer le chat' : 'Enregistrer'}</Button>
      </div>
    </form>
  )
}
