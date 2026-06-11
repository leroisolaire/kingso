// TODO: Choisir un provider d'embeddings (ex. Voyage AI, OpenAI text-embedding-3-small)
// TODO: Ajouter la clé API correspondante dans .env.local
// TODO: Stocker les vecteurs dans PostgreSQL avec l'extension pgvector

export type Embedding = number[]

export async function generateEmbedding(text: string): Promise<Embedding> {
  // TODO: Remplacer par un vrai appel d'embedding :
  //
  // const response = await fetch('https://api.voyageai.com/v1/embeddings', {
  //   method: 'POST',
  //   headers: { Authorization: `Bearer ${process.env.VOYAGE_API_KEY}` },
  //   body: JSON.stringify({ input: text, model: 'voyage-3' }),
  // })
  // const data = await response.json()
  // return data.data[0].embedding

  // Vecteur fictif de dimension 1024
  return Array.from({ length: 1024 }, () => Math.random())
}

export async function generateDocumentEmbedding(
  title: string,
  content: string
): Promise<Embedding> {
  // Concatène titre + contenu pour un embedding plus riche
  return generateEmbedding(`${title}\n\n${content}`)
}
