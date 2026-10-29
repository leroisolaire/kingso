import 'server-only'
import type { Prisma } from '@prisma/client'
import { isOAuthConfigured, oauthTokenRequest } from '@/lib/auth/googleOAuth'
import { seal as sealWith, unseal as unsealWith } from '@/lib/auth/sealed'
import { db } from '@/lib/db/client'
import { CONNECTEL_SENDER, isConnectelVoicemail, parseVoicemail } from './connectel'
import { ingestMessage } from './ingest'
import { handleKingsiaEmail, isKingsiaSubject } from '@/lib/kingsia/ingest'
import { parseFullEmail, parseRawEmail } from './mime'

// Réception automatique des messages du répondeur dans la boîte kingso@ (emails Connectel transférés depuis sav@).
// Accès en LECTURE SEULE à cette seule boîte, autorisé une fois par l'équipe en se connectant avec kingso@
// (pas de délégation sur tout le domaine). Relevé déclenché par la notification Gmail (Pub/Sub) quand elle est
// configurée, à l'ouverture de l'espace SAV, et chaque nuit.

export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly'
export const EXPECTED_MAILBOX = (process.env.SAV_MAILBOX ?? 'kingso@leroisolaire.fr').toLowerCase()
const STATE_KEY = 'savGmail'
const SEEN_MAX = 300

export interface GmailState {
  email?: string
  /** Jeton de rafraîchissement, chiffré */
  token?: string
  connectedAt?: string
  connectedBy?: string | null
  checkedAt?: string
  lastImportAt?: string
  imported?: number
  error?: string | null
  watchExpiration?: string
  /** Identifiants Gmail déjà examinés (évite de relire les mêmes messages) */
  seen?: string[]
}

// ── Chiffrement du jeton (clé dérivée de SESSION_SECRET) ──
const seal = (text: string) => sealWith('gmail', text)
const unseal = (sealed: string) => unsealWith('gmail', sealed)

export async function getGmailState(): Promise<GmailState> {
  const row = await db.appSetting.findUnique({ where: { key: STATE_KEY } })
  return (row?.value as GmailState | null) ?? {}
}
async function saveState(patch: Partial<GmailState>): Promise<GmailState> {
  const next = { ...(await getGmailState()), ...patch }
  const value = next as unknown as Prisma.InputJsonValue
  await db.appSetting.upsert({ where: { key: STATE_KEY }, create: { key: STATE_KEY, value }, update: { value } })
  return next
}

export { isOAuthConfigured }

// ── Connexion (OAuth) ──
export function authUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID ?? '',
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GMAIL_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    login_hint: EXPECTED_MAILBOX,
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

async function gmailFetch<T>(accessToken: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`Gmail ${res.status} : ${json.error?.message ?? 'erreur'}`)
  return json as T
}

