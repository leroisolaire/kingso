import { SLUG_REGEX } from '@/lib/db/queries/assistants'
import type { AssistantInput } from '@/types/assistant'

/** Préfixes déjà utilisés par l'application : interdits comme URL de chat. */
const RESERVED_SLUGS = [
  'admin', 'api', 'c', 'chat', 'faq', 'login', 'logout',
  // fichiers et routes gérés par Next.js
  '_next', 'favicon', 'icon', 'apple-icon', 'robots', 'sitemap', 'manifest',
]

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function stringList(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((v): v is string => typeof v === 'string').map((v) => v.trim()).filter(Boolean))]
    .slice(0, maxItems)
    .map((v) => v.slice(0, maxLength))
}

function idList(value: unknown): string[] {
  return stringList(value, 200, 50)
}

export function parseAssistantInput(body: Record<string, unknown>, isNew: boolean) {
  const errors: Record<string, string> = {}
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

  const input: AssistantInput = {
    slug: str(body.slug).toLowerCase(),
    name: str(body.name).slice(0, 100),
    status: (['DRAFT', 'ACTIVE', 'DISABLED'] as const).find((s) => s === body.status) ?? 'DRAFT',
    audience: body.audience === 'STAFF' ? 'STAFF' : 'CUSTOMER',
    access: body.access === 'PASSWORD' ? 'PASSWORD' : 'PUBLIC',
    accessPassword: str(body.accessPassword) || undefined,
    welcomeMessage: str(body.welcomeMessage).slice(0, 1000),
    startButtons: stringList(body.startButtons, 6, 60),
    suggestedQuestions: stringList(body.suggestedQuestions, 8, 80),
    instructions: str(body.instructions).slice(0, 8000),
    categoryIds: idList(body.categoryIds),
    webSourceIds: idList(body.webSourceIds),
    escalationEnabled: body.escalationEnabled === true,
    escalationEmails: stringList(body.escalationEmails, 10, 150).map((e) => e.toLowerCase()),
    attachmentsEnabled: body.attachmentsEnabled !== false,
    dailyMessageLimit: Math.max(0, Math.min(500, Math.round(Number(body.dailyMessageLimit) || 0))),
  }

  if (!input.name) errors.name = 'Le nom est obligatoire.'
  if (!SLUG_REGEX.test(input.slug)) {
    errors.slug = 'Uniquement des minuscules, chiffres et tirets (ex. : pac-clients).'
  } else if (RESERVED_SLUGS.includes(input.slug)) {
    errors.slug = 'Cette adresse est réservée.'
  }
  if (!input.welcomeMessage) errors.welcomeMessage = 'Le message d\'accueil est obligatoire.'
  if (input.access === 'PASSWORD' && isNew && !input.accessPassword) {
    errors.accessPassword = 'Un mot de passe est requis pour un chat protégé.'
  }
  if (input.accessPassword && input.accessPassword.length < 6) {
    errors.accessPassword = '6 caractères minimum.'
  }
  if (input.escalationEnabled && input.escalationEmails.length === 0) {
    errors.escalationEmails = 'Indiquez au moins une adresse de réception.'
  }
  const invalidEmail = input.escalationEmails.find((e) => !EMAIL_REGEX.test(e))
  if (invalidEmail) errors.escalationEmails = `Adresse invalide : ${invalidEmail}`

  return { input, errors }
}
