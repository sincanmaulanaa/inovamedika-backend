import type { RequestHandler } from 'express'
import { sendSuccess } from '../../http/response.js'
import type { AuditService } from './audit.service.js'
import { exportPatientAuditLogsBodySchema, listAuditLogsQuerySchema } from './audit.schema.js'
import { getAuthRequestMetadata } from '../auth/auth.middleware.js'

export const listAuditLogsHandler = (service: AuditService): RequestHandler => {
  return async (request, response, next): Promise<void> => {
    try {
      const query = listAuditLogsQuerySchema.parse(request.query)
      const context = {
        metadata: getAuthRequestMetadata(request),
        principal: request.auth!,
      }

      const result = await service.listLogs(query, context)
      sendSuccess(response, result, 'Daftar log audit tersedia')
    } catch (error) {
      next(error)
    }
  }
}

export const exportPatientAuditLogsHandler = (service: AuditService): RequestHandler => {
  return async (request, response, next): Promise<void> => {
    try {
      const body = exportPatientAuditLogsBodySchema.parse(request.body)
      const context = {
        metadata: getAuthRequestMetadata(request),
        principal: request.auth!,
      }

      await service.exportPatientAuditLogs(body, context)
      sendSuccess(response, null, 'Permintaan ekspor data pasien berhasil dicatat')
    } catch (error) {
      next(error)
    }
  }
}
