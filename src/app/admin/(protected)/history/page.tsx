import type { Metadata } from 'next'
import Link from 'next/link'
import HistoryTable from '@/components/admin/HistoryTable'
import { getConversations } from '@/lib/db/queries/history'
import { db } from '@/lib/db/client'

export const metadata: Metadata = { title: 'Historique | Admin' }

interface Props {
  searchParams: Promise<{ assistant?: string }>
}

export default async function HistoryPage({ searchParams }: Props) {
  const { assistant: assistantId } = await searchParams
  const [conversations, assistants] = await Promise.all([
    getConversations(assistantId),
    db.assistant.findMany({ select: { id: true, name: true }, orderBy: { createdAt: 'asc' } }),
  ])

  const pill = (active: boolean) =>
    `rounded-full px-3 py-1 text-sm ${active ? 'bg-slate-900 text-white' : 'bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50'}`

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Historique des conversations</h1>
        <p className="mt-1 text-sm text-gray-500">{conversations.length} conversation(s) enregistrée(s)</p>
      </div>
      {assistants.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          <Link href="/admin/history" className={pill(!assistantId)}>Tous les chats</Link>
          {assistants.map((a) => (
            <Link key={a.id} href={`/admin/history?assistant=${a.id}`} className={pill(assistantId === a.id)}>{a.name}</Link>
          ))}
        </div>
      )}
      <HistoryTable conversations={conversations} />
    </div>
  )
}
