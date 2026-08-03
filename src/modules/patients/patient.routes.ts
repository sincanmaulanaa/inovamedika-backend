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

  const readRoles = ['ADMINISTRATOR', 'REGISTRATION_OFFICER', 'DOCTOR'] as const

  router.use(createAuthenticationMiddleware(authenticationService))
  
  router.get('/', createRoleAuthorizationMiddleware(authenticationService, readRoles), listPatientsHandler(service))
  router.get('/:id', createRoleAuthorizationMiddleware(authenticationService, readRoles), getPatientHandler(service))
  
  router.post('/', createRoleAuthorizationMiddleware(authenticationService, patientManagementRoles), createPatientHandler(service))
  router.put('/:id', createRoleAuthorizationMiddleware(authenticationService, patientManagementRoles), updatePatientHandler(service))
  router.delete('/:id', createRoleAuthorizationMiddleware(authenticationService, patientManagementRoles), deletePatientHandler(service))

  return router
}
