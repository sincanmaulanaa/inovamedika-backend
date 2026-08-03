import { z } from 'zod'

export const listAuditLogsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
  patientId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  action: z.string().optional(),
})

export type ListAuditLogsQuery = z.infer<typeof listAuditLogsQuerySchema>

export const exportPatientAuditLogsBodySchema = z.object({
  patientId: z.string().uuid(),
  reason: z.string().min(5),
})

export type ExportPatientAuditLogsBody = z.infer<typeof exportPatientAuditLogsBodySchema>
