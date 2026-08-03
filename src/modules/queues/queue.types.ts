import type { AuthRequestMetadata, AuthenticatedPrincipal } from '../auth/auth.types.js'

export const queueStatuses = [
  'WAITING',
  'CALLED',
  'SKIPPED',
  'SERVING',
  'COMPLETED',
  'CANCELLED',
] as const

export type QueueStatus = (typeof queueStatuses)[number]

export const terminalQueueStatuses = new Set<QueueStatus>(['COMPLETED', 'CANCELLED'])

export const activeQueueStatuses = new Set<QueueStatus>(['WAITING', 'CALLED', 'SKIPPED', 'SERVING'])

export interface QueueLaneRecord {
  readonly id: bigint
  readonly publicId: string
  readonly polyclinicId: bigint
  readonly doctorId: bigint
  readonly code: string
  readonly displayName: string
  readonly queuePrefix: string
  readonly isActive: boolean
}

export interface QueueRecord {
  readonly id: bigint
  readonly publicId: string
  readonly registrationId: bigint
  readonly registrationPublicId: string
  readonly queueLaneId: bigint
  readonly lanePublicId: string
  readonly laneDisplayName: string
  readonly serviceDate: Date
  readonly sequenceNumber: bigint
  readonly serviceOrder: bigint
  readonly displayNumber: string
  readonly status: QueueStatus
  readonly callCount: number
  readonly lastCalledAt: Date | null
  readonly skippedAt: Date | null
  readonly requeuedAt: Date | null
  readonly servingStartedAt: Date | null
  readonly completedAt: Date | null
  readonly cancelledAt: Date | null
  readonly cancellationReason: string | null
  readonly rowVersion: number

  // Computed/joined fields for context
  readonly patientName: string
  readonly patientMedicalRecordNumber: string
}

export interface QueueAdministrativeData {
  readonly id: string
  readonly registrationId: string
  readonly laneId: string
  readonly laneDisplayName: string
  readonly serviceDate: string
  readonly displayNumber: string
  readonly status: QueueStatus
  readonly callCount: number
  readonly lastCalledAt: string | null
  readonly skippedAt: string | null
  readonly requeuedAt: string | null
  readonly servingStartedAt: string | null
  readonly completedAt: string | null
  readonly cancelledAt: string | null
  readonly cancellationReason: string | null
  readonly rowVersion: number

  readonly patientName: string
  readonly patientMedicalRecordNumber: string
}

export interface QueueListQuery {
  readonly date: string
  readonly polyclinicId?: string | undefined
  readonly doctorId?: string | undefined
  readonly queueLaneId?: string | undefined
  readonly status?: QueueStatus | undefined
  readonly search?: string | undefined
}

export interface QueueListData {
  readonly items: readonly QueueAdministrativeData[]
}

export interface QueueRequestContext {
  readonly metadata: AuthRequestMetadata
  readonly principal: AuthenticatedPrincipal
}
