import { createServer, type Server } from 'node:http'

import { app } from './app.js'
import { env } from './config/env.js'
import { logger } from './config/logger.js'
import { closeDatabase } from './db/prisma.js'

const gracefulShutdownTimeoutMs = 10_000

const closeServer = async (server: Server): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error)
        return
      }

      resolve()
    })

    server.closeIdleConnections()
  })
}

const server = createServer(app)
let isShuttingDown = false

const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
  if (isShuttingDown) {
    server.closeAllConnections()
    return
  }

  isShuttingDown = true
  logger.info({ signal }, 'Graceful shutdown started')

  const forceShutdownTimer = setTimeout(() => {
    logger.error({ signal }, 'Graceful shutdown timed out; closing active connections')
    server.closeAllConnections()
    process.exitCode = 1
  }, gracefulShutdownTimeoutMs)
  forceShutdownTimer.unref()

  try {
    await closeServer(server)
    await closeDatabase()
    logger.info({ signal }, 'Graceful shutdown completed')
  } catch (error) {
    process.exitCode = 1
    logger.error({ error, signal }, 'Graceful shutdown failed')
  } finally {
    clearTimeout(forceShutdownTimer)
  }
}

server.listen(env.port, () => {
  logger.info({ port: env.port }, 'HTTP server listening')
})

process.once('SIGINT', () => {
  void shutdown('SIGINT')
})

process.once('SIGTERM', () => {
  void shutdown('SIGTERM')
})
