import { defineConfig } from 'prisma/config'
import path from 'node:path'

process.loadEnvFile(path.resolve(process.cwd(), '.env'))

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL!,
  },
  experimental: {
    externalTables: true,
  },
  migrations: {
    initShadowDb: 'CREATE EXTENSION IF NOT EXISTS vector;',
  },
})
