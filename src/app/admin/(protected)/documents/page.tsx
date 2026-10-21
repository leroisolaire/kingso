'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import DocumentStatusBadge from '@/components/admin/DocumentStatusBadge'
import type { Document } from '@/types/document'

const TYPE_LABEL: Record<Document['type'], { label: string; variant: 'public' | 'internal' | 'franchise' }> = {
  PUBLIC: { label: 'Public', variant: 'public' },
  INTERNAL: { label: 'Interne', variant: 'internal' },
  FRANCHISE: { label: 'Franchisé', variant: 'franchise' },
}

type SortKey = 'title' | 'categoryName' | 'type' | 'updatedAt'
type SortDir = 'asc' | 'desc'

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <span className={`ml-1 inline-block transition-opacity ${active ? 'opacity-100' : 'opacity-30'}`}>
      {active && dir === 'desc' ? '↓' : '↑'}
    </span>
  )
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState<SortKey>('updatedAt')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  async function fetchDocuments() {
    const res = await fetch('/api/documents')
    const data = await res.json()
    setDocuments(data)
    setLoading(false)
  }

  useEffect(() => { fetchDocuments() }, [])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sorted = useMemo(() => {
    return [...documents].sort((a, b) => {
      const aVal = (a[sortKey] ?? '').toString().toLowerCase()
      const bVal = (b[sortKey] ?? '').toString().toLowerCase()
      return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
    })
  }, [documents, sortKey, sortDir])

  // Reprend le traitement d'un document interrompu (page fermée) ou en erreur
  const [resuming, setResuming] = useState<string | null>(null)
  const handleResume = async (doc: Document) => {
    setResuming(doc.id)
    let retry = doc.status === 'ERROR'
    for (;;) {
      const res = await fetch(`/api/documents/${doc.id}/process${retry ? '?retry=1' : ''}`, { method: 'POST' })
      retry = false
      const result = await res.json().catch(() => ({}))
      if (!res.ok || result.status !== 'PROCESSING') break
      setDocuments((prev) => prev.map((d) => (d.id === doc.id ? { ...d, status: 'PROCESSING', statusMessage: result.message } : d)))
      if (result.retryAfter) await new Promise((r) => setTimeout(r, result.retryAfter * 1000))
    }
    setResuming(null)
    fetchDocuments()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer ce document ? Cette action est irréversible.')) return
    await fetch(`/api/documents/${id}`, { method: 'DELETE' })
    fetchDocuments()
  }

  const ThSortable = ({ label, col }: { label: string; col: SortKey }) => (
    <th
      className="cursor-pointer select-none px-5 py-3 hover:text-gray-800"
      onClick={() => handleSort(col)}
    >
      {label}
      <SortIcon active={sortKey === col} dir={sortDir} />
    </th>
  )

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Documents</h1>
          <p className="mt-1 text-sm text-gray-500">{documents.length} document(s) dans la base</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/documents/new">
            <Button variant="secondary">+ Saisir un texte</Button>
          </Link>
          <Link href="/admin/documents/import">
            <Button>Importer des fichiers</Button>
          </Link>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Chargement...</p>
      ) : sorted.length === 0 ? (
        <p className="text-sm text-gray-500">Aucun document. Cliquez sur « Importer des fichiers » pour commencer.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                <ThSortable label="Titre" col="title" />
                <ThSortable label="Catégorie" col="categoryName" />
                <ThSortable label="Visibilité" col="type" />
                <th className="px-5 py-3">Statut</th>
                <ThSortable label="Mis à jour" col="updatedAt" />
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.map((doc) => (
                <tr key={doc.id} className="hover:bg-gray-50">
                  <td className="px-5 py-4">
                    <Link href={`/admin/documents/${doc.id}`} className="font-medium text-gray-900 hover:text-amber-600">
                      {doc.title}
                    </Link>
                  </td>
                  <td className="px-5 py-4 text-gray-500">
                    {doc.categoryName ?? <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-5 py-4">
                    <Badge variant={TYPE_LABEL[doc.type].variant}>{TYPE_LABEL[doc.type].label}</Badge>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex flex-col items-start gap-1">
                      <DocumentStatusBadge status={doc.status} message={doc.statusMessage} />
                      {doc.status === 'READY' && doc.chunkCount === 0 && (
                        <span className="text-xs text-red-600">Non indexé</span>
                      )}
                      {doc.status && doc.status !== 'READY' && (
                        <>
                          {doc.statusMessage && <span className="max-w-[220px] text-xs text-gray-500">{doc.statusMessage}</span>}
                          <button
                            type="button"
                            onClick={() => handleResume(doc)}
                            disabled={resuming !== null}
                            className="text-xs font-medium text-amber-600 hover:underline disabled:opacity-50"
                          >
                            {resuming === doc.id ? 'Traitement…' : doc.status === 'ERROR' ? 'Relancer' : 'Reprendre'}
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-gray-500">
                    {new Date(doc.updatedAt).toLocaleDateString('fr-FR')}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center justify-end gap-4">
                      {(doc.fileUrl || doc.storagePath) && (
                        <a href={`/api/documents/${doc.id}/file`} target="_blank" rel="noopener noreferrer"
                          className="text-gray-400 hover:text-amber-600 hover:underline">
                          Consulter
                        </a>
                      )}
                      <Link href={`/admin/documents/${doc.id}`} className="text-amber-600 hover:underline">
                        Éditer
                      </Link>
                      <button onClick={() => handleDelete(doc.id)} className="text-red-400 hover:text-red-600" title="Supprimer">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
