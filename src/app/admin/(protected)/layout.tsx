import AdminSidebar from '@/components/layout/AdminSidebar'
import { getCurrentUser } from '@/lib/auth/dal'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <AdminSidebar user={user} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto p-6 lg:p-8">{children}</main>
      </div>
    </div>
  )
}
