import AdminSidebar from '@/components/layout/AdminSidebar'
import { getCurrentUser } from '@/lib/auth/dal'
import { db } from '@/lib/db/client'

// Pages du back-office toujours rendues à la demande : jamais d'accès à la base pendant le build
export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [user, driveAlerts, videosToReview] = await Promise.all([
    getCurrentUser(),
    // Documents Drive mis de côté (confidentiels ou classement en échec) : à valider
    db.document.count({
      where: { OR: [{ reviewState: 'CONFIDENTIAL' }, { reviewState: 'TO_SORT', reviewNote: { startsWith: 'Erreur' } }] },
    }),
    // Vidéos utiles repérées par Kingso, en attente de validation
    db.videoItem.count({ where: { status: 'TO_REVIEW' } }),
  ])

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <AdminSidebar user={user} badges={{ '/admin/drive': driveAlerts, '/admin/videos': videosToReview }} />
      {/* Texte sombre par défaut : le body est en blanc pour le front public (fond sombre) */}
      <div className="flex flex-1 flex-col overflow-hidden text-gray-900">
        <main className="flex-1 overflow-y-auto p-6 lg:p-8">{children}</main>
      </div>
    </div>
  )
}
