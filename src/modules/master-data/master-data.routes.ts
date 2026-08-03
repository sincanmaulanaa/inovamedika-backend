import { Router } from 'express'

import { createAuthenticationMiddleware } from '../auth/auth.middleware.js'
import type { AuthService } from '../auth/auth.service.js'
import {
  listDoctorsHandler,
  listPayersHandler,
  listPolyclinicsHandler,
  searchMedicationsHandler,
} from './master-data.controller.js'
import { masterDataRepository, type MasterDataRepository } from './master-data.repository.js'

interface CreateMasterDataRouterInput {
  readonly authenticationService: AuthService
  readonly repository?: MasterDataRepository
}

export const createMasterDataRouter = ({
  authenticationService,
  repository = masterDataRepository,
}: CreateMasterDataRouterInput): Router => {
  const router = Router()

  router.use(createAuthenticationMiddleware(authenticationService))
  router.get('/doctors', listDoctorsHandler(repository))
  router.get('/polyclinics', listPolyclinicsHandler(repository))
  router.get('/payers', listPayersHandler(repository))
  router.get('/medications', searchMedicationsHandler(repository))

  return router
}
