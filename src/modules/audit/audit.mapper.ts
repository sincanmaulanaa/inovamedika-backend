import type { AuditLogItem } from './audit.types.js'

export const mapAuditLogToItem = (row: any): AuditLogItem => {
  return {
    id: String(row.id),
    publicId: row.public_id,
    occurredAt: row.occurred_at.toISOString(),
    clinicTimezone: row.clinic_timezone,
    actorUserId: row.actor_user_id ? String(row.actor_user_id) : null,
    actorUsernameSnapshot: row.actor_username_snapshot,
    actorRoleSnapshot: row.actor_role_snapshot,
    patientId: row.patient_id ? String(row.patient_id) : null,
    registrationId: row.registration_id ? String(row.registration_id) : null,
    resourceType: row.resource_type,
    resourcePublicId: row.resource_public_id,
    action: row.action,
    outcome: row.outcome,
    purpose: row.purpose,
    reason: row.reason,
    ipAddress: row.ip_address,
    metadata: row.metadata,
  }
}
