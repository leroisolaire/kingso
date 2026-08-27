'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { loginChatAccess, logoutChatAccess } from '@/lib/auth/chatActions'

export default function ChatAuthButton({ authenticated }: { authenticated: boolean }) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const result = await loginChatAccess(formData)
      if (result?.error) {
        setError(result.error)
        return
      }
      setOpen(false)
      router.refresh()
    })
  }

  function handleLogout() {
    startTransition(async () => {
      await logoutChatAccess()
      router.refresh()
    })
  }

  if (authenticated) {
    return (
      <button
        onClick={handleLogout}
        disabled={isPending}
        className="rounded-md px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors disabled:opacity-50"
      >
        Déconnexion
      </button>
    )
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-md bg-amber-500 px-3 py-2 text-sm font-medium text-white hover:bg-amber-600 transition-colors"
      >
        Connexion
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-md border border-gray-200 bg-white p-4 shadow-lg">
          <form action={handleSubmit} className="space-y-3">
            <div>
              <label htmlFor="chat-access-password" className="block text-sm font-medium text-gray-700">
                Mot de passe
              </label>
              <input
                id="chat-access-password"
                name="password"
                type="password"
                required
                autoFocus
                autoComplete="current-password"
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-amber-500 focus:outline-none"
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={isPending}
              className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {isPending ? 'Connexion...' : 'Se connecter'}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
