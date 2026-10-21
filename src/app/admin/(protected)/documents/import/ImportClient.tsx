'use client'

import { useEffect, useRef, useState, type DragEvent } from 'react'
import Link from 'next/link'
import Button from '@/components/ui/Button'
import CategorySelect from '@/components/admin/CategorySelect'
import { supabase } from '@/lib/storage/client'
import type { Category } from '@/types/category'
import type { DocumentType } from '@/types/document'

const EXTENSIONS = ['pdf', 'docx', 'txt', 'md', 'csv', 'jpg', 'jpeg', 'png', 'webp']
const MAX_SIZE = 50 * 1024 * 1024

type ItemState = 'queued' | 'skipped' | 'hashing' | 'uploading' | 'processing' | 'done' | 'duplicate' | 'error'

interface QueueItem {
  key: string
  file: File
  /** Sous-dossier de premier niveau (import d'un dossier) */
  subfolder: string | null
  state: ItemState
  message?: string
  documentId?: string
}

const STATE_LABEL: Record<ItemState, string> = {
  queued: 'En file',
  skipped: 'Ignoré',
  hashing: 'Vérification…',
  uploading: 'Envoi…',
  processing: 'Traitement…',
  done: 'Prêt',
  duplicate: 'Déjà importé',
  error: 'Erreur',
}

const STATE_CLASS: Record<ItemState, string> = {
  queued: 'text-gray-500',
  skipped: 'text-gray-400',
  hashing: 'text-amber-700',
  uploading: 'text-amber-700',
  processing: 'text-amber-700',
  done: 'text-green-700',
  duplicate: 'text-gray-500',
  error: 'text-red-600',
}

