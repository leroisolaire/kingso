import { defineConfig } from 'prisma/config'
import path from 'node:path'

// En local charge .env.local — en CI (GitHub Actions) les variables viennent des secrets
for (const f of ['.env.local', '.env']) {
  try { process.loadEnvFile(path.resolve(process.cwd(), f)) } catch { /* absent en CI */ }
}

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
