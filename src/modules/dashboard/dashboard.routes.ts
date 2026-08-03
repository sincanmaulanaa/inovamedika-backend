import { Router } from 'express'
import { createAuthenticationMiddleware } from '../auth/auth.middleware.js'
import type { AuthService } from '../auth/auth.service.js'
import { getDashboardSummaryHandler } from './dashboard.controller.js'
import { dashboardRepository, type DashboardRepository } from './dashboard.repository.js'

interface CreateDashboardRouterInput {
  readonly authenticationService: AuthService
  readonly repository?: DashboardRepository
}

export const createDashboardRouter = ({
  authenticationService,
  repository = dashboardRepository,
}: CreateDashboardRouterInput): Router => {
  const router = Router()

  router.use(createAuthenticationMiddleware(authenticationService))

  router.get('/summary', getDashboardSummaryHandler(repository))

  return router
}
