import type { Request, RequestHandler } from 'express'

import { DomainError } from '../../http/domain-error.js'
import { getRequestId } from '../../http/request-context.js'
import { sendSuccess } from '../../http/response.js'
import { getAuthRequestMetadata } from '../auth/auth.middleware.js'
import type { AuthenticatedPrincipal } from '../auth/auth.types.js'
import {
  cancelPrescriptionBodySchema,
  createPrescriptionBodySchema,
  finalizePrescriptionBodySchema,
  prescriptionIdParamsSchema,
  prescriptionListQuerySchema,
  updatePrescriptionBodySchema,
} from './prescription.schema.js'
import type { PrescriptionService } from './prescription.service.js'

const getPrincipal = (request: Request): AuthenticatedPrincipal => {
  if (request.auth) return request.auth
  throw new DomainError('SESSION_EXPIRED', 401, 'Sesi Anda telah berakhir. Silakan masuk kembali.')
}

const getContext = (request: Request) => ({
  metadata: { ...getAuthRequestMetadata(request), requestId: getRequestId() },
  principal: getPrincipal(request),
})

export const createPrescriptionHandler =
  (service: PrescriptionService): RequestHandler =>
  async (request, response, next) => {
    try {
      const data = createPrescriptionBodySchema.parse(request.body)
      const record = await service.createPrescription({ ...getContext(request), data })
      sendSuccess(response.status(201), record, 'Resep berhasil dibuat')
    } catch (error) {
      next(error)
    }
  }

export const updatePrescriptionHandler =
  (service: PrescriptionService): RequestHandler =>
  async (request, response, next) => {
    try {
      const { id } = prescriptionIdParamsSchema.parse(request.params)
      const data = updatePrescriptionBodySchema.parse(request.body)
      const record = await service.updatePrescription({
        ...getContext(request),
        prescriptionId: id,
        data,
      })
      sendSuccess(response, record, 'Perubahan resep disimpan')
    } catch (error) {
      next(error)
    }
  }

export const finalizePrescriptionHandler =
  (service: PrescriptionService): RequestHandler =>
  async (request, response, next) => {
    try {
      const { id } = prescriptionIdParamsSchema.parse(request.params)
      const data = finalizePrescriptionBodySchema.parse(request.body)
      const record = await service.finalizePrescription({
        ...getContext(request),
        prescriptionId: id,
        rowVersion: data.rowVersion,
      })
      sendSuccess(response, record, 'Resep difinalisasi dan siap diambil')
    } catch (error) {
      next(error)
    }
  }

export const cancelPrescriptionHandler =
  (service: PrescriptionService): RequestHandler =>
  async (request, response, next) => {
    try {
      const { id } = prescriptionIdParamsSchema.parse(request.params)
      const data = cancelPrescriptionBodySchema.parse(request.body)
      const record = await service.cancelPrescription({
        ...getContext(request),
        prescriptionId: id,
        rowVersion: data.rowVersion,
      })
      sendSuccess(response, record, 'Resep dibatalkan')
    } catch (error) {
      next(error)
    }
  }

export const getPrescriptionHandler =
  (service: PrescriptionService): RequestHandler =>
  async (request, response, next) => {
    try {
      const { id } = prescriptionIdParamsSchema.parse(request.params)
      const record = await service.getPrescription({ ...getContext(request), prescriptionId: id })
      sendSuccess(response, record, 'Data resep tersedia')
    } catch (error) {
      next(error)
    }
  }

export const listPrescriptionsHandler =
  (service: PrescriptionService): RequestHandler =>
  async (request, response, next) => {
    try {
      const query = prescriptionListQuerySchema.parse(request.query)
      const records = await service.listPrescriptions({ ...getContext(request), query })
      sendSuccess(response, records, 'Daftar resep tersedia')
    } catch (error) {
      next(error)
    }
  }
