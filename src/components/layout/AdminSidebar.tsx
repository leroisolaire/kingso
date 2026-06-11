'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navItems = [
  { href: '/admin', label: 'Tableau de bord', icon: '▦' },
  { href: '/admin/documents', label: 'Documents', icon: '⊞' },
  { href: '/admin/categories', label: 'Catégories', icon: '⊟' },
  { href: '/admin/faq', label: 'FAQ', icon: '?' },
  { href: '/admin/history', label: 'Historique', icon: '⊙' },
]

export default function AdminSidebar() {
  const pathname = usePathname()

  return (
    <aside className="flex h-full w-64 flex-col bg-slate-900 text-slate-300">
      <div className="flex h-16 items-center gap-3 border-b border-slate-700/50 px-6">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500 text-sm font-bold text-white">
          K
        </span>
        <div className="leading-tight">
          <p className="text-sm font-semibold text-white">Kingso</p>
          <p className="text-xs text-slate-400">Back-office</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const isActive =
              item.href === '/admin'
                ? pathname === '/admin'
                : pathname.startsWith(item.href)

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={[
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-slate-700 text-white'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-white',
                  ].join(' ')}
                >
                  <span className="text-base">{item.icon}</span>
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="border-t border-slate-700/50 px-4 py-4">
        {/* TODO: Afficher l'utilisateur connecté (NextAuth session) */}
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-600 text-xs font-semibold text-white">
            A
          </span>
          <div className="flex-1 leading-tight">
            <p className="text-sm font-medium text-white">Admin</p>
            <p className="text-xs text-slate-400">admin@lrs.fr</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
