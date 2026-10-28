// Durée des interventions (choisie à la planification de chaque dossier). Sans dépendance serveur.

export const DEFAULT_DURATION_MINUTES = 120
export const DURATION_OPTIONS = [30, 60, 90, 120, 150, 180, 240, 300, 360, 480]

export function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`
}

export function isValidDuration(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 15 && (value as number) <= 12 * 60
}
