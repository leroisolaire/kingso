import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

function createClient() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set. Vérifiez .env.local ou les secrets GitHub.')
  }
  // TLS : le pooler Supabase présente un certificat signé par l'autorité de Supabase, inconnue de
  // Node. pg traite désormais sslmode=require comme verify-full et refuse la connexion. On chiffre
  // donc sans vérifier la chaîne, réglé ici plutôt que dans l'URL : les paramètres ssl* de l'URL
  // écraseraient cette option, on les retire.
  const url = new URL(process.env.DATABASE_URL)
  for (const param of ['sslmode', 'uselibpqcompat', 'sslrootcert', 'sslcert', 'sslkey']) url.searchParams.delete(param)

  // Sur Vercel, plusieurs instances tournent en parallèle et le pooler Supabase limite le nombre
  // de clients : chaque instance garde peu de connexions et rend vite celles qui sont inutilisées.
  const adapter = new PrismaPg({
    connectionString: url.toString(),
    ssl: { rejectUnauthorized: false },
    max: Number(process.env.DATABASE_POOL_MAX ?? 3),
    idleTimeoutMillis: 10_000,
  })
  return new PrismaClient({ adapter })
}

export const db = globalForPrisma.prisma ?? createClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
