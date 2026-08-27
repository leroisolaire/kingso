'use server'

import { createChatAccessSession, deleteChatAccessSession } from '@/lib/auth/chatAccess'

export type ChatAuthState = { error?: string } | undefined

export async function loginChatAccess(formData: FormData): Promise<ChatAuthState> {
  const password = String(formData.get('password') ?? '')

  if (!password) {
    return { error: 'Mot de passe requis.' }
  }

  if (password !== process.env.CHAT_ACCESS_PASSWORD) {
    return { error: 'Mot de passe incorrect.' }
  }

  await createChatAccessSession()
  return undefined
}

export async function logoutChatAccess() {
  await deleteChatAccessSession()
}
