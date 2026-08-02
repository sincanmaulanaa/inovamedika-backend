import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

import { env } from '../config/env.js'
import { logger } from '../config/logger.js'
import { PrismaClient } from '../generated/prisma/client.js'

const databasePool = new Pool({
  application_name: 'inovamedika-backend',
  connectionString: env.databaseUrl,
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 30_000,
  max: env.dbPoolMax,
  query_timeout: 12_000,
  statement_timeout: 10_000,
})

databasePool.on('error', (error) => {
  logger.error({ error }, 'Unexpected idle PostgreSQL client error')
})

const adapter = new PrismaPg(databasePool)

export const prisma = new PrismaClient({ adapter })

export const closeDatabase = async (): Promise<void> => {
  await prisma.$disconnect()
  await databasePool.end()
}
