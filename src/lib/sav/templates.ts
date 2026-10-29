import 'server-only'
import { db } from '@/lib/db/client'
import { escapeHtml } from '@/lib/email/brevo'

// Modèles d'email au client, par cas. Zones remplies automatiquement :
//   {{salutation}} « Bonjour Madame Martin, » ou « Bonjour, »
//   {{date}}       date du message (« 23 octobre »)
//   {{probleme}}   le problème signalé (« l'erreur 83 sur votre pompe à chaleur »)
//   {{machine}}    l'équipement du client
//   {{explication}} (Kingso peut aider) quelques phrases rédigées par Kingso à partir de la documentation
//   {{lien}}       le lien personnel vers Kingso
//   {{signature}}  « L'équipe SAV Le Roi Solaire »

export const TEMPLATE_KEYS = ['SELF_HELP', 'FOLLOW_UP', 'INTERVENTION', 'ADMIN', 'OTHER_PRODUCT'] as const
export type TemplateKey = (typeof TEMPLATE_KEYS)[number]

export const TEMPLATE_LABELS: Record<TemplateKey, string> = {
  SELF_HELP: 'Kingso peut aider',
  FOLLOW_UP: 'Relance (dossier déjà ouvert)',
  INTERVENTION: 'Intervention nécessaire',
  ADMIN: 'Administratif (entretien, contrat)',
  OTHER_PRODUCT: 'Autre produit',
}

const DEFAULTS: Record<TemplateKey, { subject: string; body: string }> = {
  SELF_HELP: {
    subject: 'Votre demande SAV du {{date}}',
    body: `{{salutation}}

Nous avons bien reçu votre message du {{date}} concernant {{probleme}}.

{{explication}}

Kingso, l'assistant de Le Roi Solaire, peut vous guider pas à pas pour résoudre ce problème :
{{lien}}

{{signature}}`,
  },
  FOLLOW_UP: {
    subject: 'Votre demande SAV : bien reçue',
    body: `{{salutation}}

Nous avons bien reçu vos messages concernant {{probleme}}. Votre demande est suivie en priorité par notre équipe SAV.

Vous pouvez compléter votre dossier (photos, précisions) avec Kingso, notre assistant :
{{lien}}

{{signature}}`,
  },
  INTERVENTION: {
    subject: 'Votre demande SAV du {{date}}',
    body: `{{salutation}}

Nous avons bien reçu votre message du {{date}} concernant {{probleme}}. Votre demande est enregistrée : notre équipe SAV revient vers vous pour organiser l'intervention.

Pour nous aider à la préparer, vous pouvez compléter votre dossier (photos, précisions) avec Kingso, notre assistant :
{{lien}}

{{signature}}`,
  },
  ADMIN: {
    subject: 'Votre demande du {{date}}',
    body: `{{salutation}}

Nous avons bien reçu votre message du {{date}} concernant {{probleme}}. Votre demande est enregistrée et sera traitée par notre équipe.

Pour nous aider à la traiter, vous pouvez compléter votre dossier (photos, précisions) avec Kingso, notre assistant :
{{lien}}

{{signature}}`,
  },
  OTHER_PRODUCT: {
    subject: 'Votre demande SAV du {{date}}',
    body: `{{salutation}}

Nous avons bien reçu votre message du {{date}} concernant {{probleme}}. Votre demande est enregistrée et sera traitée par notre équipe.

Pour nous aider à la traiter, vous pouvez compléter votre dossier (photos, précisions) avec Kingso, notre assistant :
{{lien}}

{{signature}}`,
  },
}

export interface EmailTemplate {
  key: TemplateKey
  name: string
  subject: string
  body: string
  autoSend: boolean
}

/** Modèles (créés avec le texte par défaut s'ils n'existent pas encore). */
export async function getTemplates(): Promise<EmailTemplate[]> {
  const rows = await db.savEmailTemplate.findMany()
  const missing = TEMPLATE_KEYS.filter((k) => !rows.some((r) => r.key === k))
  if (missing.length) {
    await db.savEmailTemplate.createMany({
      data: missing.map((key) => ({ key, name: TEMPLATE_LABELS[key], ...DEFAULTS[key] })),
      skipDuplicates: true,
    })
    return getTemplates()
  }
  return TEMPLATE_KEYS.map((key) => {
    const r = rows.find((row) => row.key === key)!
    return { key, name: TEMPLATE_LABELS[key], subject: r.subject, body: r.body, autoSend: r.autoSend }
  })
}

export async function getTemplate(key: TemplateKey): Promise<EmailTemplate> {
  return (await getTemplates()).find((t) => t.key === key)!
}

export function fillTemplate(text: string, values: Record<string, string>): string {
  return text
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (_, name: string) => values[name] ?? '')
    // Zone vide (ex. pas d'explication) : pas de grand blanc dans l'email
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Corps texte → HTML : paragraphes, et le lien personnel en bouton. */
export function emailHtml(body: string, link: string | null, buttonLabel = 'Résoudre mon problème avec Kingso'): string {
  const paragraphs = escapeHtml(body)
    .split(/\n{2,}/)
    .map((p) => {
      if (link && p.includes(escapeHtml(link))) {
        const [before] = p.split(escapeHtml(link))
        return `${before.trim() ? `<p style="margin:0 0 12px">${before.trim().replace(/\n/g, '<br>')}</p>` : ''}
          <p style="margin:0 0 20px"><a href="${escapeHtml(link)}" style="display:inline-block;background:#e73e11;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:24px">${escapeHtml(buttonLabel)}</a></p>`
      }
      return `<p style="margin:0 0 14px">${p.replace(/\n/g, '<br>')}</p>`
    })
    .join('')
  return `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#222;max-width:600px">${paragraphs}</div>`
}
