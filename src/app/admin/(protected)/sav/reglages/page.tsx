import type { Metadata } from 'next'
import Link from 'next/link'
import { db } from '@/lib/db/client'
import { isEmailConfigured } from '@/lib/email/brevo'
import { DEFAULT_DURATION_MINUTES, getCalendarState } from '@/lib/sav/calendar'
import { getClientFileState } from '@/lib/sav/clientSync'
import { EXPECTED_MAILBOX, getGmailState, isOAuthConfigured } from '@/lib/sav/gmail'
import { getSavSettings } from '@/lib/sav/settings'
import { getTemplates } from '@/lib/sav/templates'
import CalendarCard from './CalendarCard'
import SettingsClient from './SettingsClient'

export const metadata: Metadata = { title: 'Réglages SAV | Admin' }

export default async function SavSettingsPage({ searchParams }: { searchParams: Promise<{ gmail?: string; agenda?: string }> }) {
  const { gmail: gmailMessage, agenda: agendaMessage } = await searchParams
  const [settings, templates, assistants, clientFile, clientCount, gmail, calendar] = await Promise.all([
    getSavSettings(),
    getTemplates(),
    db.assistant.findMany({ select: { slug: true, name: true }, orderBy: { name: 'asc' } }),
    getClientFileState(),
    db.savClient.count(),
    getGmailState(),
    getCalendarState(),
  ])
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link href="/admin/sav" className="text-sm text-gray-500 hover:underline">← Espace SAV</Link>
      <h1 className="text-2xl font-bold text-gray-900">Réglages SAV</h1>
      {!isEmailConfigured() && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">Brevo n&apos;est pas configuré : aucun email ne peut partir.</p>
      )}
      <SettingsClient settings={settings} templates={templates} assistants={assistants} clientFile={{ ...clientFile, count: clientCount }}
        mailbox={{
          expected: EXPECTED_MAILBOX,
          configured: isOAuthConfigured(),
          connected: Boolean(gmail.token),
          email: gmail.email ?? null,
          connectedAt: gmail.connectedAt ?? null,
          connectedBy: gmail.connectedBy ?? null,
          checkedAt: gmail.checkedAt ?? null,
          lastImportAt: gmail.lastImportAt ?? null,
          imported: gmail.imported ?? 0,
          error: gmail.error ?? null,
          instant: Boolean(gmail.watchExpiration && new Date(gmail.watchExpiration) > new Date()),
          message: gmailMessage ?? null,
        }}
      />
      <CalendarCard
        c={{
          configured: isOAuthConfigured(),
          connected: Boolean(calendar.token && calendar.calendarId),
          email: calendar.email ?? null,
          calendarId: calendar.calendarId ?? null,
          calendarName: calendar.calendarName ?? null,
          durationMinutes: calendar.durationMinutes ?? DEFAULT_DURATION_MINUTES,
          connectedAt: calendar.connectedAt ?? null,
          connectedBy: calendar.connectedBy ?? null,
          message: agendaMessage ?? null,
        }}
      />
    </div>
  )
}
