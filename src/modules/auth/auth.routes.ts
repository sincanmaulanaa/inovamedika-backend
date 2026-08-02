import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'

import { DomainError } from '../../http/domain-error.js'
import { authPolicy } from './auth.constants.js'
import { createLoginHandler, createLogoutHandler, createRefreshHandler } from './auth.controller.js'
import { createTrustedOriginMiddleware, csrfProtectionMiddleware } from './auth.middleware.js'
import type { AuthService } from './auth.service.js'

interface CreateAuthRouterInput {
  readonly allowedOrigins: readonly string[]
  readonly service: AuthService
}

export const createAuthRouter = ({ allowedOrigins, service }: CreateAuthRouterInput): Router => {
  const router = Router()
  const trustedOrigin = createTrustedOriginMiddleware(allowedOrigins)
  const loginRateLimiter = rateLimit({
    handler: (_request, _response, next) => {
      next(
        new DomainError(
          'LOGIN_RATE_LIMITED',
          429,
          'Terlalu banyak percobaan masuk. Tunggu beberapa menit lalu coba lagi.',
        ),
      )
    },
    legacyHeaders: false,
    limit: authPolicy.loginRateLimit,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-8',
    windowMs: authPolicy.loginRateLimitWindowMs,
  })

  router.post('/login', loginRateLimiter, createLoginHandler(service))
  router.post('/refresh', trustedOrigin, csrfProtectionMiddleware, createRefreshHandler(service))
  router.post('/logout', trustedOrigin, csrfProtectionMiddleware, createLogoutHandler(service))

  return router
}
