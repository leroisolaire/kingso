import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/dal'
import { db } from '@/lib/db/client'
import { suggestClients } from '@/lib/sav/clients'
import { defaultDuration, isCalendarConnected, planningEventLink } from '@/lib/sav/calendar'
import { caseLink } from '@/lib/sav/draft'
import { EVENT_LABELS } from '@/lib/sav/events'
import { formatPhone } from '@/lib/sav/phone'
import { formatAppointment, formatParisDate } from '@/lib/sav/schedule'
import { getSavSettings } from '@/lib/sav/settings'
import { smsPhoneOf } from '@/lib/sav/sms'
import { fillSmsText } from '@/lib/sav/smsText'
import { SAV_TABS } from '@/lib/sav/status'
import { getTemplates } from '@/lib/sav/templates'
import { refreshSavTimers } from '@/lib/sav/timers'
import { kingsoPresence } from '@/lib/sav/presence'
import { getTechnicians } from '@/lib/sav/technicians'
import { getSignedUrls } from '@/lib/storage/attachments'
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
  searchParams: Promise<{ depuis?: string; q?: string }>
}) {
  const { id } = await params
  const { depuis, q } = await searchParams
  // Retour à la recherche ou à l'onglet d'où l'on vient (sinon la liste par défaut)
  const fromTab = SAV_TABS.find((t) => t.key === depuis)
  const query = q?.trim().slice(0, 100)
  const backHref = query ? `/admin/sav?q=${encodeURIComponent(query)}` : fromTab ? `/admin/sav?onglet=${fromTab.key}` : '/admin/sav'
  const backLabel = query ? `Retour à la recherche « ${query} »` : fromTab ? `Retour aux demandes « ${fromTab.label} »` : 'Retour à toutes les demandes'
  await refreshSavTimers().catch(() => 0)
  const user = await getCurrentUser()
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

  const [conversation, templates, assistants, settings, suggestions, calendarConnected, defaultMinutes, technicians, photoUrls] = await Promise.all([
    c.chatSessionToken
      ? db.history.findMany({ where: { sessionToken: c.chatSessionToken }, orderBy: { createdAt: 'asc' }, take: 100 })
      : Promise.resolve([]),
    getTemplates(),
    db.assistant.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    getSavSettings(),
    c.clientId ? Promise.resolve([]) : suggestClients(c).catch(() => []),
    isCalendarConnected().catch(() => false),
    defaultDuration().catch(() => 120),
    getTechnicians(),
    getSignedUrls([...c.techPhotos, ...c.messages.flatMap((m) => m.photos)]).catch(() => ({} as Record<string, string>)),
  ])

  // SMS d'accusé de réception : envoyé, ou dernière tentative en erreur
  const smsSent = c.events.find((e) => e.kind === 'SMS_SENT')
  const lastSms = c.events.find((e) => e.kind === 'SMS_SENT' || e.kind === 'SMS_ERROR')

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
        sms={{
          phone: formatPhone(smsPhoneOf(c)) || null,
          text: fillSmsText(settings.smsText, caseLink(c.accessToken)),
          sent: smsSent ? formatParisDate(smsSent.createdAt, true) : null,
          // Dernière tentative en échec (les événements sont du plus récent au plus ancien)
          error: lastSms?.kind === 'SMS_ERROR' ? lastSms.detail : null,
        }}
        link={caseLink(c.accessToken)}
        templates={templates.map((t) => ({ key: t.key, name: t.name, autoSend: t.autoSend }))}
        assistants={assistants}
        kingso={kingso}
        calendarConnected={calendarConnected}
        technicians={technicians}
        canDelete={user.roles.includes('SUPER_ADMIN')}
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
          appointmentAt: c.appointmentAt ? formatAppointment(c.appointmentAt, c.appointmentMinutes ?? defaultMinutes) : null,
          appointmentMinutes: c.appointmentMinutes ?? defaultMinutes,
          appointmentIso: c.appointmentAt?.toISOString() ?? null,
          planningLink: planningEventLink(c.planningEventId),
          technicianId: c.technicianId,
          techOutcome: c.techOutcome,
          techReport: c.techReport,
          techReportAt: c.techReportAt ? formatParisDate(c.techReportAt, true) : null,
          techReportBy: c.techReportBy,
          techPhotos: c.techPhotos.map((path) => ({ path, url: photoUrls[path] ?? null })),
          messages: c.messages.map((m) => ({
            id: m.id, source: m.source, text: m.text, at: formatParisDate(m.receivedAt, true),
            phone: formatPhone(m.callerPhone), durationSec: m.durationSec,
            photos: m.photos.map((path) => ({ path, url: photoUrls[path] ?? null })), photoNote: m.photoNote,
          })),
          events: c.events.map((e) => ({
            id: e.id, label: EVENT_LABELS[e.kind] ?? e.kind, kind: e.kind, detail: e.detail,
            author: e.author, at: formatParisDate(e.createdAt, true),
          })),
          conversation: conversation.map((h, i) => ({
            id: h.id, user: h.userMessage, kingso: h.assistantMessage, at: formatParisDate(h.createdAt, true),
            // 1er message envoyé par Kingso à partir du message laissé au SAV (le client ne l'a pas écrit)
            fromCase: i === 0 && Boolean(c.clientQuestion) && h.userMessage.trim() === c.clientQuestion!.trim(),
          })),
        }}
      />
      <div className="border-t border-gray-200 pt-4">
        <BackToList href={backHref} label={backLabel} />
      </div>
    </div>
  )
}
