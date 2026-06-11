'use client'

import { useState, useEffect } from 'react'
import type { Document } from '@/types/document'

export function useDocuments() {
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/documents')
      .then((r) => r.json())
      .then(setDocuments)
      .catch(() => setError('Impossible de charger les documents.'))
      .finally(() => setLoading(false))
  }, [])

  return { documents, loading, error }
}
