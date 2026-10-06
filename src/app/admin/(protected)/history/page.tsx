import type { Metadata } from 'next'
import HistoryTable from '@/components/admin/HistoryTable'
import { getConversations } from '@/lib/db/queries/history'

export const metadata: Metadata = { title: 'Historique | Admin' }

export default async function HistoryPage() {
  const conversations = await getConversations()

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Historique des conversations</h1>
        <p className="mt-1 text-sm text-gray-500">{conversations.length} conversation(s) enregistrée(s)</p>
      </div>
      <HistoryTable conversations={conversations} />
    </div>
  )
}
