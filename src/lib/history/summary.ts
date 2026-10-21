import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { db } from '@/lib/db/client'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Titre court d'une conversation pour l'historique du back-office (Haiku 5.5, effort bas : rapide et peu cher)
const MODEL = 'claude-haiku-5-5'
const PROMPT = `Voici une conversation entre un client et Kingso, l'assistant de Le Roi Solaire.
Écris un titre de 50 à 110 caractères qui permette à l'équipe de comprendre la conversation d'un coup d'œil :
marque et modèle s'ils sont connus, problème ou question principale (avec le code erreur éventuel), et où on en est
(résolu, vérifications en cours, SAV proposé, information manquante…).
Exemple : « Hitachi Yutaki S — code 83 (pression d'eau basse), appoint d'eau conseillé, SAV proposé »
Réponds uniquement avec le titre, sur une seule ligne, sans guillemets ni point final ni commentaire.`

/** Génère (ou met à jour) le titre d'une conversation si elle a avancé depuis le dernier résumé. */
export async function refreshConversationSummary(sessionToken: string): Promise<void> {
  try {
    const entries = await db.history.findMany({
      where: { sessionToken },
      orderBy: { createdAt: 'asc' },
      select: { userMessage: true, assistantMessage: true },
    })
    if (entries.length === 0) return

    const existing = await db.conversationSummary.findUnique({ where: { sessionToken }, select: { messageCount: true } })
    if (existing?.messageCount === entries.length) return

    const transcript = entries
      .map((e) => `Client : ${e.userMessage.slice(0, 600)}\nKingso : ${e.assistantMessage.slice(0, 600)}`)
      .join('\n\n')
      .slice(-12_000) // les échanges récents disent où en est la conversation

    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1000,
      output_config: { effort: 'low' },
      messages: [{ role: 'user', content: `${PROMPT}\n\n---\n\n${transcript}` }],
    })
    // Seule la première ligne est le titre (le modèle ajoute parfois un commentaire après)
    const firstLine = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .split('\n')
      .map((line) => line.trim())
      .find(Boolean) ?? ''
    const cleaned = firstLine.replace(/^["«\s]+|["»\s.]+$/g, '')
    const summary = cleaned.length > 160 ? `${cleaned.slice(0, 157).trimEnd()}…` : cleaned
    if (!summary) return

    await db.conversationSummary.upsert({
      where: { sessionToken },
      create: { sessionToken, summary, messageCount: entries.length },
      update: { summary, messageCount: entries.length },
    })
  } catch (error) {
    // Un résumé manquant ne doit jamais casser le chat ni l'historique
    console.error('[conversation summary]', sessionToken, error instanceof Error ? error.message : error)
  }
}
