import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

function createClient() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set. Vérifiez .env.local ou les secrets GitHub.')
  }
  // Sur Vercel, plusieurs instances tournent en parallèle et le pooler Supabase limite le nombre
  // de clients : chaque instance garde peu de connexions et rend vite celles qui sont inutilisées.
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DATABASE_POOL_MAX ?? 3),
    idleTimeoutMillis: 10_000,
  })
  return new PrismaClient({ adapter })
}

export const db = globalForPrisma.prisma ?? createClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
