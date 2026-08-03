import type { AuthRequestMetadata, AuthenticatedPrincipal } from '../auth/auth.types.js'
import { auditRepository } from './audit.repository.js'
import type { ExportPatientAuditLogsBody, ListAuditLogsQuery } from './audit.schema.js'
import { mapAuditLogToItem } from './audit.mapper.js'
import type { PaginatedAuditLogs } from './audit.types.js'

export interface AuditService {
  listLogs(
    query: ListAuditLogsQuery,
    context: { readonly metadata: AuthRequestMetadata; readonly principal: AuthenticatedPrincipal },
  ): Promise<PaginatedAuditLogs>

  exportPatientAuditLogs(
    body: ExportPatientAuditLogsBody,
    context: { readonly metadata: AuthRequestMetadata; readonly principal: AuthenticatedPrincipal },
  ): Promise<void>
}

export const auditService: AuditService = {
  async listLogs(query) {
    const logs = await auditRepository.listLogs(query)
    const totalItems = await auditRepository.countLogs(query)
    const totalPages = Math.ceil(totalItems / query.limit)

    return {
      items: logs.map(mapAuditLogToItem),
      pagination: {
        page: query.page,
        limit: query.limit,
        totalItems,
        totalPages,
      },
    }
  },

  async exportPatientAuditLogs(body, context) {
    await auditRepository.logPatientExport({
      patientPublicId: body.patientId,
      userId: context.principal.internalUserId,
      username: context.principal.username,
      role: context.principal.role,
      reason: body.reason,
      requestId: context.metadata.requestId,
      ipAddress: context.metadata.ipAddress,
      userAgent: context.metadata.userAgent,
    })
  },
}
