import 'server-only'
import { db } from '@/lib/db/client'
import { homeFor, LOGIN_DOMAIN } from '@/lib/auth/permissions'
import { encrypt } from '@/lib/auth/session'

// Identifiant OAuth Google de Kingso (« Application Web ») : connexion des collaborateurs au back-office,
// et autorisation de lecture de la boîte kingso@ (voir lib/sav/gmail.ts). Même adresse de retour pour les deux.

export const CALLBACK_PATH = '/api/auth/google/callback'
export const LOGIN_STATE_COOKIE = 'login_oauth_state'

export function isOAuthConfigured() {
  return Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET)
}

export async function oauthTokenRequest(body: Record<string, string>) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? '',
      ...body,
    }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`Google : ${json.error_description ?? json.error ?? res.status}`)
  return json as { access_token: string; refresh_token?: string; scope?: string }
}

/** Page de connexion Google (identité seulement : email et nom), limitée aux comptes du domaine. */
export function loginUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID ?? '',
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    hd: LOGIN_DOMAIN,
    prompt: 'select_account',
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

/**
 * Retour de Google : vérifie côté serveur le compte (email vérifié, du domaine), puis ouvre la session
 * si un compte actif existe pour cet email. Renvoie la session (à poser en cookie) et la page où aller,
 * ou lève une erreur lisible.
 */
export async function completeLogin(code: string, redirectUri: string): Promise<{ home: string; session: string }> {
  const { access_token } = await oauthTokenRequest({ code, redirect_uri: redirectUri, grant_type: 'authorization_code' })
  const res = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${access_token}` } })
  if (!res.ok) throw new Error('Google n\'a pas transmis votre identité : réessayez.')
  const info = (await res.json()) as { email?: string; email_verified?: boolean; hd?: string; name?: string }
  const email = info.email?.toLowerCase() ?? ''
  if (!info.email_verified || !email.endsWith(`@${LOGIN_DOMAIN}`) || info.hd?.toLowerCase() !== LOGIN_DOMAIN) {
    throw new Error(`Connectez-vous avec votre compte @${LOGIN_DOMAIN}.`)
  }

  const user = await db.user.findUnique({ where: { email } })
  if (!user || !user.active || user.roles.length === 0) {
    throw new Error(`Le compte ${email} n'a pas accès au back-office : demandez à un administrateur de vous l'ouvrir.`)
  }
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date(), ...(user.name ? {} : { name: info.name ?? null }) } })
  const session = await encrypt({ userId: user.id, email: user.email, roles: user.roles, v: user.sessionVersion })
  return { home: homeFor(user.roles), session }
}
