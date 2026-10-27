import 'server-only'
import { getCurrentUser } from '@/lib/auth/dal'

/** Nom affiché dans l'historique des dossiers pour l'utilisateur connecté. */
export async function currentAuthor(): Promise<string | null> {
  const user = await getCurrentUser().catch(() => null)
  return user ? (user.name || user.email) : null
}