/** Fin de la connexion : vérifie qu'il s'agit bien de la boîte kingso@, puis garde le jeton (chiffré). */
export async function completeConnection(code: string, redirectUri: string, author: string | null) {
  const tokens = await oauthTokenRequest({ code, redirect_uri: redirectUri, grant_type: 'authorization_code' })
  if (!tokens.refresh_token) throw new Error('Google n\'a pas fourni d\'accès durable : recommencez la connexion.')
  const profile = await gmailFetch<{ emailAddress: string }>(tokens.access_token, '/profile')
  const email = profile.emailAddress.toLowerCase()
  if (email !== EXPECTED_MAILBOX) {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(tokens.refresh_token)}`, { method: 'POST' }).catch(() => null)
    throw new Error(`Connectez la boîte ${EXPECTED_MAILBOX} (et non ${email}).`)
  }
  await saveState({ email, token: seal(tokens.refresh_token), connectedAt: new Date().toISOString(), connectedBy: author, error: null })
  await renewWatch().catch(() => null)
}

export async function disconnect() {
  const state = await getGmailState()
  if (state.token) {
    const token = unseal(state.token)
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: 'POST' }).catch(() => null)
  }
  await saveState({ token: undefined, email: undefined, watchExpiration: undefined })
}

async function accessToken(): Promise<string | null> {
  const state = await getGmailState()
  if (!state.token || !isOAuthConfigured()) return null
  const tokens = await oauthTokenRequest({ refresh_token: unseal(state.token), grant_type: 'refresh_token' })
  return tokens.access_token
}

// ── Notification instantanée (Pub/Sub) : à renouveler au moins tous les 7 jours (fait chaque nuit) ──
export async function renewWatch(): Promise<string | null> {
  const topicName = process.env.GMAIL_PUBSUB_TOPIC
  if (!topicName) return null
  const token = await accessToken()
  if (!token) return null
  const res = await gmailFetch<{ expiration: string }>(token, '/watch', {
    method: 'POST',
    body: JSON.stringify({ topicName, labelIds: ['INBOX'], labelFilterBehavior: 'include' }),
  })
  const expiration = new Date(Number(res.expiration)).toISOString()
  await saveState({ watchExpiration: expiration })
  return expiration
}

// ── Relevé ──
let running: Promise<CheckResult> | null = null

export interface CheckResult {
  status: 'not-connected' | 'ok' | 'error'
  found: number
  created: number
  followUps: number
  duplicates: number
  ignored: number
  remaining: number
  /** Mails « kingsia » traités (ajouts à la base documentaire) */
  kingsia?: number
  error?: string
}

/** Relève les messages du répondeur arrivés dans la boîte (3 derniers jours) et crée les dossiers. */
export function checkMailbox(budgetMs = 240_000): Promise<CheckResult> {
  // Un seul relevé à la fois dans une même instance (notifications rapprochées)
  running ??= runCheck(budgetMs).finally(() => { running = null })
  return running
}

/** Relevé seulement si le dernier date de plus de `minutes` (ouverture de l'espace SAV). */
export async function checkMailboxIfStale(minutes = 2): Promise<CheckResult | null> {
  const state = await getGmailState()
  if (!state.token) return null
  if (state.checkedAt && Date.now() - new Date(state.checkedAt).getTime() < minutes * 60_000) return null
  return checkMailbox(50_000)
}

async function runCheck(budgetMs: number): Promise<CheckResult> {
  const result: CheckResult = { status: 'ok', found: 0, created: 0, followUps: 0, duplicates: 0, ignored: 0, remaining: 0 }
  const started = Date.now()
  const state = await getGmailState()
  if (!state.token) return { ...result, status: 'not-connected' }
  await saveState({ checkedAt: new Date().toISOString() })

  try {
    const token = await accessToken()
    if (!token) return { ...result, status: 'not-connected' }
    // Messages du répondeur, et mails « kingsia » des collaborateurs (ajouts à la base documentaire)
    const listOf = (query: string) => gmailFetch<{ messages?: { id: string }[] }>(
      token, `/messages?q=${encodeURIComponent(query)}&maxResults=100&includeSpamTrash=false`)
    const [voicemails, kingsia] = await Promise.all([listOf(`from:${CONNECTEL_SENDER} newer_than:3d`), listOf('subject:kingsia newer_than:3d')])
    const seen = new Set(state.seen ?? [])
    const ids = [...new Set([...(voicemails.messages ?? []), ...(kingsia.messages ?? [])].map((m) => m.id))]
    const fresh = ids.map((id) => ({ id })).filter((m) => !seen.has(m.id))
    result.found = fresh.length

    // Lecture des nouveaux messages, puis traitement dans l'ordre d'arrivée (les relances se regroupent sur le premier)
    const messages = []
    for (const m of fresh) {
      const msg = await gmailFetch<{ id: string; raw: string; internalDate: string }>(token, `/messages/${m.id}?format=raw`)
      const raw = Buffer.from(msg.raw, 'base64url').toString('latin1')
      messages.push({ id: msg.id, internalDate: Number(msg.internalDate), raw, email: parseRawEmail(raw) })
    }
    messages.sort((a, b) => a.internalDate - b.internalDate)

    const done: string[] = []
    for (const m of messages) {
      if (Date.now() - started > budgetMs) { result.remaining++; continue }
      if (isKingsiaSubject(m.email.subject) && !isConnectelVoicemail(m.email.from, m.email.subject)) {
        // Un seul traitement par mail, même si deux relevés tournent en même temps (clé unique en base)
        const claimed = await db.appSetting.create({ data: { key: `kingsia:${m.id}`, value: { at: new Date().toISOString() } } }).then(() => true, () => false)
        if (claimed) {
          await handleKingsiaEmail(parseFullEmail(m.raw), Math.min(150_000, Math.max(30_000, budgetMs - (Date.now() - started))))
          result.kingsia = (result.kingsia ?? 0) + 1
        }
        done.push(m.id)
        continue
      }
      if (!isConnectelVoicemail(m.email.from, m.email.subject)) {
        result.ignored++
        done.push(m.id)
        continue
      }
      const v = parseVoicemail(m.email.text)
      const r = await ingestMessage({
        source: 'VOICEMAIL',
        externalId: m.email.messageId ?? `gmail:${m.id}`,
        text: v.transcript,
        callerPhone: v.callerPhone,
        dictatedPhone: v.dictatedPhone,
        receivedAt: v.receivedAt ?? new Date(m.internalDate),
        durationSec: v.durationSec,
      }).catch((e) => {
        // Même message traité au même moment par un autre relevé : déjà en base
        if (/Unique constraint/i.test(String(e))) return { duplicate: true, created: false, caseId: '' }
        throw e
      })
      if (r.duplicate) result.duplicates++
      else if (r.created) result.created++
      else result.followUps++
      done.push(m.id)
    }

    const latest = await getGmailState()
    await saveState({
      seen: [...(latest.seen ?? []), ...done].slice(-SEEN_MAX),
      error: null,
      ...(result.created + result.followUps > 0
        ? { lastImportAt: new Date().toISOString(), imported: (latest.imported ?? 0) + result.created + result.followUps }
        : {}),
    })
    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await saveState({ error: message })
    return { ...result, status: 'error', error: message }
  }
}
