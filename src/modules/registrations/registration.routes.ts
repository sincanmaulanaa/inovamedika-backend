import { Router } from 'express'

import {
  createAuthenticationMiddleware,
  createRoleAuthorizationMiddleware,
} from '../auth/auth.middleware.js'
import type { AuthService } from '../auth/auth.service.js'
import {
  createRegistrationHandler,
  getRegistrationHandler,
  listRegistrationsHandler,
  updateRegistrationHandler,
} from './registration.controller.js'
import type { RegistrationService } from './registration.service.js'

interface CreateRegistrationRouterInput {
  readonly authenticationService: AuthService
  readonly service: RegistrationService
}

const registrationMutationRoles = ['ADMINISTRATOR', 'REGISTRATION_OFFICER'] as const
const registrationViewRoles = ['ADMINISTRATOR', 'REGISTRATION_OFFICER', 'DOCTOR'] as const

export const createRegistrationRouter = ({
  authenticationService,
  service,
}: CreateRegistrationRouterInput): Router => {
  const router = Router()

  router.use(createAuthenticationMiddleware(authenticationService))

  router.get(
    '/',
    createRoleAuthorizationMiddleware(authenticationService, registrationViewRoles),
    listRegistrationsHandler(service),
  )
  router.get(
    '/:id',
    createRoleAuthorizationMiddleware(authenticationService, registrationViewRoles),
    getRegistrationHandler(service),
  )
  router.post(
    '/',
    createRoleAuthorizationMiddleware(authenticationService, registrationMutationRoles),
    createRegistrationHandler(service),
  )
  router.put(
    '/:id',
    createRoleAuthorizationMiddleware(authenticationService, registrationMutationRoles),
    updateRegistrationHandler(service),
  )

  return router
}
