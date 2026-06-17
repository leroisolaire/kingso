import { VoyageAIClient } from 'voyageai'

const voyage = new VoyageAIClient({ apiKey: process.env.VOYAGE_API_KEY })

export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await voyage.embed({
    input: [text],
    model: 'voyage-3',
  })
  return response.data![0].embedding as number[]
}

export function embeddingToSql(embedding: number[]): string {
  return `[${embedding.join(',')}]`
}
