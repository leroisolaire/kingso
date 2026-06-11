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

  await new Promise((resolve) => setTimeout(resolve, 3000))

  const msg = userMessage.toLowerCase()

  if (msg.includes('dylan rocher')) {
    return {
      content: "Dylan Rocher est un joueur de pétanque multiple champion du monde !",
      documentsUsed: ['doc-mock'],
    }
  }

  if (msg.includes('garantie')) {
    return {
      content: "Nos panneaux solaires bénéficient d'une garantie produit de 12 ans et d'une garantie de performance de 25 ans. En cas de défaut, Le Roi Solaire prend en charge le remplacement et la main d'œuvre.",
      documentsUsed: ['doc-garantie'],
    }
  }

  if (msg.includes('installation') || msg.includes('installer') || msg.includes('pose')) {
    return {
      content: "L'installation est réalisée par nos techniciens certifiés RGE. Elle dure en moyenne une journée pour une maison individuelle. Nous nous occupons également de toutes les démarches administratives : mairie, Enedis et assurance.",
      documentsUsed: ['doc-installation'],
    }
  }

  if (msg.includes('prix') || msg.includes('coût') || msg.includes('tarif') || msg.includes('combien')) {
    return {
      content: "Le coût d'une installation solaire dépend de la surface de votre toiture et de votre consommation. Nos solutions démarrent à partir de 7 900 € TTC, avec des aides de l'État pouvant couvrir jusqu'à 30% du montant. Je vous recommande de demander un devis personnalisé gratuit.",
      documentsUsed: ['doc-tarifs'],
    }
  }

  if (msg.includes('panneau') || msg.includes('solaire') || msg.includes('énergie') || msg.includes('electricité')) {
    return {
      content: "Le Roi Solaire propose des panneaux photovoltaïques monocristallins de haute performance, avec un rendement jusqu'à 22%. Ils fonctionnent même par temps nuageux et produisent de l'énergie dès que la lumière est présente.",
      documentsUsed: ['doc-produits'],
    }
  }

  if (msg.includes('entretien') || msg.includes('nettoyage') || msg.includes('maintenance')) {
    return {
      content: "Nos panneaux nécessitent très peu d'entretien. Un nettoyage annuel suffit dans la plupart des régions. Nous proposons également un contrat de maintenance annuel qui inclut une visite technique et un bilan de production.",
      documentsUsed: ['doc-entretien'],
    }
  }

  if (msg.includes('aide') || msg.includes('subvention') || msg.includes('prime')) {
    return {
      content: "Plusieurs aides sont disponibles : la prime à l'autoconsommation (jusqu'à 1 000 €), la TVA à 10% sur l'installation, et MaPrimeRénov' selon vos revenus. Notre équipe vous accompagne dans toutes ces démarches.",
      documentsUsed: ['doc-aides'],
    }
  }

  if (msg.includes('franchise') || msg.includes('franchisé') || msg.includes('ouvrir')) {
    return {
      content: "Le Roi Solaire propose un réseau de franchise en pleine expansion. Pour rejoindre notre réseau, contactez directement notre équipe développement. Un apport minimal et une zone géographique exclusive vous seront proposés.",
      documentsUsed: ['doc-franchise'],
    }
  }

  // Aucune réponse trouvée → confused
  return {
    content: "Je n'ai pas trouvé d'information sur ce sujet dans ma base documentaire. N'hésitez pas à contacter directement l'équipe Le Roi Solaire pour une réponse précise.",
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
