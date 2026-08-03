import { Router } from 'express'

import {
  createAuthenticationMiddleware,
  createRoleAuthorizationMiddleware,
} from '../auth/auth.middleware.js'
import type { AuthService } from '../auth/auth.service.js'
import {
  amendMedicalRecordHandler,
  createMedicalRecordHandler,
  finalizeMedicalRecordHandler,
  getMedicalRecordHandler,
  listMedicalRecordsHandler,
  updateMedicalRecordHandler,
  createCorrectionRequestHandler,
  approveCorrectionRequestHandler,
} from './medical-record.controller.js'
import type { MedicalRecordService } from './medical-record.service.js'

interface CreateMedicalRecordRouterInput {
  readonly authenticationService: AuthService
  readonly service: MedicalRecordService
}

const medicalRecordRoles = ['DOCTOR'] as const

export const createMedicalRecordRouter = ({
  authenticationService,
  service,
}: CreateMedicalRecordRouterInput): Router => {
  const router = Router()

  router.use(createAuthenticationMiddleware(authenticationService))

  router.post(
    '/correction-requests/:id/approve',
    createRoleAuthorizationMiddleware(authenticationService, ['ADMINISTRATOR']),
    approveCorrectionRequestHandler(service),
  )

  router.use(createRoleAuthorizationMiddleware(authenticationService, medicalRecordRoles))

  router.get('/', listMedicalRecordsHandler(service))
  router.post('/', createMedicalRecordHandler(service))
  router.get('/:id', getMedicalRecordHandler(service))
  router.put('/:id', updateMedicalRecordHandler(service))
  router.post('/:id/amend', amendMedicalRecordHandler(service))
  router.post('/:id/finalize', finalizeMedicalRecordHandler(service))
  router.post('/:id/correction-requests', createCorrectionRequestHandler(service))

  return router
}
