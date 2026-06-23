'use client'

import { useActionState } from 'react'
import { login } from '@/lib/auth/actions'

export default function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined)

  return (
    <form action={action} className="w-full max-w-sm space-y-4 rounded-xl bg-white p-8 shadow">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Connexion admin</h1>
        <p className="mt-1 text-sm text-gray-500">Kingso — back-office</p>
      </div>

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-amber-500 focus:outline-none"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700">Mot de passe</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-amber-500 focus:outline-none"
        />
      </div>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {pending ? 'Connexion...' : 'Se connecter'}
      </button>
    </form>
  )
}
