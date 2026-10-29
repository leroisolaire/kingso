// Compétences et secteur des intervenants (techniciens SAV et poseurs). Sans dépendance serveur : utilisé aussi
// dans les composants client (fiche intervenant, suggestions du planning).

export const SKILLS = {
  PAC: 'PAC air-eau',
  CLIM: 'Clim / PAC air-air',
  CET: 'Ballon thermodynamique',
  PV: 'Photovoltaïque',
  BATTERIE: 'Batterie',
  ELEC: 'Électricité',
  PLOMBERIE: 'Plomberie / hydraulique',
} as const
export type Skill = keyof typeof SKILLS

export const isSkill = (value: unknown): value is Skill => typeof value === 'string' && value in SKILLS

/** Niveau dans une compétence, de 1 à 5. */
export const SKILL_LEVEL_LABELS: Record<number, string> = {
  1: 'Débutant',
  2: 'Notions',
  3: 'Autonome',
  4: 'Confirmé',
  5: 'Expert',
}

/** Compétences et niveaux (null : compétence cochée mais pas encore notée). */
export type SkillLevels = Partial<Record<Skill, number | null>>

/**
 * Lecture de Technician.skills : « PAC:4 » (noté) ou « PAC » (ancienne forme, pas noté). Une compétence pas notée
 * prend la difficulté maximale de l'ancienne fiche, si elle en avait une.
 */
export function parseSkillLevels(list: readonly string[], fallback?: number | null): SkillLevels {
  const out: SkillLevels = {}
  for (const item of list) {
    const [key, level] = item.split(':')
    if (!isSkill(key)) continue
    const n = Number(level)
    out[key] = Number.isInteger(n) && n >= 1 && n <= 5 ? n : fallback && fallback >= 1 && fallback <= 5 ? fallback : null
  }
  return out
}

/** Écriture de Technician.skills : ['PAC:4', 'CLIM']. Accepte { PAC: 4, CLIM: null } (entrée de la page Intervenants). */
export function serializeSkillLevels(input: unknown): string[] {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return []
  return Object.entries(input as Record<string, unknown>)
    .filter(([key]) => isSkill(key))
    .map(([key, level]) => {
      const n = Number(level)
      return Number.isInteger(n) && n >= 1 && n <= 5 ? `${key}:${n}` : key
    })
}

export const KIND_LABELS = { SAV: 'Technicien SAV', POSEUR: 'Poseur' } as const
export type TechnicianKind = keyof typeof KIND_LABELS

/** Compétence demandée par un dossier : le produit repéré par Kingso (PAC, CLIM, CET, PV, BATTERIE). */
export function caseSkill(product: string | null | undefined): Skill | null {
  return product && product !== 'ELEC' && product !== 'PLOMBERIE' && isSkill(product) ? product : null
}

const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** Morceaux du secteur : « 13, 83 ; Aubagne » → ['13', '83', 'aubagne']. */
export function sectorParts(sector: string | null | undefined): string[] {
  return (sector ?? '').split(/[,;/\n]+/).map((p) => fold(p).replace(/ /g, '')).filter(Boolean)
}

/**
 * Le dossier est-il dans le secteur ? Département (« 13 », « 2A »), code postal (« 13400 ») ou commune (« Aubagne »).
 * null : pas de secteur sur la fiche, ou ni code postal ni commune sur le dossier.
 */
export function inSector(sector: string | null | undefined, postalCode: string | null | undefined, city: string | null | undefined): boolean | null {
  const parts = sectorParts(sector)
  const cp = (postalCode ?? '').replace(/\s/g, '')
  const town = fold(city ?? '').replace(/ /g, '')
  if (!parts.length || (!cp && !town)) return null
  return parts.some((p) => {
    if (/^\d{5}$/.test(p)) return p === cp
    if (p === '2a' || p === '2b') return cp.startsWith('20') // Corse
    if (/^\d{2,3}$/.test(p)) return cp.startsWith(p)
    return p === town
  })
}

/** Repères agenda nettoyés : « mar, Jul » → ['MAR', 'JUL']. */
export function cleanCodes(input: unknown): string[] {
  const list = Array.isArray(input) ? input : typeof input === 'string' ? input.split(/[,;\s]+/) : []
  return [...new Set(list.map((c) => String(c).trim().toUpperCase()).filter((c) => c.length >= 2 && c.length <= 20))].slice(0, 10)
}

/** Le titre d'un événement de chantier cite-t-il ce repère (mot entier, sans tenir compte des majuscules) ? */
export function titleHasCode(title: string, code: string): boolean {
  const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, 'iu').test(title)
}
