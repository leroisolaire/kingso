// Libellés partagés (back-office) — sans dépendance serveur : utilisables dans les composants client.
import type { SavCategory, SavSource, SavStatus } from '@prisma/client'

/** Origine du dossier, affichée sur la liste. */
export const SOURCE_LABELS: Record<SavSource, string> = {
  VOICEMAIL: '☎ Répondeur',
  CHAT: '💬 Demande depuis un chat',
  MANUAL: '✍ Saisi par l’équipe',
}

export const STATUS_LABELS: Record<SavStatus, string> = {
  NEW: 'À traiter',
  WAITING: 'Email envoyé',
  IN_CHAT: 'Avec Kingso',
  TO_CALL: 'À rappeler',
  TO_SCHEDULE: 'À planifier',
  SCHEDULED: 'Planifié',
  TECH_REPORT: 'Retour technicien',
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
  TECH_REPORT: 'bg-orange-200 text-orange-900',
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
  { key: 'email-envoye', label: 'Email envoyé', statuses: ['WAITING'] },
  { key: 'kingso', label: 'Avec Kingso', statuses: ['IN_CHAT'] },
  { key: 'planifies', label: 'Planifiés', statuses: ['SCHEDULED'] },
  { key: 'retour-technicien', label: 'Retour technicien', statuses: ['TECH_REPORT'] },
  { key: 'resolus', label: 'Résolus', statuses: ['RESOLVED'] },
  { key: 'clos', label: 'Clos', statuses: ['CLOSED'] },
]

/** Issues du retour technicien, et statut que prend alors le dossier. */
export const TECH_OUTCOMES = {
  RESOLVED: { label: 'Réparé / résolu', icon: '✅', status: 'RESOLVED' },
  REVISIT: { label: 'À repasser (pièce, 2e visite)', icon: '🔁', status: 'TO_SCHEDULE' },
  ABSENT: { label: 'Client absent', icon: '🚪', status: 'TO_CALL' },
  QUOTE: { label: 'Devis à faire', icon: '📄', status: 'TO_CALL' },
} as const satisfies Record<string, { label: string; icon: string; status: SavStatus }>
export type TechOutcome = keyof typeof TECH_OUTCOMES

/** Couleurs des techniciens sur le planning (dans l'ordre de la liste des techniciens). */
export const TECH_COLORS = [
  { block: 'bg-emerald-100 border-emerald-500 text-emerald-950', dot: 'bg-emerald-500' },
  { block: 'bg-violet-100 border-violet-500 text-violet-950', dot: 'bg-violet-500' },
  { block: 'bg-pink-100 border-pink-500 text-pink-950', dot: 'bg-pink-500' },
  { block: 'bg-lime-100 border-lime-600 text-lime-950', dot: 'bg-lime-600' },
  { block: 'bg-cyan-100 border-cyan-600 text-cyan-950', dot: 'bg-cyan-600' },
  { block: 'bg-fuchsia-100 border-fuchsia-500 text-fuchsia-950', dot: 'bg-fuchsia-500' },
  { block: 'bg-yellow-100 border-yellow-500 text-yellow-950', dot: 'bg-yellow-500' },
]
// Rendez-vous SAV sans technicien : bleu franc, bien distinct des autres événements de l'agenda (gris)
export const NO_TECH_COLOR = { block: 'bg-blue-600 border-blue-900 text-white', dot: 'bg-blue-600' }
