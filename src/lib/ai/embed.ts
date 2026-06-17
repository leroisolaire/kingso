import { VoyageAIClient } from 'voyageai'

const voyage = new VoyageAIClient({ apiKey: process.env.VOYAGE_API_KEY })

export async function generateEmbedding(text: string, retries = 3): Promise<number[]> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await voyage.embed({ input: [text], model: 'voyage-3' })
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