const ext = (name: string) => name.split('.').pop()?.toLowerCase() ?? ''
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function titleFromFileName(name: string) {
  return name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function formatSize(bytes: number) {
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} Mo` : `${Math.max(1, Math.round(bytes / 1024))} Ko`
}

async function sha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Chemin relatif → sous-dossier de premier niveau ("Kingso/Hitachi/notice.pdf" → "Hitachi"). */
function subfolderOf(relativePath: string): string | null {
  const parts = relativePath.split('/').filter(Boolean)
  return parts.length >= 3 ? parts[1] : null
}

function makeItem(file: File, relativePath: string): QueueItem {
  const supported = EXTENSIONS.includes(ext(file.name))
  const tooBig = file.size > MAX_SIZE
  return {
    key: `${relativePath}-${file.size}-${file.lastModified}`,
    file,
    subfolder: subfolderOf(relativePath),
    state: supported && !tooBig ? 'queued' : 'skipped',
    message: !supported ? `Format .${ext(file.name)} non pris en charge` : tooBig ? 'Plus de 50 Mo' : undefined,
  }
}

/** Parcourt récursivement un dossier glissé-déposé. */
async function readEntry(entry: FileSystemEntry, path: string): Promise<{ file: File; path: string }[]> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject))
    return [{ file, path: `${path}${file.name}` }]
  }
  const reader = (entry as FileSystemDirectoryEntry).createReader()
  const entries: FileSystemEntry[] = []
  // readEntries renvoie les éléments par paquets : on lit jusqu'à épuisement
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject))
    if (batch.length === 0) break
    entries.push(...batch)
  }
  const nested = await Promise.all(entries.map((e) => readEntry(e, `${path}${entry.name}/`)))
  return nested.flat()
}

export default function ImportClient({ initialCategories }: { initialCategories: Category[] }) {
  const [categories, setCategories] = useState(initialCategories)
  const [categoryId, setCategoryId] = useState('')
  const [type, setType] = useState<DocumentType>('PUBLIC')
  const [useSubfolders, setUseSubfolders] = useState(true)
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [running, setRunning] = useState(false)
  const [dragging, setDragging] = useState(false)
  const stopRequested = useRef(false)
  const filesRef = useRef<HTMLInputElement>(null)
  const folderRef = useRef<HTMLInputElement>(null)

  const selected = categories.find((c) => c.id === categoryId)
  const selectedIsParent = Boolean(selected && !selected.parentId)
  const hasSubfolders = queue.some((q) => q.subfolder)
  const subfoldersActive = useSubfolders && selectedIsParent && hasSubfolders

  // Prévenir avant de quitter la page pendant un import
  useEffect(() => {
    if (!running) return
    const handler = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [running])

  const addFiles = (entries: { file: File; path: string }[]) => {
    setQueue((prev) => {
      const keys = new Set(prev.map((q) => q.key))
      const added = entries.map(({ file, path }) => makeItem(file, path)).filter((item) => !keys.has(item.key))
      return [...prev, ...added]
    })
  }

  const handleDrop = async (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (running) return
    const items = Array.from(e.dataTransfer.items)
    const entries = items.map((i) => i.webkitGetAsEntry()).filter((x): x is FileSystemEntry => Boolean(x))
    const files = (await Promise.all(entries.map((entry) => readEntry(entry, '')))).flat()
    addFiles(files)
  }

  const update = (key: string, patch: Partial<QueueItem>) =>
    setQueue((prev) => prev.map((q) => (q.key === key ? { ...q, ...patch } : q)))

  /** Sous-catégorie correspondant au sous-dossier (créée si besoin). */
  const resolveCategory = async (subfolder: string | null, cache: Map<string, string>, known: Category[]): Promise<string | null> => {
    if (!categoryId) return null
    if (!subfoldersActive || !subfolder) return categoryId
    const name = subfolder.trim()
    const cached = cache.get(name.toLowerCase())
    if (cached) return cached
    const existing = known.find((c) => c.parentId === categoryId && c.name.toLowerCase() === name.toLowerCase())
    if (existing) {
      cache.set(name.toLowerCase(), existing.id)
      return existing.id
    }
    const res = await fetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description: null, parentId: categoryId }),
    })
    if (!res.ok) throw new Error(`Impossible de créer la sous-catégorie « ${name} »`)
    const created: Category = await res.json()
    known.push(created)
    setCategories((prev) => [...prev, created])
    cache.set(name.toLowerCase(), created.id)
    return created.id
  }

  const processItem = async (item: QueueItem, targetCategoryId: string | null) => {
    update(item.key, { state: 'hashing', message: undefined })
    const contentHash = await sha256(item.file)

    const prep = await fetch('/api/documents/uploads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: item.file.name,
        fileSize: item.file.size,
        mimeType: item.file.type || null,
        contentHash,
        title: titleFromFileName(item.file.name),
        type,
        categoryId: targetCategoryId,
      }),
    })
    const target = await prep.json()
    if (!prep.ok) throw new Error(target.error ?? 'Préparation impossible')
    if (target.duplicate) {
      update(item.key, { state: 'duplicate', message: `« ${target.duplicate.title} »`, documentId: target.duplicate.id })
      return
    }

    // Envoi direct navigateur → stockage privé (pas de limite de taille côté Vercel)
    update(item.key, { state: 'uploading', documentId: target.id })
    const { error: uploadError } = await supabase.storage
      .from(target.bucket)
      .uploadToSignedUrl(target.path, target.token, item.file, { contentType: item.file.type || undefined })
    if (uploadError) {
      await fetch(`/api/documents/${target.id}`, { method: 'DELETE' })
      throw new Error(`Envoi impossible : ${uploadError.message}`)
    }

    // Traitement (lecture, découpage, indexation) : relancé jusqu'à la fin
    update(item.key, { state: 'processing', message: 'Lecture du fichier…' })
    for (;;) {
      const res = await fetch(`/api/documents/${target.id}/process`, { method: 'POST' })
      const result = await res.json().catch(() => ({ error: `Erreur ${res.status}` }))
      if (!res.ok) throw new Error(result.error ?? `Erreur ${res.status}`)
      if (result.status === 'READY') {
        update(item.key, { state: 'done', message: undefined })
        return
      }
      if (result.status === 'ERROR') throw new Error(result.message ?? 'Traitement impossible')
      update(item.key, { message: result.message ?? undefined })
      if (result.retryAfter) await sleep(result.retryAfter * 1000)
    }
  }

  const start = async () => {
    setRunning(true)
    stopRequested.current = false
    const cache = new Map<string, string>()
    const known = [...categories]
    for (const item of queue.filter((q) => q.state === 'queued' || q.state === 'error')) {
      if (stopRequested.current) break
      try {
        await processItem(item, await resolveCategory(item.subfolder, cache, known))
      } catch (error) {
        update(item.key, { state: 'error', message: error instanceof Error ? error.message : String(error) })
      }
    }
    setRunning(false)
  }

  const counts = queue.reduce<Record<ItemState, number>>((acc, q) => ({ ...acc, [q.state]: (acc[q.state] ?? 0) + 1 }), {} as Record<ItemState, number>)
  const toProcess = (counts.queued ?? 0) + (counts.error ?? 0)
  const finished = !running && queue.length > 0 && toProcess === 0

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6">
        <Link href="/admin/documents" className="text-sm text-amber-600 hover:underline">← Documents</Link>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">Importer des documents</h1>
        <p className="mt-1 text-sm text-gray-500">
          PDF (y compris scannés), Word, texte et photos. Chaque fichier est lu, découpé en passages et indexé.
        </p>
      </div>

      <div className="mb-5 grid gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Catégorie</label>
          <CategorySelect categories={categories} value={categoryId} onChange={setCategoryId} allowParents emptyLabel="— Choisir une catégorie —" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Visibilité</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as DocumentType)}
            disabled={running}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            <option value="PUBLIC">Public (utilisable par les chats clients)</option>
            <option value="INTERNAL">Interne (collaborateurs uniquement)</option>
            <option value="FRANCHISE">Franchisé</option>
          </select>
        </div>
        {hasSubfolders && (
          <label className={`flex items-start gap-3 sm:col-span-2 ${selectedIsParent ? 'cursor-pointer' : 'opacity-50'}`}>
            <input
              type="checkbox"
              checked={useSubfolders}
              disabled={!selectedIsParent || running}
              onChange={(e) => setUseSubfolders(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-amber-500"
            />
            <span className="text-sm text-gray-700">
              Ranger chaque sous-dossier dans la sous-catégorie du même nom (créée si besoin)
              {!selectedIsParent && <span className="block text-xs text-gray-500">Choisissez une catégorie principale pour activer cette option.</span>}
            </span>
          </label>
        )}
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`mb-5 flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition ${dragging ? 'border-amber-500 bg-amber-50' : 'border-gray-300 bg-white'}`}
      >
        <svg className="h-10 w-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
        </svg>
        <p className="text-sm text-gray-600">Glissez ici des fichiers ou un dossier entier</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button type="button" variant="secondary" size="sm" disabled={running} onClick={() => filesRef.current?.click()}>Choisir des fichiers</Button>
          <Button type="button" variant="secondary" size="sm" disabled={running} onClick={() => folderRef.current?.click()}>Choisir un dossier</Button>
        </div>
        <p className="text-xs text-gray-400">PDF, Word, TXT, JPG, PNG — 50 Mo max par fichier</p>
        <input
          ref={filesRef}
          type="file"
          multiple
          accept={EXTENSIONS.map((e) => `.${e}`).join(',')}
          className="hidden"
          onChange={(e) => { addFiles(Array.from(e.target.files ?? []).map((file) => ({ file, path: file.name }))); e.target.value = '' }}
        />
        <input
          ref={folderRef}
          type="file"
          multiple
          className="hidden"
          {...{ webkitdirectory: '' }}
          onChange={(e) => { addFiles(Array.from(e.target.files ?? []).map((file) => ({ file, path: file.webkitRelativePath || file.name }))); e.target.value = '' }}
        />
      </div>

      {queue.length > 0 && (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-gray-600">
              {queue.length} fichier(s)
              {counts.done ? ` · ${counts.done} prêt(s)` : ''}
              {counts.duplicate ? ` · ${counts.duplicate} déjà importé(s)` : ''}
              {counts.error ? ` · ${counts.error} en erreur` : ''}
              {counts.skipped ? ` · ${counts.skipped} ignoré(s)` : ''}
            </p>
            <div className="flex gap-2">
              {!running && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setQueue([])}>Vider la liste</Button>
              )}
              {running ? (
                <Button type="button" variant="secondary" size="sm" onClick={() => { stopRequested.current = true }}>
                  Arrêter après ce fichier
                </Button>
              ) : (
                <Button type="button" disabled={toProcess === 0 || !categoryId} onClick={start}>
                  {counts.error ? `Importer / réessayer (${toProcess})` : `Importer ${toProcess} fichier(s)`}
                </Button>
              )}
            </div>
          </div>

          {!categoryId && toProcess > 0 && (
            <p className="mb-3 text-sm text-amber-700">Choisissez une catégorie avant de lancer l&apos;import.</p>
          )}
          {running && (
            <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Import en cours : gardez cette page ouverte. Une notice scannée peut prendre une à deux minutes.
            </p>
          )}

          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <ul className="divide-y divide-gray-100">
              {queue.map((item) => (
                <li key={item.key} className="flex flex-col gap-1 px-4 py-3 text-sm sm:flex-row sm:items-center sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-gray-900">{item.file.name}</p>
                    <p className="text-xs text-gray-400">
                      {formatSize(item.file.size)}
                      {item.subfolder && (subfoldersActive ? ` · → ${selected?.name} / ${item.subfolder}` : ` · dossier ${item.subfolder}`)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right sm:max-w-[45%]">
                    <p className={`font-medium ${STATE_CLASS[item.state]}`}>
                      {['hashing', 'uploading', 'processing'].includes(item.state) && (
                        <span className="mr-1.5 inline-block h-3 w-3 animate-spin rounded-full border-2 border-amber-200 border-t-amber-600 align-[-1px]" />
                      )}
                      {STATE_LABEL[item.state]}
                    </p>
                    {item.message && <p className="text-xs text-gray-500">{item.message}</p>}
                    {item.documentId && (item.state === 'done' || item.state === 'duplicate') && (
                      <Link href={`/admin/documents/${item.documentId}`} className="text-xs text-amber-600 hover:underline">Voir</Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {finished && (
            <div className="mt-4 flex justify-end">
              <Link href="/admin/documents"><Button>Voir les documents</Button></Link>
            </div>
          )}
        </>
      )}
    </div>
  )
}
