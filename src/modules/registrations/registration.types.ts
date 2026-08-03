import type { AuthRequestMetadata, AuthenticatedPrincipal } from '../auth/auth.types.js'

export const registrationStatuses = [
  'WAITING',
  'CHECKED_IN',
  'IN_EXAM',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
] as const

export type RegistrationStatus = (typeof registrationStatuses)[number]

export const terminalStatuses = new Set<RegistrationStatus>(['COMPLETED', 'CANCELLED', 'NO_SHOW'])

export const activeStatuses = new Set<RegistrationStatus>(['WAITING', 'CHECKED_IN', 'IN_EXAM'])

export const financingTypes = [
  'SELF_PAY',
  'BPJS_KESEHATAN',
  'COMPANY',
  'PRIVATE_INSURANCE',
] as const

export type FinancingType = (typeof financingTypes)[number]

export const financingTypesRequiringPayer = new Set<FinancingType>([
  'BPJS_KESEHATAN',
  'COMPANY',
  'PRIVATE_INSURANCE',
])

export const statusTransitions: ReadonlyMap<RegistrationStatus, readonly RegistrationStatus[]> =
  new Map([
    ['WAITING', ['CHECKED_IN', 'CANCELLED', 'NO_SHOW']],
    ['CHECKED_IN', ['IN_EXAM', 'CANCELLED']],
    ['IN_EXAM', ['COMPLETED']],
  ])

export interface RegistrationRecord {
  readonly id: bigint
  readonly publicId: string
  readonly patientId: bigint
  readonly patientPublicId: string
  readonly patientName: string
  readonly patientMedicalRecordNumber: string
  readonly doctorId: bigint
  readonly doctorPublicId: string
  readonly doctorName: string
  readonly polyclinicId: bigint
  readonly polyclinicPublicId: string
  readonly polyclinicName: string
  readonly payerId: bigint | null
  readonly payerPublicId: string | null
  readonly payerName: string | null
  readonly relatedRegistrationId: bigint | null
  readonly serviceDate: Date
  readonly financingType: FinancingType
  readonly payerMemberNumber: string | null
  readonly authorizationNumber: string | null
  readonly visitReason: string
  readonly repeatVisitReason: string | null
  readonly status: RegistrationStatus
  readonly checkedInAt: Date | null
  readonly examStartedAt: Date | null
  readonly completedAt: Date | null
  readonly cancelledAt: Date | null
  readonly cancelledReason: string | null
  readonly noShowAt: Date | null
  readonly noShowReason: string | null
  readonly rowVersion: number
  readonly createdAt: Date
  readonly updatedAt: Date
}

export interface RegistrationAdministrativeData {
  readonly id: string
  readonly patientId: string
  readonly patientName: string
  readonly patientMedicalRecordNumber: string
  readonly doctorId: string
  readonly doctorName: string
  readonly polyclinicId: string
  readonly polyclinicName: string
  readonly payerId: string | null
  readonly payerName: string | null
  readonly serviceDate: string
  readonly financingType: FinancingType
  readonly payerMemberNumber: string | null
  readonly visitReason: string
  readonly repeatVisitReason: string | null
  readonly status: RegistrationStatus
  readonly checkedInAt: string | null
  readonly completedAt: string | null
  readonly cancelledAt: string | null
  readonly cancelledReason: string | null
  readonly noShowAt: string | null
  readonly noShowReason: string | null
  readonly rowVersion: number
  readonly createdAt: string
  readonly updatedAt: string
}

export interface RegistrationMutationData {
  readonly patientId: string
  readonly doctorId: string
  readonly polyclinicId: string
  readonly serviceDate: string
  readonly financingType: FinancingType
  readonly payerId: string | null
  readonly payerMemberNumber: string | null
  readonly visitReason: string
  readonly repeatVisitReason: string | null
}

export interface RegistrationUpdateData {
  readonly financingType?: FinancingType | undefined
  readonly payerId?: string | null | undefined
  readonly payerMemberNumber?: string | null | undefined
  readonly visitReason?: string | undefined
  readonly status?: RegistrationStatus | undefined
  readonly cancelledReason?: string | undefined
  readonly noShowReason?: string | undefined
  readonly rowVersion: number
}

export interface RegistrationListQuery {
  readonly page: number
  readonly limit: number
  readonly date?: string | undefined
  readonly status?: RegistrationStatus | undefined
  readonly doctorId?: string | undefined
  readonly polyclinicId?: string | undefined
  readonly search?: string | undefined
}

export interface RegistrationPagination {
  readonly page: number
  readonly limit: number
  readonly totalItems: number
  readonly totalPages: number
}

export interface RegistrationListData {
  readonly items: readonly RegistrationAdministrativeData[]
  readonly pagination: RegistrationPagination
}

export interface RegistrationRequestContext {
  readonly metadata: AuthRequestMetadata
  readonly principal: AuthenticatedPrincipal
}
