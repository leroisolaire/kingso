import type { Metadata } from 'next'
import Link from 'next/link'
import Table from '@/components/ui/Table'
import Badge from '@/components/ui/Badge'
import { db } from '@/lib/db/client'
import { isEmailConfigured } from '@/lib/email/brevo'

export const metadata: Metadata = { title: 'Demandes SAV | Admin' }

export default async function EscalationsPage() {
  const escalations = await db.escalation.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { assistant: { select: { name: true } } },
  })
  const failed = escalations.filter((e) => !e.emailSent).length

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Demandes SAV</h1>
        <p className="mt-1 text-sm text-gray-500">Demandes transmises par les clients depuis les chats.</p>
      </div>

      {!isEmailConfigured() && (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          L&apos;envoi d&apos;email n&apos;est pas configuré (BREVO_API_KEY / BREVO_SENDER_EMAIL) : les demandes sont enregistrées ici mais aucun email n&apos;est envoyé.
        </p>
      )}
      {isEmailConfigured() && failed > 0 && (
        <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {failed} demande(s) dont l&apos;email n&apos;a pas pu être envoyé : à traiter manuellement.
        </p>
      )}

      <Table
        data={escalations}
        emptyMessage="Aucune demande pour l'instant."
        columns={[
          { key: 'date', header: 'Date', render: (e) => e.createdAt.toLocaleString('fr-FR') },
          { key: 'client', header: 'Client', render: (e) => <span className="font-medium text-gray-900">{e.firstName} {e.lastName}</span> },
          {
            key: 'contact',
            header: 'Contact',
            render: (e) => (
              <span className="text-gray-600">
                {e.phone} · {e.postalCode}
                {e.email && <span className="block text-xs text-gray-400">{e.email}</span>}
              </span>
            ),
          },
          { key: 'chat', header: 'Chat', render: (e) => e.assistant.name },
          {
            key: 'email',
            header: 'Email SAV',
            render: (e) => (e.emailSent ? <Badge variant="published">Envoyé</Badge> : <Badge variant="internal">Non envoyé</Badge>),
          },
          {
            key: 'actions',
            header: '',
            className: 'w-28 text-right',
            render: (e) => (
              <Link href={`/admin/history/${encodeURIComponent(e.sessionToken)}`} className="text-sm text-amber-600 hover:underline">
                Conversation
              </Link>
            ),
          },
        ]}
      />
    </div>
  )
}
