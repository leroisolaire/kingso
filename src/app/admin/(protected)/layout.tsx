import AdminSidebar from '@/components/layout/AdminSidebar'
import { getCurrentUser } from '@/lib/auth/dal'
import { db } from '@/lib/db/client'
import { CHAT_REQUESTS_TO_HANDLE } from '@/lib/sav/chatRequests'

// Pages du back-office toujours rendues à la demande : jamais d'accès à la base pendant le build
export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [user, driveAlerts, videosToReview, savToHandle, chatRequests] = await Promise.all([
    getCurrentUser(),
    // Documents Drive mis de côté (confidentiels ou classement en échec) : à valider
    db.document.count({
      where: { OR: [{ reviewState: 'CONFIDENTIAL' }, { reviewState: 'TO_SORT', reviewNote: { startsWith: 'Erreur' } }] },
    }),
    // Vidéos utiles repérées par Kingso, en attente de validation
    db.videoItem.count({ where: { status: 'TO_REVIEW' } }),
    // Dossiers SAV à traiter : emails à valider et clients à rappeler
    db.savCase.count({ where: { status: { in: ['NEW', 'TO_CALL'] } } }),
    // Demandes « Transmettre au SAV » des chats dont le client n'a pas encore été rappelé
    db.savCase.count({ where: CHAT_REQUESTS_TO_HANDLE }),
  ])
  // Le Planning ne voit que les interventions : sa pastille compte celles à planifier
  const planningOnly = !user.roles.includes('SUPER_ADMIN') && !user.roles.includes('SAV')
  const savBadge = planningOnly ? await db.savCase.count({ where: { status: 'TO_SCHEDULE' } }) : savToHandle

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <AdminSidebar user={user} badges={{ '/admin/drive': driveAlerts, '/admin/videos': videosToReview, '/admin/sav': savBadge, '/admin/escalations': chatRequests }} />
      {/* Texte sombre par défaut : le body est en blanc pour le front public (fond sombre) */}
      <div className="flex flex-1 flex-col overflow-hidden text-gray-900">
        <main className="flex-1 overflow-y-auto p-6 lg:p-8">{children}</main>
      </div>
    </div>
  )
}
