export interface AuditLogItem {
  readonly id: string
  readonly publicId: string
  readonly occurredAt: string
  readonly clinicTimezone: string
  readonly actorUserId: string | null
  readonly actorUsernameSnapshot: string | null
  readonly actorRoleSnapshot: string | null
  readonly patientId: string | null
  readonly registrationId: string | null
  readonly resourceType: string
  readonly resourcePublicId: string | null
  readonly action: string
  readonly outcome: string
  readonly purpose: string | null
  readonly reason: string | null
  readonly ipAddress: string | null
  readonly metadata: unknown
}

export interface PaginatedAuditLogs {
  readonly items: readonly AuditLogItem[]
  readonly pagination: {
    readonly page: number
    readonly limit: number
    readonly totalItems: number
    readonly totalPages: number
  }
}

export interface AuditRequestMetadata {
  readonly ipAddress?: string
  readonly requestId: string
  readonly userAgent?: string
}
