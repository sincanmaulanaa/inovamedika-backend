import type { RequestHandler } from 'express'

import { DomainError } from '../../http/domain-error.js'
import { sendSuccess } from '../../http/response.js'
import type { ReadinessCheck } from './health.repository.js'

export const livenessHandler: RequestHandler = (_request, response) => {
  sendSuccess(response, { status: 'alive' }, 'Layanan tersedia')
}

export const createReadinessHandler = (checkReadiness: ReadinessCheck): RequestHandler => {
  return async (_request, response, next): Promise<void> => {
    try {
      await checkReadiness()
    } catch {
      next(
        new DomainError(
          'SERVICE_NOT_READY',
          503,
          'Layanan belum siap digunakan. Coba lagi beberapa saat lagi.',
        ),
      )
      return
    }

    sendSuccess(response, { status: 'ready' }, 'Layanan siap digunakan')
  }
}
