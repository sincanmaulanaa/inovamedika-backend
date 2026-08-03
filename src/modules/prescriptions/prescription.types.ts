import type { AuthRequestMetadata, AuthenticatedPrincipal } from '../auth/auth.types.js'

export const prescriptionStatuses = ['DRAFT', 'FINAL', 'CANCELLED'] as const

export type PrescriptionStatus = (typeof prescriptionStatuses)[number]

export interface PrescriptionItemRecord {
  readonly id: bigint
  readonly prescriptionId: bigint
  readonly medicationId: bigint
  readonly medicationPublicId: string
  readonly medicationName: string
  readonly medicationCode: string
  readonly medicationDosageForm: string
  readonly medicationStrength: string
  readonly quantity: number
  readonly dosageInstructions: string
  readonly notes: string | null
}

export interface PrescriptionRecord {
  readonly id: bigint
  readonly publicId: string
  readonly medicalRecordId: bigint
  readonly medicalRecordPublicId: string
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
  readonly date: Date
  readonly status: PrescriptionStatus
  readonly notes: string | null
  readonly rowVersion: number
  readonly createdAt: Date
  readonly updatedAt: Date
  readonly items: readonly PrescriptionItemRecord[]
}

export interface PrescriptionItemData {
  readonly medicationId: string
  readonly medicationName: string
  readonly medicationCode: string
  readonly medicationDosageForm: string
  readonly medicationStrength: string
  readonly quantity: number
  readonly dosageInstructions: string
  readonly notes: string | null
}

export interface PrescriptionData {
  readonly id: string
  readonly medicalRecordId: string
  readonly patientId: string
  readonly patientName: string
  readonly patientMedicalRecordNumber: string
  readonly doctorId: string
  readonly doctorName: string
  readonly polyclinicId: string
  readonly polyclinicName: string
  readonly date: string
  readonly status: PrescriptionStatus
  readonly notes: string | null
  readonly rowVersion: number
  readonly createdAt: string
  readonly updatedAt: string
  readonly items: readonly PrescriptionItemData[]
}

export interface PrescriptionItemMutationData {
  readonly medicationId: string
  readonly quantity: number
  readonly dosageInstructions: string
  readonly notes: string | null
}

export interface PrescriptionMutationData {
  readonly medicalRecordId: string
  readonly notes: string | null
  readonly items: readonly PrescriptionItemMutationData[]
}

export interface PrescriptionUpdateData {
  readonly notes?: string | null | undefined
  readonly rowVersion: number
  readonly items?: readonly PrescriptionItemMutationData[] | undefined
}

export interface PrescriptionListQuery {
  readonly page: number
  readonly limit: number
  readonly patientId: string
  readonly doctorId?: string | undefined
}

export interface PrescriptionPagination {
  readonly page: number
  readonly limit: number
  readonly totalItems: number
  readonly totalPages: number
}

export interface PrescriptionListData {
  readonly items: readonly PrescriptionData[]
  readonly pagination: PrescriptionPagination
}

export interface PrescriptionRequestContext {
  readonly metadata: AuthRequestMetadata
  readonly principal: AuthenticatedPrincipal
}
