// Libellés partagés (back-office) — sans dépendance serveur : utilisables dans les composants client.
import type { SavCategory, SavStatus } from '@prisma/client'

export const STATUS_LABELS: Record<SavStatus, string> = {
  NEW: 'À traiter',
  WAITING: 'En attente du client',
  IN_CHAT: 'En cours avec Kingso',
  TO_CALL: 'À rappeler',
  TO_SCHEDULE: 'À planifier',
  SCHEDULED: 'Planifié',
  RESOLVED: 'Résolu',
  CLOSED: 'Clos',
}

export const STATUS_COLORS: Record<SavStatus, string> = {
  NEW: 'bg-amber-100 text-amber-800',
  WAITING: 'bg-sky-100 text-sky-800',
  IN_CHAT: 'bg-indigo-100 text-indigo-800',
  TO_CALL: 'bg-orange-100 text-orange-800',
  TO_SCHEDULE: 'bg-purple-100 text-purple-800',
  SCHEDULED: 'bg-teal-100 text-teal-800',
  RESOLVED: 'bg-green-100 text-green-800',
  CLOSED: 'bg-gray-100 text-gray-600',
}

export const CATEGORY_LABELS: Record<SavCategory, string> = {
  SELF_HELP: 'Kingso peut aider',
  INTERVENTION: 'Intervention nécessaire',
  ADMIN: 'Administratif',
  OTHER_PRODUCT: 'Autre produit',
  UNCLEAR: 'Pas clair',
}

export const CATEGORY_COLORS: Record<SavCategory, string> = {
  SELF_HELP: 'bg-emerald-100 text-emerald-800 ring-emerald-300',
  INTERVENTION: 'bg-orange-100 text-orange-800 ring-orange-300',
  ADMIN: 'bg-sky-100 text-sky-800 ring-sky-300',
  OTHER_PRODUCT: 'bg-violet-100 text-violet-800 ring-violet-300',
  UNCLEAR: 'bg-gray-100 text-gray-700 ring-gray-300',
}

/** Onglets de la liste des dossiers. */
export const SAV_TABS: { key: string; label: string; statuses: SavStatus[] }[] = [
  { key: 'a-traiter', label: 'À traiter', statuses: ['NEW'] },
  { key: 'a-rappeler', label: 'À rappeler', statuses: ['TO_CALL'] },
  { key: 'a-planifier', label: 'À planifier', statuses: ['TO_SCHEDULE'] },
  { key: 'kingso', label: 'Avec Kingso', statuses: ['WAITING', 'IN_CHAT'] },
  { key: 'planifies', label: 'Planifiés', statuses: ['SCHEDULED'] },
  { key: 'resolus', label: 'Résolus', statuses: ['RESOLVED'] },
  { key: 'clos', label: 'Clos', statuses: ['CLOSED'] },
]
