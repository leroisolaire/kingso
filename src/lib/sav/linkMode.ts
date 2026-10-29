// Lien personnel du client : un seul lien et un seul chat, Kingso s'adapte au dossier. Sans dépendance serveur.
//   help     « Kingso peut aider » : il guide le client pour résoudre le problème lui-même
//   complete tous les autres cas (intervention, relance, administratif, autre produit) : il aide le client à
//            compléter son dossier (photos, précisions) pour notre équipe, sans proposer de dépannage

export type CaseLinkMode = 'help' | 'complete'

export function caseLinkMode(c: { category: string; emailTemplate?: string | null }): CaseLinkMode {
  return c.category === 'SELF_HELP' || c.emailTemplate === 'SELF_HELP' ? 'help' : 'complete'
}

/** Texte du bouton dans l'email au client. */
export const LINK_BUTTON_LABELS: Record<CaseLinkMode, string> = {
  help: 'Résoudre mon problème avec Kingso',
  complete: 'Compléter mon dossier avec Kingso',
}
