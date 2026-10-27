import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db/client'
import { caseLink } from '@/lib/sav/draft'
import { EVENT_LABELS } from '@/lib/sav/events'
import { formatPhone } from '@/lib/sav/phone'
import { formatParisDate } from '@/lib/sav/schedule'
import { getSavSettings } from '@/lib/sav/settings'
import { getTemplates } from '@/lib/sav/templates'
import { refreshSavTimers } from '@/lib/sav/timers'
import CaseView from './CaseView'

export const metadata: Metadata = { title: 'Dossier SAV | Admin' }

export default async function SavCasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
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

  const [conversation, templates, assistants, settings] = await Promise.all([
    c.chatSessionToken
      ? db.history.findMany({ where: { sessionToken: c.chatSessionToken }, orderBy: { createdAt: 'asc' }, take: 100 })
      : Promise.resolve([]),
    getTemplates(),
    db.assistant.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    getSavSettings(),
  ])

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <Link href="/admin/sav" className="text-sm text-gray-500 hover:underline">← Espace SAV</Link>
      <CaseView
        paused={settings.paused}
        link={caseLink(c.accessToken)}
        templates={templates.map((t) => ({ key: t.key, name: t.name, autoSend: t.autoSend }))}
        assistants={assistants}
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
    </div>
  )
}
