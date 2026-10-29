import type { Metadata } from 'next'
import Link from 'next/link'
import Table from '@/components/ui/Table'
import Badge from '@/components/ui/Badge'
import { db } from '@/lib/db/client'
import { isEmailConfigured } from '@/lib/email/brevo'
import { CHAT_REQUEST_WHERE } from '@/lib/sav/chatRequests'
import { normalizePhone } from '@/lib/sav/phone'
import { STATUS_COLORS, STATUS_LABELS } from '@/lib/sav/status'

export const metadata: Metadata = { title: 'Demandes SAV | Admin' }

export default async function EscalationsPage() {
  const escalations = await db.escalation.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { assistant: { select: { name: true } } },
  })
  const failed = escalations.filter((e) => !e.emailSent).length

  // Dossier de l'espace SAV de chaque demande : celui de la conversation, sinon le dossier du même téléphone
  // qui a reçu la demande (relance d'un dossier déjà ouvert)
  const cases = await db.savCase.findMany({
    where: {
      OR: [
        { chatSessionToken: { in: escalations.map((e) => e.sessionToken) } },
        { AND: [CHAT_REQUEST_WHERE, { phoneKey: { in: escalations.map((e) => normalizePhone(e.phone)).filter((p): p is string => Boolean(p)) } }] },
      ],
    },
    select: { id: true, number: true, status: true, chatSessionToken: true, phoneKey: true, receivedAt: true },
    orderBy: { receivedAt: 'desc' },
  })
  const caseOf = (e: (typeof escalations)[number]) =>
    cases.find((c) => c.chatSessionToken === e.sessionToken)
    ?? cases.find((c) => c.phoneKey && c.phoneKey === normalizePhone(e.phone) && c.receivedAt <= e.createdAt)

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Demandes SAV</h1>
        <p className="mt-1 text-sm text-gray-500">
          Demandes transmises par les clients depuis les chats. Chacune crée un dossier « À rappeler » dans l&apos;espace SAV (ou relance le dossier déjà ouvert du client).
        </p>
        <Link href="/admin/sav?origine=chat" className="mt-2 inline-block text-sm font-medium text-amber-700 hover:underline">
          Voir les demandes des chats dans l&apos;espace SAV →
        </Link>
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
            key: 'case',
            header: 'Dossier SAV',
            render: (e) => {
              const c = caseOf(e)
              return c ? (
                <Link href={`/admin/sav/${c.id}`} className="inline-flex items-center gap-2 hover:underline">
                  <span className="font-medium text-gray-900">n° {c.number}</span>
                  <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[c.status]}`}>{STATUS_LABELS[c.status]}</span>
                </Link>
              ) : <span className="text-xs text-gray-400">—</span>
            },
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
