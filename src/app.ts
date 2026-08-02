import compression from 'compression'
import cookieParser from 'cookie-parser'
import cors, { type CorsOptions } from 'cors'
import express, { type Express, type Request, type Response } from 'express'
import helmet from 'helmet'
import { pinoHttp } from 'pino-http'

import { env } from './config/env.js'
import { logger } from './config/logger.js'
import { prisma } from './db/prisma.js'
import { DomainError } from './http/domain-error.js'
import { errorHandler } from './http/error-handler.js'
import { notFoundHandler } from './http/not-found.js'
import { getRequestId, requestContextMiddleware } from './http/request-context.js'
import {
  createDatabaseReadinessCheck,
  type ReadinessCheck,
} from './modules/health/health.repository.js'
import { createHealthRouter } from './modules/health/health.routes.js'

interface AppOptions {
  allowedOrigins?: readonly string[]
  readinessCheck?: ReadinessCheck
}

interface HttpLogObject {
  responseTime?: unknown
}

const getRouteTemplate = (request: Request): string => {
  const route = request.route as { path?: unknown } | undefined

  return typeof route?.path === 'string' ? `${request.baseUrl}${route.path}` : request.path
}

const getDurationMs = (logObject: unknown): number | undefined => {
  if (typeof logObject !== 'object' || logObject === null) {
    return undefined
  }

  const { responseTime } = logObject as HttpLogObject
  return typeof responseTime === 'number' ? responseTime : undefined
}

const createHttpLogObject = (request: Request, response: Response, logObject: unknown) => {
  return {
    requestId: getRequestId(),
    method: request.method,
    route: getRouteTemplate(request),
    status: response.statusCode,
    durationMs: getDurationMs(logObject),
  }
}

const createCorsOptions = (allowedOrigins: readonly string[]): CorsOptions => {
  const allowlist = new Set(allowedOrigins)

  return {
    credentials: true,
    origin: (origin, callback) => {
      if (origin === undefined || allowlist.has(origin)) {
        callback(null, true)
        return
      }

      callback(new DomainError('CORS_ORIGIN_NOT_ALLOWED', 403, 'Origin is not allowed'))
    },
  }
}

export const createApp = (options: AppOptions = {}): Express => {
  const app = express()
  const allowedOrigins = options.allowedOrigins ?? [env.frontendOrigin]
  const readinessCheck = options.readinessCheck ?? createDatabaseReadinessCheck(prisma)

  app.disable('x-powered-by')

  app.use(requestContextMiddleware)
  app.use(
    pinoHttp<Request, Response>({
      logger,
      autoLogging: env.nodeEnv !== 'test',
      quietReqLogger: true,
      quietResLogger: true,
      genReqId: () => getRequestId(),
      customLogLevel: (_request, response, error) => {
        if (error !== undefined || response.statusCode >= 500) {
          return 'error'
        }

        return response.statusCode >= 400 ? 'warn' : 'info'
      },
      customSuccessMessage: () => 'HTTP request completed',
      customErrorMessage: () => 'HTTP request failed',
      customSuccessObject: (request, response, logObject: unknown) => {
        return createHttpLogObject(request, response, logObject)
      },
      customErrorObject: (request, response, error, logObject: unknown) => {
        return {
          ...createHttpLogObject(request, response, logObject),
          error: { name: error.name },
        }
      },
    }),
  )
  app.use(helmet())
  app.use(cors(createCorsOptions(allowedOrigins)))
  app.use(compression())
  app.use(express.json({ limit: '100kb' }))
  app.use(cookieParser())

  app.use('/api/v1/health', createHealthRouter(readinessCheck))

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}

export const app = createApp()
