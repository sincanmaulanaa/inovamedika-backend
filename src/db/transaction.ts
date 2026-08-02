import type { Prisma } from '../generated/prisma/client.js'

import { prisma } from './prisma.js'

const retryableSqlStates = new Set(['40001', '40P01'])

const waitForRetry = async (attempt: number): Promise<void> => {
  const delayMs = 20 * 2 ** attempt + Math.floor(Math.random() * 20)
  await new Promise((resolve) => setTimeout(resolve, delayMs))
}

const isRetryableDatabaseError = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false
  }

  return (
    error.code === 'P2034' || (typeof error.code === 'string' && retryableSqlStates.has(error.code))
  )
}

export const withTransaction = async <Result>(
  operation: (transaction: Prisma.TransactionClient) => Promise<Result>,
  maxAttempts = 3,
): Promise<Result> => {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (transaction) => {
          await transaction.$executeRaw`set local statement_timeout = '5s'`
          await transaction.$executeRaw`set local lock_timeout = '2s'`
          return operation(transaction)
        },
        {
          maxWait: 2_000,
          timeout: 5_000,
        },
      )
    } catch (error) {
      if (attempt + 1 < maxAttempts && isRetryableDatabaseError(error)) {
        await waitForRetry(attempt)
        continue
      }

      throw error
    }
  }

  throw new Error('Transaction retry loop exhausted unexpectedly')
}
