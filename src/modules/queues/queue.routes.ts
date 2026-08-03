import { Router } from 'express'

import {
  createAuthenticationMiddleware,
  createRoleAuthorizationMiddleware,
} from '../auth/auth.middleware.js'
import type { AuthService } from '../auth/auth.service.js'
import {
  callNextQueueHandler,
  createQueueHandler,
  listQueuesHandler,
  recallQueueHandler,
  requeueQueueHandler,
  skipQueueHandler,
  startQueueHandler,
} from './queue.controller.js'
import type { QueueService } from './queue.service.js'

interface CreateQueueRouterInput {
  readonly authenticationService: AuthService
  readonly service: QueueService
}

const queueManagementRoles = ['ADMINISTRATOR', 'REGISTRATION_OFFICER', 'DOCTOR'] as const

export const createQueueRouter = ({
  authenticationService,
  service,
}: CreateQueueRouterInput): Router => {
  const router = Router()

  router.use(createAuthenticationMiddleware(authenticationService))

  router.get(
    '/',
    createRoleAuthorizationMiddleware(authenticationService, queueManagementRoles),
    listQueuesHandler(service),
  )
  router.post(
    '/',
    createRoleAuthorizationMiddleware(authenticationService, queueManagementRoles),
    createQueueHandler(service),
  )

  // Lane specific operations
  router.post(
    '/lanes/:id/call-next',
    createRoleAuthorizationMiddleware(authenticationService, queueManagementRoles),
    callNextQueueHandler(service),
  )

  // Queue specific operations
  router.post(
    '/:id/recall',
    createRoleAuthorizationMiddleware(authenticationService, queueManagementRoles),
    recallQueueHandler(service),
  )
  router.post(
    '/:id/skip',
    createRoleAuthorizationMiddleware(authenticationService, queueManagementRoles),
    skipQueueHandler(service),
  )
  router.post(
    '/:id/requeue',
    createRoleAuthorizationMiddleware(authenticationService, queueManagementRoles),
    requeueQueueHandler(service),
  )
  router.post(
    '/:id/start',
    createRoleAuthorizationMiddleware(authenticationService, queueManagementRoles),
    startQueueHandler(service),
  )

  return router
}
