import bcrypt from 'bcryptjs'
import { db } from '../client'
import type { Prisma } from '@prisma/client'
import type { Assistant, AssistantInput, AssistantSummary } from '@/types/assistant'

const include = {
  categories: { select: { id: true } },
  webSources: { select: { id: true } },
} satisfies Prisma.AssistantInclude

type AssistantRow = Prisma.AssistantGetPayload<{ include: typeof include }>

function serialize(a: AssistantRow): Assistant {
  const { categories, webSources, accessPassword, createdAt, updatedAt, ...rest } = a
  return {
    ...rest,
    hasPassword: Boolean(accessPassword),
    categoryIds: categories.map((c) => c.id),
    webSourceIds: webSources.map((w) => w.id),
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
  }
}

export const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/

export async function getAllAssistants(): Promise<AssistantSummary[]> {
  const rows = await db.assistant.findMany({
    include: { ...include, _count: { select: { escalations: true } } },
    orderBy: { createdAt: 'asc' },
  })
  // Une conversation = un sessionToken distinct
  const conversations = await db.history.groupBy({
    by: ['assistantId', 'sessionToken'],
    where: { assistantId: { not: null } },
  })
  const countByAssistant = new Map<string, number>()
  for (const c of conversations) {
    countByAssistant.set(c.assistantId!, (countByAssistant.get(c.assistantId!) ?? 0) + 1)
  }
  return rows.map(({ _count, ...row }) => ({
    ...serialize(row),
    conversationCount: countByAssistant.get(row.id) ?? 0,
    escalationCount: _count.escalations,
  }))
}

export async function getAssistantById(id: string): Promise<Assistant | null> {
  const row = await db.assistant.findUnique({ where: { id }, include })
  return row ? serialize(row) : null
}

/** Recherche par slug actuel ; `redirectTo` est renseigné si le slug est une ancienne URL. */
export async function findAssistantBySlug(slug: string) {
  const row = await db.assistant.findUnique({ where: { slug }, include })
  if (row) return { assistant: row, redirectTo: null }
  const old = await db.assistant.findFirst({ where: { previousSlugs: { has: slug } }, select: { slug: true } })
  return { assistant: null, redirectTo: old?.slug ?? null }
}

/** Vérifie qu'aucun autre chat n'utilise déjà ce slug (actuel ou ancien). */
export async function isSlugTaken(slug: string, exceptId?: string): Promise<boolean> {
  const other = await db.assistant.findFirst({
    where: {
      OR: [{ slug }, { previousSlugs: { has: slug } }],
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { id: true },
  })
  return Boolean(other)
}

function relationData(input: AssistantInput) {
  return {
    categories: { set: input.categoryIds.map((id) => ({ id })) },
    webSources: { set: input.webSourceIds.map((id) => ({ id })) },
  }
}

function scalarData(input: AssistantInput) {
  return {
    slug: input.slug,
    name: input.name,
    status: input.status,
    audience: input.audience,
    access: input.access,
    welcomeMessage: input.welcomeMessage,
    startButtons: input.startButtons,
    suggestedQuestions: input.suggestedQuestions,
    instructions: input.instructions,
    escalationEnabled: input.escalationEnabled,
    escalationEmails: input.escalationEmails,
    attachmentsEnabled: input.attachmentsEnabled,
    dailyMessageLimit: input.dailyMessageLimit,
  }
}

export async function createAssistant(input: AssistantInput): Promise<Assistant> {
  const row = await db.assistant.create({
    data: {
      ...scalarData(input),
      accessPassword: input.accessPassword ? await bcrypt.hash(input.accessPassword, 10) : null,
      categories: { connect: input.categoryIds.map((id) => ({ id })) },
      webSources: { connect: input.webSourceIds.map((id) => ({ id })) },
    },
    include,
  })
  return serialize(row)
}

export async function updateAssistant(id: string, input: AssistantInput): Promise<Assistant> {
  const current = await db.assistant.findUniqueOrThrow({ where: { id }, select: { slug: true, previousSlugs: true } })

  // Changement d'URL : l'ancienne est conservée pour rediriger les liens déjà diffusés
  let previousSlugs = current.previousSlugs.filter((s) => s !== input.slug)
  if (current.slug !== input.slug && !previousSlugs.includes(current.slug)) {
    previousSlugs = [...previousSlugs, current.slug]
  }

  const row = await db.assistant.update({
    where: { id },
    data: {
      ...scalarData(input),
      previousSlugs,
      ...(input.accessPassword ? { accessPassword: await bcrypt.hash(input.accessPassword, 10) } : {}),
      ...relationData(input),
    },
    include,
  })
  return serialize(row)
}

export async function duplicateAssistant(id: string): Promise<Assistant> {
  const source = await db.assistant.findUniqueOrThrow({ where: { id }, include })

  let slug = `${source.slug}-copie`
  for (let i = 2; await isSlugTaken(slug); i++) slug = `${source.slug}-copie-${i}`

  const row = await db.assistant.create({
    data: {
      slug,
      name: `${source.name} (copie)`,
      status: 'DRAFT',
      audience: source.audience,
      access: source.access,
      accessPassword: source.accessPassword,
      welcomeMessage: source.welcomeMessage,
      startButtons: source.startButtons,
      suggestedQuestions: source.suggestedQuestions,
      instructions: source.instructions,
      escalationEnabled: source.escalationEnabled,
      escalationEmails: source.escalationEmails,
      attachmentsEnabled: source.attachmentsEnabled,
      dailyMessageLimit: source.dailyMessageLimit,
      categories: { connect: source.categories },
      webSources: { connect: source.webSources },
    },
    include,
  })
  return serialize(row)
}

export async function deleteAssistant(id: string): Promise<void> {
  await db.assistant.delete({ where: { id } })
}

/**
 * Catégories autorisées + toutes leurs descendantes : cocher « Pompes à chaleur »
 * donne accès aux sous-catégories Hitachi, Atlantic… y compris celles créées plus tard.
 */
export async function expandCategoryIds(categoryIds: string[]): Promise<string[]> {
  if (categoryIds.length === 0) return []
  const all = await db.category.findMany({ select: { id: true, parentId: true } })
  const result = new Set(categoryIds)
  let added = true
  while (added) {
    added = false
    for (const c of all) {
      if (c.parentId && result.has(c.parentId) && !result.has(c.id)) {
        result.add(c.id)
        added = true
      }
    }
  }
  return [...result]
}

/** Noms des chats qui ont accès à un document donné (affiché dans la fiche document). */
export async function getAssistantsUsingCategory(
  categoryId: string | null,
  type: 'PUBLIC' | 'INTERNAL' | 'FRANCHISE',
): Promise<{ id: string; name: string }[]> {
  if (!categoryId) return []
  const assistants = await db.assistant.findMany({
    where: { status: { not: 'DISABLED' } },
    select: { id: true, name: true, audience: true, categories: { select: { id: true } } },
  })
  const result: { id: string; name: string }[] = []
  for (const a of assistants) {
    if (a.audience === 'CUSTOMER' && type !== 'PUBLIC') continue
    const allowed = await expandCategoryIds(a.categories.map((c) => c.id))
    if (allowed.includes(categoryId)) result.push({ id: a.id, name: a.name })
  }
  return result
}
