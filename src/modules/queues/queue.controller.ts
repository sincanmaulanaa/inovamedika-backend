import type { Request, RequestHandler } from 'express'

import { DomainError } from '../../http/domain-error.js'
import { getRequestId } from '../../http/request-context.js'
import { sendSuccess } from '../../http/response.js'
import { getAuthRequestMetadata } from '../auth/auth.middleware.js'
import type { AuthenticatedPrincipal } from '../auth/auth.types.js'
import {
  createQueueBodySchema,
  queueIdParamsSchema,
  queueLaneIdParamsSchema,
  queueListQuerySchema,
} from './queue.schema.js'
import type { QueueService } from './queue.service.js'

const getPrincipal = (request: Request): AuthenticatedPrincipal => {
  if (request.auth) return request.auth
  throw new DomainError('SESSION_EXPIRED', 401, 'Sesi Anda telah berakhir. Silakan masuk kembali.')
}

const getContext = (request: Request) => ({
  metadata: { ...getAuthRequestMetadata(request), requestId: getRequestId() },
  principal: getPrincipal(request),
})

export const createQueueHandler =
  (service: QueueService): RequestHandler =>
  async (request, response, next) => {
    try {
      const data = createQueueBodySchema.parse(request.body)
      const queue = await service.createQueue({
        ...getContext(request),
        registrationId: data.registrationId,
      })
      sendSuccess(response.status(201), queue, 'Antrean berhasil dibuat')
    } catch (error) {
      next(error)
    }
  }

export const callNextQueueHandler =
  (service: QueueService): RequestHandler =>
  async (request, response, next) => {
    try {
      const { id: queueLaneId } = queueLaneIdParamsSchema.parse(request.params)
      const date =
        typeof request.query.date === 'string'
          ? request.query.date
          : new Date().toISOString().slice(0, 10)
      // Actually we require date query param per schema or we can default it. Let's rely on standard logic, but callNext is POST /queue-lanes/:id/call-next?date=YYYY-MM-DD
      // If not provided, assume today

      const queue = await service.callNext({ ...getContext(request), queueLaneId, date })
      sendSuccess(response, queue, 'Pasien selanjutnya dipanggil')
    } catch (error) {
      next(error)
    }
  }

export const recallQueueHandler =
  (service: QueueService): RequestHandler =>
  async (request, response, next) => {
    try {
      const { id } = queueIdParamsSchema.parse(request.params)
      const queue = await service.recall({ ...getContext(request), queueId: id })
      sendSuccess(response, queue, 'Pasien dipanggil ulang')
    } catch (error) {
      next(error)
    }
  }

export const skipQueueHandler =
  (service: QueueService): RequestHandler =>
  async (request, response, next) => {
    try {
      const { id } = queueIdParamsSchema.parse(request.params)
      const queue = await service.skip({ ...getContext(request), queueId: id })
      sendSuccess(response, queue, 'Antrean dilewati')
    } catch (error) {
      next(error)
    }
  }

export const requeueQueueHandler =
  (service: QueueService): RequestHandler =>
  async (request, response, next) => {
    try {
      const { id } = queueIdParamsSchema.parse(request.params)
      const queue = await service.requeue({ ...getContext(request), queueId: id })
      sendSuccess(response, queue, 'Antrean dikembalikan ke daftar tunggu')
    } catch (error) {
      next(error)
    }
  }

export const startQueueHandler =
  (service: QueueService): RequestHandler =>
  async (request, response, next) => {
    try {
      const { id } = queueIdParamsSchema.parse(request.params)
      const queue = await service.start({ ...getContext(request), queueId: id })
      sendSuccess(response, queue, 'Pemeriksaan dimulai')
    } catch (error) {
      next(error)
    }
  }

export const listQueuesHandler =
  (service: QueueService): RequestHandler =>
  async (request, response, next) => {
    try {
      const query = queueListQuerySchema.parse(request.query)
      const queues = await service.listQueues({ ...getContext(request), query })
      sendSuccess(response, queues, 'Daftar antrean tersedia')
    } catch (error) {
      next(error)
    }
  }
