// Urgence et difficulté des dossiers, de 1 à 5. Sans dépendance serveur : utilisé aussi dans les composants client.

/** À partir de cette urgence, le dossier porte le badge « URGENT ». */
export const URGENT_FROM = 4

export const URGENCY_LABELS: Record<number, string> = {
  1: 'Peut attendre',
  2: 'Peu urgent',
  3: 'À traiter rapidement',
  4: 'Urgent',
  5: 'Très urgent',
}

export const DIFFICULTY_LABELS: Record<number, string> = {
  1: 'Très simple',
  2: 'Simple',
  3: 'Moyenne',
  4: 'Difficile',
  5: 'Très difficile',
}

/** Note valide (1 à 5), sinon null (effacée). */
export function toRating(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null
}

/** Repère court pour les listes et le planning : « 🔥4 · 🔧2 ». */
export function ratingShort(urgency: number | null, difficulty: number | null): string {
  return [urgency ? `🔥${urgency}` : '', difficulty ? `🔧${difficulty}` : ''].filter(Boolean).join(' · ')
}
