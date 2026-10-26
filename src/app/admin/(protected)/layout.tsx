import AdminSidebar from '@/components/layout/AdminSidebar'
import { getCurrentUser } from '@/lib/auth/dal'
import { db } from '@/lib/db/client'

// Pages du back-office toujours rendues à la demande : jamais d'accès à la base pendant le build
export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [user, driveAlerts] = await Promise.all([
    getCurrentUser(),
    // Documents Drive mis de côté (confidentiels ou classement en échec) : à valider
    db.document.count({
      where: { OR: [{ reviewState: 'CONFIDENTIAL' }, { reviewState: 'TO_SORT', reviewNote: { startsWith: 'Erreur' } }] },
    }),
  ])

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <AdminSidebar user={user} badges={{ '/admin/drive': driveAlerts }} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto p-6 lg:p-8">{children}</main>
      </div>
    </div>
  )
}
