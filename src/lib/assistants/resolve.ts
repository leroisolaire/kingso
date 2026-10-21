import 'server-only'
import { cache } from 'react'
import { findAssistantBySlug } from '@/lib/db/queries/assistants'
import { getSession } from '@/lib/auth/dal'
import { hasAssistantAccess } from '@/lib/auth/assistantAccess'

export type ResolvedAssistant = NonNullable<Awaited<ReturnType<typeof findAssistantBySlug>>['assistant']>

export type ResolveResult =
  | { kind: 'ok'; assistant: ResolvedAssistant; isPreview: boolean }
  | { kind: 'redirect'; slug: string }
  | { kind: 'locked'; assistant: ResolvedAssistant }
  | { kind: 'not-found' }

/**
 * Détermine si un visiteur peut utiliser le chat {slug} :
 * - ACTIVE : ouvert à tous (sous réserve du mot de passe éventuel)
 * - DRAFT / DISABLED : visible uniquement par un admin connecté (mode aperçu)
 */
export const resolveAssistant = cache(async (slug: string): Promise<ResolveResult> => {
  const { assistant, redirectTo } = await findAssistantBySlug(slug)
  if (!assistant) return redirectTo ? { kind: 'redirect', slug: redirectTo } : { kind: 'not-found' }

  const isAdmin = Boolean(await getSession())
  if (assistant.status !== 'ACTIVE' && !isAdmin) return { kind: 'not-found' }

  if (assistant.access === 'PASSWORD' && !isAdmin && !(await hasAssistantAccess(assistant.id))) {
    return { kind: 'locked', assistant }
  }

  return { kind: 'ok', assistant, isPreview: assistant.status !== 'ACTIVE' || isAdmin }
})
