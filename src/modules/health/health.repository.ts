import type { PrismaClient } from '../../generated/prisma/client.js'

export type ReadinessCheck = () => Promise<void>

interface MigrationStateRow {
  incompleteCount: bigint
}

export const createDatabaseReadinessCheck = (database: PrismaClient): ReadinessCheck => {
  return async (): Promise<void> => {
    const migrationState = await database.$queryRaw<MigrationStateRow[]>`
      select count(*)::bigint as "incompleteCount"
      from "_prisma_migrations"
      where finished_at is null
        and rolled_back_at is null
    `
    const incompleteCount = migrationState[0]?.incompleteCount

    if (incompleteCount === undefined || incompleteCount > 0n) {
      throw new Error('Database migration state is not ready')
    }

    await database.users.findFirst({ select: { id: true } })
  }
}
