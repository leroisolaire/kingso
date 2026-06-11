// TODO: Installer le SDK Anthropic : npm install @anthropic-ai/sdk
// TODO: Ajouter ANTHROPIC_API_KEY dans .env.local
// TODO: Implémenter le streaming avec ReadableStream pour l'API route /api/chat

import type { ChatMessage } from '@/types/chat'

export interface KingsoResponse {
  content: string
  documentsUsed: string[]
}

export async function askKingso(
  userMessage: string,
  context: string,
  documentIds: string[]
): Promise<KingsoResponse> {
  // TODO: Remplacer par un appel réel à l'API Claude :
  //
  // const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  // const response = await anthropic.messages.create({
  //   model: 'claude-opus-4-8',
  //   max_tokens: 1024,
  //   system: buildSystemPrompt(context),
  //   messages: [{ role: 'user', content: userMessage }],
  // })
  // return { content: response.content[0].text, documentsUsed: documentIds }

  await new Promise((resolve) => setTimeout(resolve, 1200))

  return {
    content: "Je suis encore en apprentissage mais j'apprends très vite ! Je pourrai répondre à vos questions bientôt !",
    documentsUsed: [],
  }
}

export function buildConversationHistory(messages: ChatMessage[]) {
  // TODO: Formater l'historique pour l'API Anthropic (rôles 'user' / 'assistant')
  return messages.map((m) => ({
    role: m.role === 'USER' ? 'user' : 'assistant',
    content: m.content,
  }))
}
