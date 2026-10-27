import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db/client'
import { suggestClients } from '@/lib/sav/clients'
import { caseLink } from '@/lib/sav/draft'
import { EVENT_LABELS } from '@/lib/sav/events'
import { formatPhone } from '@/lib/sav/phone'
import { formatParisDate } from '@/lib/sav/schedule'
import { getSavSettings } from '@/lib/sav/settings'
import { SAV_TABS } from '@/lib/sav/status'
import { getTemplates } from '@/lib/sav/templates'
import { refreshSavTimers } from '@/lib/sav/timers'
import { kingsoPresence } from '@/lib/sav/presence'
import AutoRefresh from '../AutoRefresh'
import CaseView from './CaseView'

export const metadata: Metadata = { title: 'Dossier SAV | Admin' }

function BackToList({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-800 shadow-sm hover:bg-gray-50"
    >
      <span aria-hidden="true" className="text-base">←</span> {label}
    </Link>
  )
}

export default async function SavCasePage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ depuis?: string }>
}) {
  const { id } = await params
  const { depuis } = await searchParams
  // Retour à l'onglet d'où l'on vient (sinon la liste par défaut)
  const fromTab = SAV_TABS.find((t) => t.key === depuis)
  const backHref = fromTab ? `/admin/sav?onglet=${fromTab.key}` : '/admin/sav'
  const backLabel = fromTab ? `Retour aux demandes « ${fromTab.label} »` : 'Retour à toutes les demandes'
  await refreshSavTimers().catch(() => 0)
  const c = await db.savCase.findUnique({
    where: { id },
    include: {
      messages: { orderBy: { receivedAt: 'asc' } },
      events: { orderBy: { createdAt: 'desc' } },
      client: true,
      assistant: { select: { id: true, name: true, slug: true } },
    },
  })
  if (!c) notFound()

  const [conversation, templates, assistants, settings, suggestions] = await Promise.all([
    c.chatSessionToken
      ? db.history.findMany({ where: { sessionToken: c.chatSessionToken }, orderBy: { createdAt: 'asc' }, take: 100 })
      : Promise.resolve([]),
    getTemplates(),
    db.assistant.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    getSavSettings(),
    c.clientId ? Promise.resolve([]) : suggestClients(c).catch(() => []),
  ])

  // Échange avec Kingso : présence en direct et résumé (lien ouvert, messages, départ)
  const presence = kingsoPresence({
    lastSeenAt: c.lastSeenAt,
    linkOpenedAt: c.linkOpenedAt,
    messages: conversation.length,
    resolvedByClient: c.status === 'RESOLVED' && c.events.some((e) => e.kind === 'RESOLVED_BY_CLIENT'),
  })
  const kingso = presence && {
    tone: presence.tone,
    label: presence.label,
    detail: [
      c.linkOpenedAt ? `Lien ouvert le ${formatParisDate(c.linkOpenedAt, true)}` : null,
      conversation.length ? `${conversation.length} message(s) échangé(s), dernier le ${formatParisDate(conversation[conversation.length - 1].createdAt, true)}` : 'aucun message écrit',
      c.lastSeenAt ? `dernière présence le ${formatParisDate(c.lastSeenAt, true)}` : null,
    ].filter(Boolean).join(' · '),
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <AutoRefresh />
      <BackToList href={backHref} label={backLabel} />
      <CaseView
        paused={settings.paused}
        link={caseLink(c.accessToken)}
        templates={templates.map((t) => ({ key: t.key, name: t.name, autoSend: t.autoSend }))}
        assistants={assistants}
        kingso={kingso}
        suggestions={suggestions.map((s) => ({ ...s, phones: s.phones.map(formatPhone) }))}
        data={{
          id: c.id,
          number: c.number,
          source: c.source,
          status: c.status,
          category: c.category,
          urgent: c.urgent,
          urgentReason: c.urgentReason ?? '',
          noHeating: c.noHeating,
          receivedAt: formatParisDate(c.receivedAt, true),
          phone: formatPhone(c.phoneKey),
          callbackPhone: formatPhone(c.callbackPhone),
          customerName: c.customerName ?? '',
          email: c.email ?? '',
          address: c.address ?? '',
          postalCode: c.postalCode ?? '',
          city: c.city ?? '',
          equipment: c.equipment ?? '',
          clientMatch: c.clientMatch ?? '',
          clientIdentified: Boolean(c.clientId),
          contract: c.client?.contract ?? '',
          summary: c.summary,
          errorCode: c.errorCode ?? '',
          assistantId: c.assistant?.id ?? '',
          emailTemplate: c.emailTemplate,
          emailSubject: c.emailSubject ?? '',
          emailBody: c.emailBody ?? '',
          emailPlanned: c.emailScheduledAt ? formatParisDate(c.emailScheduledAt, true) : null,
          emailSentAt: c.emailSentAt ? formatParisDate(c.emailSentAt, true) : null,
          emailInFuture: Boolean(c.emailSentAt && c.emailSentAt > new Date()),
          emailError: c.emailError,
          appointmentAt: c.appointmentAt ? formatParisDate(c.appointmentAt, true) : null,
          messages: c.messages.map((m) => ({
            id: m.id, source: m.source, text: m.text, at: formatParisDate(m.receivedAt, true),
            phone: formatPhone(m.callerPhone), durationSec: m.durationSec,
          })),
          events: c.events.map((e) => ({
            id: e.id, label: EVENT_LABELS[e.kind] ?? e.kind, kind: e.kind, detail: e.detail,
            author: e.author, at: formatParisDate(e.createdAt, true),
          })),
          conversation: conversation.map((h) => ({ id: h.id, user: h.userMessage, kingso: h.assistantMessage, at: formatParisDate(h.createdAt, true) })),
        }}
      />
      <div className="border-t border-gray-200 pt-4">
        <BackToList href={backHref} label={backLabel} />
      </div>
    </div>
  )
}
