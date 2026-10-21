'use client'

import { useActionState } from 'react'
import Image from 'next/image'
import { unlockAssistant, type UnlockState } from '@/lib/assistants/actions'

export default function PasswordGate({ slug, name }: { slug: string; name: string }) {
  const [state, action, pending] = useActionState<UnlockState, FormData>(unlockAssistant.bind(null, slug), undefined)

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[#f7f6f4] px-4 text-gray-900">
      <form action={action} className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-[0_1px_20px_rgba(0,0,0,0.06)]">
        <div className="mb-5 flex flex-col items-center text-center">
          <Image src="/kingso-avatar.png" alt="Kingso" width={64} height={64} className="mb-3 rounded-full ring-4 ring-[#e73e11]/10" />
          <h1 className="text-xl font-bold" style={{ fontFamily: 'var(--font-montserrat)' }}>{name}</h1>
          <p className="mt-1 text-sm text-gray-500">Ce chat est réservé. Saisissez le mot de passe.</p>
        </div>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="Mot de passe"
          autoFocus
          className="h-12 w-full rounded-xl border border-gray-200 px-4 text-base outline-none focus:border-[#e73e11] focus:ring-4 focus:ring-[#e73e11]/10"
        />
        {state?.error && <p className="mt-2 text-sm text-red-500">{state.error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="mt-4 h-12 w-full rounded-xl bg-[#e73e11] text-base font-semibold text-white disabled:opacity-60"
        >
          Accéder au chat
        </button>
      </form>
    </div>
  )
}
