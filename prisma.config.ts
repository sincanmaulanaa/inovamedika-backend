import 'dotenv/config'

import { defineConfig } from 'prisma/config'

const migrationDatabaseUrl = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL

if (!migrationDatabaseUrl) {
  throw new Error('MIGRATION_DATABASE_URL or DATABASE_URL must be set')
}

export default defineConfig({
  datasource: {
    url: migrationDatabaseUrl,
  },
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx scripts/seed.ts',
  },
  schema: 'prisma/schema.prisma',
})
