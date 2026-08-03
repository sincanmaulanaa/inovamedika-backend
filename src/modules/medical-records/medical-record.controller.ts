import type { Request, RequestHandler } from 'express'

import { DomainError } from '../../http/domain-error.js'
import { getRequestId } from '../../http/request-context.js'
import { sendSuccess } from '../../http/response.js'
import { getAuthRequestMetadata } from '../auth/auth.middleware.js'
import type { AuthenticatedPrincipal } from '../auth/auth.types.js'
import {
  amendMedicalRecordBodySchema,
  createMedicalRecordBodySchema,
  finalizeMedicalRecordBodySchema,
  medicalRecordIdParamsSchema,
  medicalRecordListQuerySchema,
  updateMedicalRecordBodySchema,
  createCorrectionRequestBodySchema,
  correctionRequestIdParamsSchema,
} from './medical-record.schema.js'
import type { MedicalRecordService } from './medical-record.service.js'

const getPrincipal = (request: Request): AuthenticatedPrincipal => {
  if (request.auth) return request.auth
  throw new DomainError('SESSION_EXPIRED', 401, 'Sesi Anda telah berakhir. Silakan masuk kembali.')
}

const getContext = (request: Request) => ({
  metadata: { ...getAuthRequestMetadata(request), requestId: getRequestId() },
  principal: getPrincipal(request),
})

export const createMedicalRecordHandler =
  (service: MedicalRecordService): RequestHandler =>
  async (request, response, next) => {
    try {
      const data = createMedicalRecordBodySchema.parse(request.body)
      const record = await service.createMedicalRecord({ ...getContext(request), data })
      sendSuccess(response.status(201), record, 'Rekam medis berhasil dibuat')
    } catch (error) {
      next(error)
    }
  }

export const updateMedicalRecordHandler =
  (service: MedicalRecordService): RequestHandler =>
  async (request, response, next) => {
    try {
      const { id } = medicalRecordIdParamsSchema.parse(request.params)
      const data = updateMedicalRecordBodySchema.parse(request.body)
      const record = await service.updateMedicalRecord({
        ...getContext(request),
        medicalRecordId: id,
        data,
      })
      sendSuccess(response, record, 'Perubahan rekam medis disimpan')
    } catch (error) {
      next(error)
    }
  }

export const amendMedicalRecordHandler =
  (service: MedicalRecordService): RequestHandler =>
  async (request, response, next) => {
    try {
      const { id } = medicalRecordIdParamsSchema.parse(request.params)
      const data = amendMedicalRecordBodySchema.parse(request.body)
      const record = await service.amendMedicalRecord({
        ...getContext(request),
        medicalRecordId: id,
        data,
      })
      sendSuccess(response, record, 'Koreksi rekam medis disimpan')
    } catch (error) {
      next(error)
    }
  }

export const finalizeMedicalRecordHandler =
  (service: MedicalRecordService): RequestHandler =>
  async (request, response, next) => {
    try {
      const { id } = medicalRecordIdParamsSchema.parse(request.params)
      const data = finalizeMedicalRecordBodySchema.parse(request.body)
      const record = await service.finalizeMedicalRecord({
        ...getContext(request),
        medicalRecordId: id,
        rowVersion: data.rowVersion,
      })
      sendSuccess(response, record, 'Rekam medis difinalisasi')
    } catch (error) {
      next(error)
    }
  }

export const getMedicalRecordHandler =
  (service: MedicalRecordService): RequestHandler =>
  async (request, response, next) => {
    try {
      const { id } = medicalRecordIdParamsSchema.parse(request.params)
      const record = await service.getMedicalRecord({ ...getContext(request), medicalRecordId: id })
      sendSuccess(response, record, 'Data rekam medis tersedia')
    } catch (error) {
      next(error)
    }
  }

export const listMedicalRecordsHandler =
  (service: MedicalRecordService): RequestHandler =>
  async (request, response, next) => {
    try {
      const query = medicalRecordListQuerySchema.parse(request.query)
      const records = await service.listMedicalRecords({ ...getContext(request), query })
      sendSuccess(response, records, 'Daftar rekam medis tersedia')
    } catch (error) {
      next(error)
    }
  }

export const createCorrectionRequestHandler =
  (service: MedicalRecordService): RequestHandler =>
  async (request, response, next) => {
    try {
      const { id } = await medicalRecordIdParamsSchema.parseAsync(request.params)
      const data = await createCorrectionRequestBodySchema.parseAsync(request.body)
      const principal = getPrincipal(request)

      await service.createCorrectionRequest({
        medicalRecordId: id,
        reason: data.reason,
        metadata: getAuthRequestMetadata(request),
        principal,
      })

      sendSuccess(response, { status: 'success' }, 'Permintaan koreksi berhasil dikirim.')
    } catch (error) {
      next(error)
    }
  }

export const approveCorrectionRequestHandler =
  (service: MedicalRecordService): RequestHandler =>
  async (request, response, next) => {
    try {
      const { id } = await correctionRequestIdParamsSchema.parseAsync(request.params)
      const principal = getPrincipal(request)

      await service.approveCorrectionRequest({
        correctionRequestId: id,
        metadata: getAuthRequestMetadata(request),
        principal,
      })

      sendSuccess(response, { status: 'success' }, 'Permintaan koreksi berhasil disetujui.')
    } catch (error) {
      next(error)
    }
  }
