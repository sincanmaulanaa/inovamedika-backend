import { Router } from 'express'

import {
  createAuthenticationMiddleware,
  createRoleAuthorizationMiddleware,
} from '../auth/auth.middleware.js'
import type { AuthService } from '../auth/auth.service.js'
import {
  cancelPrescriptionHandler,
  createPrescriptionHandler,
  finalizePrescriptionHandler,
  getPrescriptionHandler,
  listPrescriptionsHandler,
  updatePrescriptionHandler,
} from './prescription.controller.js'
import type { PrescriptionService } from './prescription.service.js'

interface CreatePrescriptionRouterInput {
  readonly authenticationService: AuthService
  readonly service: PrescriptionService
}

const prescriptionRoles = ['DOCTOR'] as const

export const createPrescriptionRouter = ({
  authenticationService,
  service,
}: CreatePrescriptionRouterInput): Router => {
  const router = Router()

  router.use(createAuthenticationMiddleware(authenticationService))
  router.use(createRoleAuthorizationMiddleware(authenticationService, prescriptionRoles))

  router.get('/', listPrescriptionsHandler(service))
  router.post('/', createPrescriptionHandler(service))
  router.get('/:id', getPrescriptionHandler(service))
  router.put('/:id', updatePrescriptionHandler(service))
  router.post('/:id/finalize', finalizePrescriptionHandler(service))
  router.post('/:id/cancel', cancelPrescriptionHandler(service))

  return router
}
