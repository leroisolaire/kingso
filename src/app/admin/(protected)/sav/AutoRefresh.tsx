'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/** Rafraîchit la page toutes les 30 s (clients en ligne, dossiers déplacés) tant qu'elle est visible. */
export default function AutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter()
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh()
    }, seconds * 1000)
    return () => clearInterval(timer)
  }, [router, seconds])
  return null
}
