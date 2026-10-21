import { VoyageAIClient, VoyageAIError } from 'voyageai'

const voyage = new VoyageAIClient({ apiKey: process.env.VOYAGE_API_KEY })

const MODEL = 'voyage-3'

/** `inputType` : 'query' pour une question, 'document' pour un contenu indexé (meilleure recherche). */
export async function generateEmbedding(text: string, inputType?: 'query' | 'document', retries = 3): Promise<number[]> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await voyage.embed({ input: [text], model: MODEL, ...(inputType ? { inputType } : {}) })
      return response.data![0].embedding as number[]
    } catch (error) {
      const is429 = error instanceof Error && error.message.includes('429')
      if (is429 && attempt < retries) {
        // Attend 22 secondes (1 slot de la limite 3 RPM) avant de réessayer
        await new Promise((r) => setTimeout(r, 22_000))
        continue
      }
      throw error
    }
  }
  throw new Error('generateEmbedding: échec après plusieurs tentatives')
}

export function embeddingToSql(embedding: number[]): string {
  return `[${embedding.join(',')}]`
}

/** Limite de débit Voyage atteinte : l'appelant réessaie plus tard au lieu de bloquer la requête. */
export class EmbeddingRateLimitError extends Error {
  constructor() {
    super('Limite de débit Voyage AI atteinte')
  }
}

/** Indexe plusieurs passages en un seul appel (jusqu'à 128 textes par appel). */
export async function generateEmbeddings(texts: string[], inputType: 'query' | 'document'): Promise<number[][]> {
  if (texts.length === 0) return []
  try {
    const response = await voyage.embed({ input: texts, model: MODEL, inputType })
    return response.data!
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
      .map((d) => d.embedding as number[])
  } catch (error) {
    if (error instanceof VoyageAIError && error.statusCode === 429) throw new EmbeddingRateLimitError()
    throw error
  }
}
