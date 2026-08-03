import { Prisma } from '../../generated/prisma/client.js'
import { prisma } from '../../db/prisma.js'
import type { ListAuditLogsQuery } from './audit.schema.js'

export interface AuditRepository {
  listLogs(query: ListAuditLogsQuery): Promise<readonly unknown[]>
  countLogs(query: ListAuditLogsQuery): Promise<number>
  listLogsByPatient(patientId: bigint): Promise<readonly unknown[]>
  logPatientExport(params: {
    readonly patientPublicId: string
    readonly userId: bigint
    readonly username: string
    readonly role: string
    readonly reason: string
    readonly requestId: string
    readonly ipAddress?: string | undefined
    readonly userAgent?: string | undefined
  }): Promise<void>
}

export const auditRepository: AuditRepository = {
  async listLogs(query) {
    const conditions: Prisma.Sql[] = []

    if (query.startDate) {
      conditions.push(Prisma.sql`occurred_at >= ${query.startDate}::date`)
    }
    if (query.endDate) {
      conditions.push(Prisma.sql`occurred_at < (${query.endDate}::date + interval '1 day')`)
    }
    if (query.patientId) {
      conditions.push(
        Prisma.sql`patient_id = (SELECT id FROM patients WHERE public_id = ${query.patientId}::uuid)`,
      )
    }
    if (query.userId) {
      conditions.push(
        Prisma.sql`actor_user_id = (SELECT id FROM users WHERE public_id = ${query.userId}::uuid)`,
      )
    }
    if (query.action) {
      conditions.push(Prisma.sql`action = ${query.action}`)
    }

    const whereClause =
      conditions.length > 0 ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.empty

    const offset = (query.page - 1) * query.limit

    return prisma.$queryRaw`
        SELECT 
          id,
          public_id,
          occurred_at,
          clinic_timezone,
          actor_user_id,
          actor_username_snapshot,
          actor_role_snapshot,
          patient_id,
          registration_id,
          resource_type,
          resource_public_id,
          action,
          outcome,
          purpose,
          reason,
          ip_address,
          metadata
        FROM audit_logs
        ${whereClause}
        ORDER BY occurred_at DESC, id DESC
        LIMIT ${query.limit} OFFSET ${offset}
      `
  },

  async countLogs(query) {
    const conditions: Prisma.Sql[] = []

    if (query.startDate) {
      conditions.push(Prisma.sql`occurred_at >= ${query.startDate}::date`)
    }
    if (query.endDate) {
      conditions.push(Prisma.sql`occurred_at < (${query.endDate}::date + interval '1 day')`)
    }
    if (query.patientId) {
      conditions.push(
        Prisma.sql`patient_id = (SELECT id FROM patients WHERE public_id = ${query.patientId}::uuid)`,
      )
    }
    if (query.userId) {
      conditions.push(
        Prisma.sql`actor_user_id = (SELECT id FROM users WHERE public_id = ${query.userId}::uuid)`,
      )
    }
    if (query.action) {
      conditions.push(Prisma.sql`action = ${query.action}`)
    }

    const whereClause =
      conditions.length > 0 ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.empty

    const result = await prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) as count
        FROM audit_logs
        ${whereClause}
      `
    return Number(result[0]?.count ?? 0)
  },

  async listLogsByPatient(patientId: bigint) {
    return prisma.$queryRaw`
        SELECT 
          id,
          public_id,
          occurred_at,
          clinic_timezone,
          actor_user_id,
          actor_username_snapshot,
          actor_role_snapshot,
          patient_id,
          registration_id,
          resource_type,
          resource_public_id,
          action,
          outcome,
          purpose,
          reason,
          ip_address,
          metadata
        FROM audit_logs
        WHERE patient_id = ${patientId}
        ORDER BY occurred_at DESC, id DESC
      `
  },

  async logPatientExport(params) {
    await prisma.$executeRaw`
        INSERT INTO audit_logs (
          action,
          outcome,
          patient_id,
          actor_user_id,
          actor_username_snapshot,
          actor_role_snapshot,
          resource_type,
          reason,
          request_id,
          ip_address,
          user_agent
        ) VALUES (
          'PATIENT_EXPORT_REQUEST',
          'SUCCESS',
          (SELECT id FROM patients WHERE public_id = ${params.patientPublicId}::uuid),
          ${params.userId},
          ${params.username},
          ${params.role},
          'PATIENT_RECORD',
          ${params.reason},
          ${params.requestId},
          ${params.ipAddress ? Prisma.sql`${params.ipAddress}::inet` : null},
          ${params.userAgent ?? null}
        )
      `
  },
}
