import type { DocumentStatus } from '@/types/document'

const STYLES: Record<DocumentStatus, { label: string; className: string }> = {
  READY: { label: 'Prêt', className: 'bg-green-100 text-green-700' },
  PROCESSING: { label: 'En cours', className: 'bg-amber-100 text-amber-800' },
  PENDING: { label: 'En attente', className: 'bg-gray-100 text-gray-600' },
  ERROR: { label: 'Erreur', className: 'bg-red-100 text-red-700' },
}

export default function DocumentStatusBadge({ status = 'READY', message }: { status?: DocumentStatus; message?: string | null }) {
  const style = STYLES[status]
  return (
    <span title={message ?? undefined} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${style.className}`}>
      {status === 'PROCESSING' && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />}
      {style.label}
    </span>
  )
}
