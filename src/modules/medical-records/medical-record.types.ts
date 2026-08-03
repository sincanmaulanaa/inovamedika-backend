import type { AuthRequestMetadata, AuthenticatedPrincipal } from '../auth/auth.types.js'

export const medicalRecordStatuses = ['DRAFT', 'FINAL', 'AMENDED'] as const

export type MedicalRecordStatus = (typeof medicalRecordStatuses)[number]

export interface MedicalRecordRecord {
  readonly id: bigint
  readonly publicId: string
  readonly patientId: bigint
  readonly patientPublicId: string
  readonly patientName: string
  readonly patientMedicalRecordNumber: string
  readonly registrationId: bigint
  readonly registrationPublicId: string
  readonly doctorId: bigint
  readonly doctorPublicId: string
  readonly doctorName: string
  readonly polyclinicId: bigint
  readonly polyclinicPublicId: string
  readonly polyclinicName: string
  readonly visitDate: Date
  readonly subjective: string | null
  readonly objective: string | null
  readonly assessment: string | null
  readonly plan: string | null
  readonly status: MedicalRecordStatus
  readonly amendmentReason: string | null
  readonly finalizedAt: Date | null
  readonly rowVersion: number
  readonly createdAt: Date
  readonly updatedAt: Date
}

export interface MedicalActionData {
  readonly id: string
  readonly actionName: string
  readonly notes: string | null
}

export interface MedicalActionMutationData {
  readonly actionName: string
  readonly notes?: string | null | undefined
}

export interface MedicalRecordData {
  readonly id: string
  readonly patientId: string
  readonly patientName: string
  readonly patientMedicalRecordNumber: string
  readonly registrationId: string
  readonly doctorId: string
  readonly doctorName: string
  readonly polyclinicId: string
  readonly polyclinicName: string
  readonly visitDate: string
  readonly subjective: string | null
  readonly objective: string | null
  readonly assessment: string | null
  readonly plan: string | null
  readonly status: MedicalRecordStatus
  readonly amendmentReason: string | null
  readonly finalizedAt: string | null
  readonly rowVersion: number
  readonly createdAt: string
  readonly updatedAt: string
  readonly actions: readonly MedicalActionData[]
}

export interface MedicalRecordMutationData {
  readonly registrationId: string
  readonly subjective: string | null
  readonly objective: string | null
  readonly assessment: string | null
  readonly plan: string | null
  readonly actions: readonly MedicalActionMutationData[]
}

export interface MedicalRecordUpdateData {
  readonly subjective?: string | null | undefined
  readonly objective?: string | null | undefined
  readonly assessment?: string | null | undefined
  readonly plan?: string | null | undefined
  readonly actions?: readonly MedicalActionMutationData[] | undefined
  readonly rowVersion: number
}

export interface MedicalRecordAmendmentData {
  readonly subjective: string | null
  readonly objective: string | null
  readonly assessment: string | null
  readonly plan: string | null
  readonly actions: readonly MedicalActionMutationData[]
  readonly amendmentReason: string
  readonly rowVersion: number
}

export interface MedicalRecordListQuery {
  readonly page: number
  readonly limit: number
  readonly patientId: string
  readonly doctorId?: string | undefined
  readonly polyclinicId?: string | undefined
}

export interface MedicalRecordPagination {
  readonly page: number
  readonly limit: number
  readonly totalItems: number
  readonly totalPages: number
}

export interface MedicalRecordListData {
  readonly items: readonly MedicalRecordData[]
  readonly pagination: MedicalRecordPagination
}

export interface MedicalRecordRequestContext {
  readonly metadata: AuthRequestMetadata
  readonly principal: AuthenticatedPrincipal
}
