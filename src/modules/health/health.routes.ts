import { Router } from 'express'

import { createReadinessHandler, livenessHandler } from './health.controller.js'
import type { ReadinessCheck } from './health.repository.js'

export const createHealthRouter = (checkReadiness: ReadinessCheck): Router => {
  const router = Router()

  router.get('/live', livenessHandler)
  router.get('/ready', createReadinessHandler(checkReadiness))

  return router
}
