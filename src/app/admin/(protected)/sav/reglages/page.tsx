import type { Metadata } from 'next'
import Link from 'next/link'
import { db } from '@/lib/db/client'
import { isEmailConfigured } from '@/lib/email/brevo'
import { getClientFileState } from '@/lib/sav/clientSync'
import { getSavSettings } from '@/lib/sav/settings'
import { getTemplates } from '@/lib/sav/templates'
import SettingsClient from './SettingsClient'

export const metadata: Metadata = { title: 'Réglages SAV | Admin' }

export default async function SavSettingsPage() {
  const [settings, templates, assistants, clientFile, clientCount] = await Promise.all([
    getSavSettings(),
    getTemplates(),
    db.assistant.findMany({ select: { slug: true, name: true }, orderBy: { name: 'asc' } }),
    getClientFileState(),
    db.savClient.count(),
  ])
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link href="/admin/sav" className="text-sm text-gray-500 hover:underline">← Espace SAV</Link>
      <h1 className="text-2xl font-bold text-gray-900">Réglages SAV</h1>
      {!isEmailConfigured() && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">Brevo n&apos;est pas configuré : aucun email ne peut partir.</p>
      )}
      <SettingsClient settings={settings} templates={templates} assistants={assistants} clientFile={{ ...clientFile, count: clientCount }} />
    </div>
  )
}
