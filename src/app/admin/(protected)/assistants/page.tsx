import type { Metadata } from 'next'
import Link from 'next/link'
import Button from '@/components/ui/Button'
import AssistantList from '@/components/admin/AssistantList'
import { getAllAssistants } from '@/lib/db/queries/assistants'

export const metadata: Metadata = { title: 'Chats | Admin' }

export default async function AssistantsPage() {
  const assistants = await getAllAssistants()

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Chats</h1>
          <p className="mt-1 text-sm text-gray-500">
            Chaque chat a sa propre adresse, ses consignes et ses documents.
          </p>
        </div>
        <Link href="/admin/assistants/new">
          <Button>+ Nouveau chat</Button>
        </Link>
      </div>
      <AssistantList assistants={assistants} />
    </div>
  )
}
