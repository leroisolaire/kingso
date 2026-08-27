import Link from 'next/link'
import ChatAuthButton from '@/components/layout/ChatAuthButton'
import { hasChatAccess } from '@/lib/auth/chatAccess'

export default async function Header() {
  const authenticated = await hasChatAccess()

  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500 text-sm font-bold text-white">
            K
          </span>
          <span className="font-semibold text-gray-900">Kingso</span>
        </Link>

        <nav className="flex items-center gap-1">
          <Link
            href="/"
            className="rounded-md px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
          >
            Accueil
          </Link>
          <Link
            href="/chat"
            className="rounded-md px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
          >
            Assistant
          </Link>
          <Link
            href="/faq"
            className="rounded-md px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
          >
            FAQ
          </Link>
          <ChatAuthButton authenticated={authenticated} />
        </nav>
      </div>
    </header>
  )
}
