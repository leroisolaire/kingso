import 'server-only'
import { db } from '@/lib/db/client'

/** Ajoute une ligne à l'historique du dossier (author absent = action de Kingso). */
export async function addSavEvent(caseId: string, kind: string, detail?: string | null, author?: string | null) {
  await db.savEvent.create({ data: { caseId, kind, detail: detail ?? null, author: author ?? null } })
}

export const EVENT_LABELS: Record<string, string> = {
  RECEIVED: 'Message reçu',
  FOLLOW_UP: 'Nouveau message (relance)',
  CREATED: 'Dossier créé',
  ANALYZED: 'Message analysé par Kingso',
  CLIENT_FOUND: 'Client identifié',
  CLIENT_NOT_FOUND: 'Client non identifié',
  EMAIL_PREPARED: 'Email préparé',
  EMAIL_SCHEDULED: 'Email programmé',
  EMAIL_SENT: 'Email envoyé',
  EMAIL_CANCELLED: 'Email annulé',
  EMAIL_SKIPPED: 'Pas d\'email envoyé',
  EMAIL_ERROR: 'Erreur d\'envoi',
  LINK_OPENED: 'Le client a ouvert son lien',
  CHAT_STARTED: 'Le client échange avec Kingso',
  CLIENT_LEFT: 'Le client a quitté Kingso sans conclure',
  RESOLVED_BY_CLIENT: 'Résolu par le client avec Kingso',
  CALLBACK_REQUESTED: 'Le client demande à être rappelé',
  NO_CLICK: 'Pas de clic sur le lien',
  NO_NEWS: 'Pas de nouvelles du client',
  STATUS: 'Statut modifié',
  CALL_RESOLVED: 'Résolu au téléphone',
  CALL_INTERVENTION: 'Intervention nécessaire',
  CALL_UNREACHABLE: 'Client injoignable',
  SCHEDULED: 'Rendez-vous fixé',
  PLANNING_ADDED: 'Ajouté au planning',
  PLANNING_UPDATED: 'Planning mis à jour',
  PLANNING_REMOVED: 'Retiré du planning',
  PLANNING_ERROR: 'Erreur de planning',
  NOTE: 'Note',
  EDITED: 'Dossier modifié',
}
