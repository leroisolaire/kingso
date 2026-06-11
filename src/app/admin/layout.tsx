import AdminSidebar from '@/components/layout/AdminSidebar'

// TODO: Protéger ce layout avec NextAuth :
// import { auth } from '@/lib/auth/config'
// import { redirect } from 'next/navigation'
// const session = await auth()
// if (!session) redirect('/admin/login')

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <AdminSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto p-6 lg:p-8">{children}</main>
      </div>
    </div>
  )
}
