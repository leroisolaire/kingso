import 'server-only'
import { SignJWT, importPKCS8 } from 'jose'

// Accès à Google Drive via un compte de service (API REST, sans SDK) : lecture, et pour le
// rangement automatique création de dossiers, déplacement et renommage (jamais de suppression).
// Variable GOOGLE_SERVICE_ACCOUNT_KEY : contenu du fichier .json de la clé, encodé en base64.

const SCOPE = 'https://www.googleapis.com/auth/drive'
const API = 'https://www.googleapis.com/drive/v3'
export const FOLDER_MIME = 'application/vnd.google-apps.folder'

interface ServiceAccount {
  client_email: string
  private_key: string
  token_uri?: string
}

export interface DriveFile {
  id: string
  name: string
  mimeType: string
  md5Checksum?: string
  modifiedTime: string
  size?: string
}

export function getServiceAccount(): ServiceAccount | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  if (!raw) return null
  try {
    const json = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf-8')
    const account = JSON.parse(json) as ServiceAccount
    return account.client_email && account.private_key ? account : null
  } catch {
    return null
  }
}

let cachedToken: { value: string; expiresAt: number } | null = null

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value
  const account = getServiceAccount()
  if (!account) throw new Error('Clé Google absente ou invalide (GOOGLE_SERVICE_ACCOUNT_KEY).')

  const tokenUri = account.token_uri ?? 'https://oauth2.googleapis.com/token'
  const now = Math.floor(Date.now() / 1000)
  const assertion = await new SignJWT({ scope: SCOPE })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(account.client_email)
    .setAudience(tokenUri)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(await importPKCS8(account.private_key, 'RS256'))

  const res = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.access_token) {
    throw new Error(`Authentification Google refusée : ${data.error_description ?? data.error ?? res.status}`)
  }
  cachedToken = { value: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 }
  return cachedToken.value
}

