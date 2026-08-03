import { Router } from 'express'
import type { AuthService } from '../auth/auth.service.js'
import {
  createAuthenticationMiddleware,
  createPermissionAuthorizationMiddleware,
} from '../auth/auth.middleware.js'
import { auditService } from './audit.service.js'
import { exportPatientAuditLogsHandler, listAuditLogsHandler } from './audit.controller.js'

export const createAuditRouter = (options: {
  readonly authenticationService: AuthService
}): Router => {
  const router = Router()

  router.use(createAuthenticationMiddleware(options.authenticationService))
  router.use(createPermissionAuthorizationMiddleware(options.authenticationService, ['AUDITOR']))

  router.get('/', listAuditLogsHandler(auditService))
  router.post('/patient-export-requests', exportPatientAuditLogsHandler(auditService))

  return router
}
