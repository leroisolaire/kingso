'use server'

import bcrypt from 'bcryptjs'
import { db } from '@/lib/db/client'
import { grantAssistantAccess } from '@/lib/auth/assistantAccess'

export type UnlockState = { error?: string } | undefined

export async function unlockAssistant(slug: string, _prev: UnlockState, formData: FormData): Promise<UnlockState> {
  const password = String(formData.get('password') ?? '')
  if (!password) return { error: 'Mot de passe requis.' }

  const assistant = await db.assistant.findUnique({
    where: { slug },
    select: { id: true, status: true, access: true, accessPassword: true },
  })
  if (!assistant || assistant.status !== 'ACTIVE' || assistant.access !== 'PASSWORD' || !assistant.accessPassword) {
    return { error: 'Chat indisponible.' }
  }
  if (!(await bcrypt.compare(password, assistant.accessPassword))) {
    return { error: 'Mot de passe incorrect.' }
  }

  await grantAssistantAccess(assistant.id)
  return undefined
}
