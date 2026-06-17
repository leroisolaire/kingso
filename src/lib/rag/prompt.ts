// Construction du prompt système envoyé à Claude avec le contexte documentaire.

import type { SearchResult } from './search'

export function buildSystemPrompt(results: SearchResult[]): string {
  // TODO: Affiner le prompt au fil des tests pour améliorer la précision des réponses.

  const context = results
    .map((r, i) => `[Document ${i + 1}] ${r.title}\n${r.content}`)
    .join('\n\n---\n\n')

  return `Tu es Kingso, l'assistant intelligent de Le Roi Solaire.

Règles absolues :
1. Tu réponds UNIQUEMENT en te basant sur les documents fournis ci-dessous.
2. Si la réponse n'est pas dans les documents, tu réponds clairement : "Je n'ai pas trouvé cette information dans notre documentation. Veuillez contacter notre équipe."
3. Tu ne fais pas de suppositions ni d'inventions.
4. Tu réponds en français, de manière concise et professionnelle.
5. Si tu utilises plusieurs documents, tu synthétises l'information.

Documents disponibles :
---
${context}
---

Réponds maintenant à la question de l'utilisateur en respectant strictement ces règles.`
}

export function buildNoContextPrompt(): string {
  return `Tu es Kingso, l'assistant de Le Roi Solaire.
Aucun document pertinent n'a été trouvé pour cette question.
Réponds que tu n'as pas l'information et invite l'utilisateur à contacter l'équipe.`
}
