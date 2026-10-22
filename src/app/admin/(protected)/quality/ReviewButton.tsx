'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function ReviewButton({ historyId, reviewed }: { historyId: string; reviewed: boolean }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const toggle = async () => {
    setLoading(true)
    await fetch(`/api/history/${historyId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviewed: !reviewed }),
    })
    setLoading(false)
    router.refresh()
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={loading}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${
        reviewed ? 'text-gray-500 hover:bg-gray-100' : 'bg-green-600 text-white hover:bg-green-700'
      }`}
    >
      {reviewed ? 'Remettre à traiter' : '✓ Traité'}
    </button>
  )
}
