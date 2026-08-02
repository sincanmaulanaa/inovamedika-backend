import type { AuthRequestMetadata, AuthenticatedPrincipal } from '../auth/auth.types.js'

export const patientSexes = ['MALE', 'FEMALE'] as const

export type PatientSex = (typeof patientSexes)[number]

export interface PatientRecord {
  readonly address: string | null
  readonly createdAt: Date
  readonly dateOfBirth: Date
  readonly fullName: string
  readonly id: bigint
  readonly medicalRecordNumber: string
  readonly nik: string
  readonly normalizedPhone: string | null
  readonly phone: string | null
  readonly publicId: string
  readonly rowVersion: number
  readonly sex: PatientSex
  readonly updatedAt: Date
}

export interface PatientAdministrativeData {
  readonly address: string | null
  readonly createdAt: string
  readonly dateOfBirth: string
  readonly fullName: string
  readonly id: string
  readonly medicalRecordNumber: string
  readonly nik: string
  readonly phone: string | null
  readonly rowVersion: number
  readonly sex: PatientSex
  readonly updatedAt: string
}

export interface PatientMutationData {
  readonly address: string | null
  readonly dateOfBirth: string
  readonly fullName: string
  readonly nik: string
  readonly phone: string | null
  readonly sex: PatientSex
}

export interface PatientUpdateData extends PatientMutationData {
  readonly rowVersion: number
}

export interface PatientListQuery {
  readonly limit: number
  readonly page: number
  readonly search?: string | undefined
}

export interface PatientPagination {
  readonly limit: number
  readonly page: number
  readonly totalItems: number
  readonly totalPages: number
}

export interface PatientListData {
  readonly items: readonly PatientAdministrativeData[]
  readonly pagination: PatientPagination
}

export interface PatientRequestContext {
  readonly metadata: AuthRequestMetadata
  readonly principal: AuthenticatedPrincipal
}
