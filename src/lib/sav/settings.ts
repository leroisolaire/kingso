import 'server-only'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db/client'
import { DEFAULT_SMS_TEXT } from './smsText'

// Réglages de l'espace SAV (modifiables dans le back-office).

export interface SavSettings {
  /** Interrupteur général : plus aucun email ne part tant qu'il est activé */
  paused: boolean
  /** Délai d'envoi après l'appel (minutes), avec une petite variation pour ne pas paraître automatique */
  sendDelayMinutes: number
  /** Sans clic sur le lien : passage « À rappeler » après ce délai (heures) */
  noClickHoursUrgent: number // pas de chauffage / pas d'eau chaude
  noClickHours: number
  /** Client parti de son chat sans « résolu » ni « être rappelé » : « À rappeler » après ce délai (minutes) */
  chatAwayMinutes: number
  /** Heure limite d'envoi des emails « Kingso peut aider » (le client peut se dépanner le soir) */
  selfHelpLastHour: number
  /** Autres emails : heures de bureau, du lundi au vendredi */
  officeStartHour: number
  officeEndHour: number
  /** Chat à utiliser selon le produit (slug) */
  productChats: Record<string, string>
  senderEmail: string
  senderName: string
  signature: string
  /** SMS d'accusé de réception : nom affiché (11 caractères max) et texte ({{lien}} = lien personnel) */
  smsSender: string
  smsText: string
  /** Dossier Drive du fichier client (export Extrabat), hors base documentaire */
  clientFolderId: string
}

export const DEFAULT_SAV_SETTINGS: SavSettings = {
  paused: true, // activé au départ : l'équipe lance les envois quand tout est prêt
  sendDelayMinutes: 30,
  noClickHoursUrgent: 4,
  noClickHours: 24,
  chatAwayMinutes: 30,
  selfHelpLastHour: 21,
  officeStartHour: 8,
  officeEndHour: 18,
  productChats: { PAC: 'pac', PV: 'pv', BATTERIE: 'pv' },
  senderEmail: 'sav@leroisolaire.fr',
  senderName: 'SAV Le Roi Solaire',
  signature: "L'équipe SAV Le Roi Solaire",
  smsSender: 'RoiSolaire',
  smsText: DEFAULT_SMS_TEXT,
  clientFolderId: '',
}

const KEY = 'sav'

export async function getSavSettings(): Promise<SavSettings> {
  const row = await db.appSetting.findUnique({ where: { key: KEY } })
  return { ...DEFAULT_SAV_SETTINGS, ...((row?.value as Partial<SavSettings> | null) ?? {}) }
}

export async function updateSavSettings(patch: Partial<SavSettings>): Promise<SavSettings> {
  const next = { ...(await getSavSettings()), ...patch }
  await db.appSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: next as unknown as Prisma.InputJsonValue },
    update: { value: next as unknown as Prisma.InputJsonValue },
  })
  return next
}
