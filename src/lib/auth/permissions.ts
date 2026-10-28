// Droits du back-office selon les rôles (cumulables). Sans dépendance serveur : utilisé par le proxy,
// le menu et les pages. Le proxy refuse tout ce qui n'est pas explicitement permis.

export type UserRole = 'SUPER_ADMIN' | 'SAV' | 'PLANNING' | 'TECHNICIAN'

export const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: 'Super admin',
  SAV: 'SAV',
  PLANNING: 'Planning',
  TECHNICIAN: 'Technicien',
}

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  SUPER_ADMIN: 'Tout le back-office : documents, chats, réglages, utilisateurs',
  SAV: 'Espace SAV (dossiers, emails, rappels) et demandes SAV des chats',
  PLANNING: 'Espace SAV : interventions à planifier et planifiées, agenda complet',
  TECHNICIAN: 'Espace SAV et planning ; peut être affecté aux rendez-vous et fait le retour d’intervention',
}

/** Agenda complet (avec les autres événements de Google Agenda) ; les autres voient seulement les rendez-vous SAV. */
export function seesFullAgenda(roles: readonly string[]): boolean {
  return roles.includes('SUPER_ADMIN') || roles.includes('PLANNING')
}

/** Domaine des comptes Google autorisés à se connecter. */
export const LOGIN_DOMAIN = (process.env.LOGIN_DOMAIN ?? 'leroisolaire.fr').toLowerCase()

interface Rule {
  prefix: string
  roles: UserRole[]
  /** Méthodes concernées (toutes si absent) */
  methods?: string[]
}

// Première règle qui correspond (des plus précises aux plus générales). Super admin passe partout.
const RULES: Rule[] = [
  { prefix: '/admin/sav/reglages', roles: [] },
  { prefix: '/api/sav/settings', roles: [] },
  { prefix: '/api/sav/templates', roles: [] },
  { prefix: '/api/sav/gmail', roles: [] },
  { prefix: '/api/sav/calendar', roles: [] },
  { prefix: '/api/sav/clients', roles: ['SAV', 'PLANNING', 'TECHNICIAN'], methods: ['GET'] },
  { prefix: '/api/sav/clients', roles: [] },
  { prefix: '/admin/sav', roles: ['SAV', 'PLANNING', 'TECHNICIAN'] },
  { prefix: '/api/sav', roles: ['SAV', 'PLANNING', 'TECHNICIAN'] },
  { prefix: '/admin/escalations', roles: ['SAV', 'TECHNICIAN'] },
]

const matches = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`)

export function canAccess(roles: readonly string[], pathname: string, method = 'GET'): boolean {
  if (roles.includes('SUPER_ADMIN')) return true
  const rule = RULES.find((r) => matches(pathname, r.prefix) && (!r.methods || r.methods.includes(method.toUpperCase())))
  return Boolean(rule && rule.roles.some((role) => roles.includes(role)))
}

/** Page d'accueil du back-office selon les rôles. */
export function homeFor(roles: readonly string[]): string {
  if (roles.includes('SUPER_ADMIN')) return '/admin'
  if (roles.includes('SAV') || roles.includes('PLANNING') || roles.includes('TECHNICIAN')) return '/admin/sav'
  return '/admin/login'
}

/** Onglets de l'espace SAV visibles : le Planning ne voit que les interventions. */
export function savTabsFor(roles: readonly string[]): string[] | null {
  if (roles.includes('SUPER_ADMIN') || roles.includes('SAV') || roles.includes('TECHNICIAN')) return null // tous
  return ['a-planifier', 'planifies', 'retour-technicien']
}

/** Rôles d'une session (les anciennes sessions, d'avant les rôles, étaient celles des administrateurs). */
export function sessionRoles(payload: { roles?: unknown; role?: unknown } | undefined | null): UserRole[] {
  if (!payload) return []
  if (Array.isArray(payload.roles)) return payload.roles.filter((r): r is UserRole => r in ROLE_LABELS)
  return payload.role ? ['SUPER_ADMIN'] : []
}
