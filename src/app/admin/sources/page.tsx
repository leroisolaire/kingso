'use client'

import { useState, useEffect } from 'react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'

interface WebSource {
  id: string
  name: string
  url: string
  maxPages: number
  active: boolean
  lastCrawled: string | null
  createdAt: string
  _count: { pages: number }
}

export default function SourcesPage() {
  const [sources, setSources] = useState<WebSource[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [maxPages, setMaxPages] = useState('80')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function fetchSources() {
    try {
      const res = await fetch('/api/sources')
      const data = await res.json()
      if (res.ok) setSources(data)
      else console.error('[sources]', data)
    } catch (e) {
      console.error('[sources fetch]', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchSources() }, [])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const res = await fetch('/api/sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, url, maxPages: Number(maxPages) }),
    })
    if (!res.ok) {
      const d = await res.json()
      setError(d.error)
    } else {
      setName(''); setUrl(''); setMaxPages('80'); setShowForm(false)
      fetchSources()
    }
    setSaving(false)
  }

  async function toggleActive(source: WebSource) {
    await fetch(`/api/sources/${source.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !source.active }),
    })
    fetchSources()
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer cette source et toutes ses pages ? Cette action est irréversible.')) return
    await fetch(`/api/sources/${id}`, { method: 'DELETE' })
    fetchSources()
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sources web</h1>
          <p className="mt-1 text-sm text-gray-500">Sites crawlés automatiquement chaque semaine</p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Annuler' : '+ Ajouter un site'}
        </Button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
          <h2 className="font-semibold text-gray-800">Nouveau site à crawler</h2>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Nom" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. : Le Roi Solaire" required />
            <Input label="URL de départ" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.exemple.fr" required />
          </div>
          <div className="w-32">
            <Input label="Nb max de pages" type="number" value={maxPages} onChange={(e) => setMaxPages(e.target.value)} min="1" max="500" />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex justify-end">
            <Button type="submit" loading={saving}>Ajouter</Button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Chargement...</p>
      ) : sources.length === 0 ? (
        <p className="text-sm text-gray-500">Aucune source configurée. Ajoutez un site pour commencer.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                <th className="px-5 py-3">Site</th>
                <th className="px-5 py-3">Pages indexées</th>
                <th className="px-5 py-3">Dernier crawl</th>
                <th className="px-5 py-3">Statut</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sources.map((source) => (
                <tr key={source.id} className="hover:bg-gray-50">
                  <td className="px-5 py-4">
                    <div className="font-medium text-gray-900">{source.name}</div>
                    <a href={source.url} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-gray-400 hover:text-amber-600 hover:underline">
                      {source.url}
                    </a>
                  </td>
                  <td className="px-5 py-4 text-gray-600">
                    {source._count.pages} / {source.maxPages}
                  </td>
                  <td className="px-5 py-4 text-gray-500">
                    {source.lastCrawled
                      ? new Date(source.lastCrawled).toLocaleDateString('fr-FR')
                      : <span className="text-gray-300">Jamais</span>}
                  </td>
                  <td className="px-5 py-4">
                    <button
                      onClick={() => toggleActive(source)}
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium transition ${source.active ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${source.active ? 'bg-green-500' : 'bg-gray-400'}`} />
                      {source.active ? 'Actif' : 'Pausé'}
                    </button>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center justify-end gap-4">
                      <button
                        onClick={() => handleDelete(source.id)}
                        className="text-red-400 hover:text-red-600"
                        title="Supprimer"
                      >
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
