export type AssistantAudience = 'CUSTOMER' | 'STAFF'
export type AssistantAccess = 'PUBLIC' | 'PASSWORD'
export type AssistantStatus = 'DRAFT' | 'ACTIVE' | 'DISABLED'

export interface Assistant {
  id: string
  slug: string
  previousSlugs: string[]
  name: string
  status: AssistantStatus
  audience: AssistantAudience
  access: AssistantAccess
  hasPassword: boolean
  welcomeMessage: string
  startButtons: string[]
  suggestedQuestions: string[]
  instructions: string
  categoryIds: string[]
  webSourceIds: string[]
  escalationEnabled: boolean
  escalationEmails: string[]
  attachmentsEnabled: boolean
  dailyMessageLimit: number
  createdAt: string
  updatedAt: string
}

export interface AssistantSummary extends Assistant {
  conversationCount: number
  escalationCount: number
}

/** Données envoyées par le formulaire du back-office. `accessPassword` vide = inchangé. */
export interface AssistantInput {
  slug: string
  name: string
  status: AssistantStatus
  audience: AssistantAudience
  access: AssistantAccess
  accessPassword?: string
  welcomeMessage: string
  startButtons: string[]
  suggestedQuestions: string[]
  instructions: string
  categoryIds: string[]
  webSourceIds: string[]
  escalationEnabled: boolean
  escalationEmails: string[]
  attachmentsEnabled: boolean
  dailyMessageLimit: number
}

/** Ce que la page publique /{slug} reçoit — aucune donnée sensible. */
export interface PublicAssistant {
  slug: string
  name: string
  audience: AssistantAudience
  welcomeMessage: string
  startButtons: string[]
  suggestedQuestions: string[]
  escalationEnabled: boolean
  attachmentsEnabled: boolean
  isPreview: boolean
}
