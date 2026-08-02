import { Router } from 'express'

import {
  createAuthenticationMiddleware,
  createRoleAuthorizationMiddleware,
} from '../auth/auth.middleware.js'
import type { AuthService } from '../auth/auth.service.js'
import {
  createPatientHandler,
  deletePatientHandler,
  getPatientHandler,
  listPatientsHandler,
  updatePatientHandler,
} from './patient.controller.js'
import type { PatientService } from './patient.service.js'

interface CreatePatientRouterInput {
  readonly authenticationService: AuthService
  readonly service: PatientService
}

const patientManagementRoles = ['ADMINISTRATOR', 'REGISTRATION_OFFICER'] as const

export const createPatientRouter = ({
  authenticationService,
  service,
}: CreatePatientRouterInput): Router => {
  const router = Router()

  router.use(createAuthenticationMiddleware(authenticationService))
  router.use(createRoleAuthorizationMiddleware(authenticationService, patientManagementRoles))
  router.get('/', listPatientsHandler(service))
  router.get('/:id', getPatientHandler(service))
  router.post('/', createPatientHandler(service))
  router.put('/:id', updatePatientHandler(service))
  router.delete('/:id', deletePatientHandler(service))

  return router
}