async function driveFetch(
  path: string,
  params: Record<string, string> = {},
  init: { method?: string; body?: unknown } = {},
): Promise<Response> {
  const url = new URL(`${API}${path}`)
  for (const [k, v] of Object.entries({ supportsAllDrives: 'true', ...params })) url.searchParams.set(k, v)
  const res = await fetch(url, {
    method: init.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${await getAccessToken()}`,
      ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    const reason = body?.error?.message ?? `HTTP ${res.status}`
    if (res.status === 404) throw new Error(`Élément introuvable dans Google Drive, ou non partagé avec le compte de service (${reason}).`)
    if (res.status === 403 && init.method && init.method !== 'GET') {
      throw new Error(`Modification refusée par Google Drive : le compte de service doit être « Gestionnaire de contenu » du Drive partagé (${reason}).`)
    }
    throw new Error(`Google Drive : ${reason}`)
  }
  return res
}

/** Métadonnées d'un dossier ou d'un Drive partagé (vérifie aussi l'accès). */
export async function getFolderName(folderId: string): Promise<string> {
  try {
    const res = await driveFetch(`/files/${folderId}`, { fields: 'id,name,mimeType' })
    return (await res.json()).name as string
  } catch (fileError) {
    // La racine d'un Drive partagé n'est pas un « fichier » : on essaie l'API des Drives partagés
    try {
      const res = await driveFetch(`/drives/${folderId}`, { fields: 'id,name' })
      return (await res.json()).name as string
    } catch {
      throw fileError
    }
  }
}

/** Contenu direct d'un dossier (fichiers et sous-dossiers), hors corbeille. */
export async function listChildren(folderId: string): Promise<DriveFile[]> {
  const files: DriveFile[] = []
  let pageToken: string | undefined
  do {
    const res = await driveFetch('/files', {
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'nextPageToken,files(id,name,mimeType,md5Checksum,modifiedTime,size)',
      includeItemsFromAllDrives: 'true',
      corpora: 'allDrives',
      pageSize: '1000',
      ...(pageToken ? { pageToken } : {}),
    })
    const data = await res.json()
    files.push(...data.files)
    pageToken = data.nextPageToken
  } while (pageToken)
  return files
}

/** Formats Google (Docs, Sheets, Slides) : exportés vers un format que Kingso sait lire. */
const GOOGLE_EXPORTS: Record<string, { mimeType: string; extension: string }> = {
  'application/vnd.google-apps.document': { mimeType: 'application/pdf', extension: 'pdf' },
  'application/vnd.google-apps.presentation': { mimeType: 'application/pdf', extension: 'pdf' },
  'application/vnd.google-apps.spreadsheet': { mimeType: 'text/csv', extension: 'csv' },
}

export function isGoogleNative(mimeType: string) {
  return mimeType.startsWith('application/vnd.google-apps.')
}

/** Nom de fichier tel que Kingso le traitera (un Google Doc devient « … .pdf »). */
export function effectiveFileName(file: DriveFile): string | null {
  if (!isGoogleNative(file.mimeType)) return file.name
  const exp = GOOGLE_EXPORTS[file.mimeType]
  return exp ? `${file.name}.${exp.extension}` : null
}

export async function downloadFile(file: DriveFile): Promise<{ buffer: Buffer; mimeType: string }> {
  const exp = GOOGLE_EXPORTS[file.mimeType]
  const res = exp
    ? await driveFetch(`/files/${file.id}/export`, { mimeType: exp.mimeType })
    : await driveFetch(`/files/${file.id}`, { alt: 'media' })
  return { buffer: Buffer.from(await res.arrayBuffer()), mimeType: exp?.mimeType ?? file.mimeType }
}

export async function getFile(fileId: string): Promise<DriveFile> {
  const res = await driveFetch(`/files/${fileId}`, { fields: 'id,name,mimeType,md5Checksum,modifiedTime,size' })
  return res.json()
}

/** Drives partagés dont le compte de service est membre. */
export async function listSharedDrives(): Promise<{ id: string; name: string }[]> {
  const res = await driveFetch('/drives', { pageSize: '100', fields: 'drives(id,name)' })
  return (await res.json()).drives ?? []
}

/** Dossiers partagés directement avec le compte de service (dossiers de « Mon Drive »). */
export async function listSharedFolders(): Promise<{ id: string; name: string }[]> {
  const res = await driveFetch('/files', {
    q: `sharedWithMe and mimeType = '${FOLDER_MIME}' and trashed = false`,
    fields: 'files(id,name)',
    pageSize: '100',
  })
  return (await res.json()).files ?? []
}

/** Sous-dossier `name` de `parentId` (comparaison sans accents ni majuscules), créé s'il manque. */
export async function findOrCreateFolder(parentId: string, name: string): Promise<string> {
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
  const existing = (await listChildren(parentId)).find((f) => f.mimeType === FOLDER_MIME && norm(f.name) === norm(name))
  if (existing) return existing.id
  const res = await driveFetch('/files', { fields: 'id' }, {
    method: 'POST',
    body: { name: name.trim(), mimeType: FOLDER_MIME, parents: [parentId] },
  })
  return (await res.json()).id
}

/** Déplace un fichier dans `folderId` (et le renomme si `newName` est fourni). */
export async function moveFile(fileId: string, folderId: string, newName?: string): Promise<void> {
  const current = await driveFetch(`/files/${fileId}`, { fields: 'parents' })
  const parents: string[] = (await current.json()).parents ?? []
  await driveFetch(`/files/${fileId}`, {
    addParents: folderId,
    ...(parents.length ? { removeParents: parents.filter((p) => p !== folderId).join(',') } : {}),
    fields: 'id',
  }, { method: 'PATCH', body: newName ? { name: newName } : {} })
}

/** Extrait l'identifiant d'un lien Google Drive (dossier ou Drive partagé). */
export function parseDriveLink(input: string): string | null {
  const trimmed = input.trim()
  const match = trimmed.match(/\/folders\/([A-Za-z0-9_-]{10,})/) ?? trimmed.match(/[?&]id=([A-Za-z0-9_-]{10,})/)
  if (match) return match[1]
  return /^[A-Za-z0-9_-]{10,}$/.test(trimmed) ? trimmed : null
}
