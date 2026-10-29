import 'server-only'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db/client'
import { CHAT_REQUEST_DETAIL } from './chatRequests'
import { EVENT_LABELS } from './events'

// Cloche du back-office : les événements des dossiers qui demandent l'attention de l'équipe, tirés de l'historique
// des dossiers. Ce qui a déjà été vu est retenu par utilisateur (date de la dernière ouverture de la cloche).

const WINDOW_DAYS = 14
const MAX_ITEMS = 30

// Tout le SAV (super admin, SAV) : nouveaux dossiers, relances, demandes des chats, problèmes et planning
const SAV_KINDS = [
  'RECEIVED', 'FOLLOW_UP', 'CALLBACK_REQUESTED', 'CLIENT_PHOTOS', 'CLIENT_INFO', 'RESOLVED_BY_CLIENT', 'EMAIL_ERROR', 'SMS_ERROR',
  'CALL_INTERVENTION', 'PLANNING_REMOVED', 'PLANNING_PULLED', 'PLANNING_ERROR', 'TECH_REPORT_DUE', 'TECH_REPORT', 'TECH_REPORT_EDITED',
]
// Planning : interventions à planifier et rendez-vous qui bougent
const PLANNING_KINDS = ['CLIENT_PHOTOS', 'CLIENT_INFO', 'CALL_INTERVENTION', 'PLANNING_REMOVED', 'PLANNING_PULLED', 'PLANNING_ERROR', 'TECH_REPORT_DUE', 'TECH_REPORT', 'TECH_REPORT_EDITED']
// Technicien : ses rendez-vous seulement
const TECHNICIAN_KINDS = ['TECH_ASSIGNED', 'SCHEDULED', 'PLANNING_PULLED', 'PLANNING_REMOVED', 'TECH_REPORT_DUE']

const ICONS: Record<string, string> = {
  CLIENT_PHOTOS: '📷', CLIENT_INFO: '💬',
  RECEIVED: '☎', FOLLOW_UP: '↻', CALLBACK_REQUESTED: '💬', RESOLVED_BY_CLIENT: '✅', EMAIL_ERROR: '⚠', SMS_ERROR: '⚠',
  CALL_INTERVENTION: '🔧', PLANNING_REMOVED: '📅', PLANNING_PULLED: '📅', PLANNING_ERROR: '⚠', TECH_REPORT_DUE: '🛠',
  TECH_REPORT: '🛠', TECH_REPORT_EDITED: '🛠', TECH_ASSIGNED: '👷', SCHEDULED: '📅',
}

export interface NotificationItem {
  id: string
  icon: string
  title: string
  detail: string | null
  caseId: string
  caseLabel: string
  createdAt: string
  unread: boolean
}

interface Viewer { id: string; name: string | null; email: string; roles: readonly string[] }

const seenKey = (userId: string) => `notifications-seen:${userId}`

async function seenAt(userId: string): Promise<Date> {
  const row = await db.appSetting.findUnique({ where: { key: seenKey(userId) } })
  const at = (row?.value as { at?: string } | null)?.at
  return at ? new Date(at) : new Date(0)
}

/** La cloche a été ouverte : tout ce qui est arrivé jusqu'ici est vu. */
export async function markNotificationsSeen(userId: string) {
  const value = { at: new Date().toISOString() }
  await db.appSetting.upsert({ where: { key: seenKey(userId) }, create: { key: seenKey(userId), value }, update: { value } })
}

function viewerWhere(viewer: Viewer): Prisma.SavEventWhereInput {
  const { roles } = viewer
  const or: Prisma.SavEventWhereInput[] = []
  if (roles.includes('SUPER_ADMIN') || roles.includes('SAV')) or.push({ kind: { in: SAV_KINDS } })
  else if (roles.includes('PLANNING')) or.push({ kind: { in: PLANNING_KINDS } })
  if (roles.includes('TECHNICIAN')) or.push({ kind: { in: TECHNICIAN_KINDS }, case: { technician: { userId: viewer.id } } })
  return {
    createdAt: { gte: new Date(Date.now() - WINDOW_DAYS * 24 * 3600_000) },
    AND: [
      { OR: or.length ? or : [{ id: '' }] },
      // Ses propres actions ne sont pas des nouvelles (sans auteur = action de Kingso ou du client)
      { OR: [{ author: null }, { author: { notIn: [viewer.name, viewer.email].filter((a): a is string => Boolean(a)) } }] },
    ],
  }
}

function titleFor(kind: string, detail: string | null, source: string): string {
  if (kind === 'RECEIVED') return source === 'MANUAL' ? 'Nouveau dossier saisi' : 'Nouveau message du répondeur'
  if (kind === 'CALLBACK_REQUESTED') return detail === CHAT_REQUEST_DETAIL ? 'Nouvelle demande depuis un chat' : 'Le client demande à être rappelé'
  return EVENT_LABELS[kind] ?? kind
}

export async function getNotifications(viewer: Viewer): Promise<{ unread: number; items: NotificationItem[] }> {
  const where = viewerWhere(viewer)
  const seen = await seenAt(viewer.id)
  const [events, unread] = await Promise.all([
    db.savEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: MAX_ITEMS,
      include: { case: { select: { number: true, customerName: true, city: true, source: true } } },
    }),
    db.savEvent.count({ where: { AND: [where, { createdAt: { gt: seen } }] } }),
  ])
  return {
    unread,
    items: events.map((e) => ({
      id: e.id,
      icon: ICONS[e.kind] ?? '•',
      title: titleFor(e.kind, e.detail, e.case.source),
      detail: e.kind === 'CALLBACK_REQUESTED' && e.detail === CHAT_REQUEST_DETAIL ? null : e.detail,
      caseId: e.caseId,
      caseLabel: `n° ${e.case.number}${e.case.customerName ? ` · ${e.case.customerName}` : ''}${e.case.city ? ` · ${e.case.city}` : ''}`,
      createdAt: e.createdAt.toISOString(),
      unread: e.createdAt > seen,
    })),
  }
}
