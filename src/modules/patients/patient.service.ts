import { DomainError } from '../../http/domain-error.js'
import {
  patientRepository,
  type PatientRepository,
  type PatientListResult,
} from './patient.repository.js'
import { toPatientAdministrativeData } from './patient.mapper.js'
import type {
  PatientAdministrativeData,
  PatientListData,
  PatientListQuery,
  PatientMutationData,
  PatientRequestContext,
  PatientUpdateData,
} from './patient.types.js'

interface PatientIdentityInput extends PatientRequestContext {
  readonly patientId: string
}

interface CreatePatientInput extends PatientRequestContext {
  readonly data: PatientMutationData
}

interface UpdatePatientInput extends PatientIdentityInput {
  readonly data: PatientUpdateData
}

interface ListPatientsInput extends PatientRequestContext {
  readonly query: PatientListQuery
}

export interface PatientService {
  readonly createPatient: (input: CreatePatientInput) => Promise<PatientAdministrativeData>
  readonly deletePatient: (input: PatientIdentityInput) => Promise<void>
  readonly getPatient: (input: PatientIdentityInput) => Promise<PatientAdministrativeData>
  readonly listPatients: (input: ListPatientsInput) => Promise<PatientListData>
  readonly updatePatient: (input: UpdatePatientInput) => Promise<PatientAdministrativeData>
}

interface PatientServiceDependencies {
  readonly clock?: () => Date
  readonly repository?: PatientRepository
}

const patientManagementRoles = new Set(['ADMINISTRATOR', 'REGISTRATION_OFFICER'])
const patientReadRoles = new Set(['ADMINISTRATOR', 'REGISTRATION_OFFICER', 'DOCTOR'])

const assertCanReadPatients = (input: PatientRequestContext): void => {
  if (patientReadRoles.has(input.principal.role)) {
    return
  }

  throw new DomainError(
    'FORBIDDEN',
    403,
    'Tindakan ini tidak tersedia untuk akun yang sedang digunakan.',
  )
}

const assertCanManagePatients = (input: PatientRequestContext): void => {
  if (patientManagementRoles.has(input.principal.role)) {
    return
  }

  throw new DomainError(
    'FORBIDDEN',
    403,
    'Tindakan ini tidak tersedia untuk akun yang sedang digunakan.',
  )
}

const getClinicDate = (date: Date): string => {
  const dateParts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
  }).formatToParts(date)
  const parts = new Map(dateParts.map((part) => [part.type, part.value]))
  return `${parts.get('year')}-${parts.get('month')}-${parts.get('day')}`
}

const validateDateOfBirth = (dateOfBirth: string, now: Date): void => {
  if (dateOfBirth <= getClinicDate(now)) {
    return
  }

  throw new DomainError(
    'VALIDATION_ERROR',
    422,
    'Beberapa data belum sesuai. Periksa kembali kolom yang ditandai.',
    { dateOfBirth: ['Tanggal lahir tidak boleh melewati hari ini.'] },
  )
}

const normalizePhone = (phone: string | null): string | null => {
  if (!phone) {
    return null
  }

  const digits = phone.replace(/\D/g, '')
  let normalizedPhone: string

  if (phone.trim().startsWith('+')) {
    normalizedPhone = `+${digits}`
  } else if (digits.startsWith('0')) {
    normalizedPhone = `+62${digits.slice(1)}`
  } else if (digits.startsWith('62')) {
    normalizedPhone = `+${digits}`
  } else {
    normalizedPhone = `+62${digits}`
  }

  if (/^\+[1-9]\d{7,14}$/.test(normalizedPhone)) {
    return normalizedPhone
  }

  throw new DomainError(
    'VALIDATION_ERROR',
    422,
    'Beberapa data belum sesuai. Periksa kembali kolom yang ditandai.',
    { phone: ['Nomor telepon belum sesuai. Periksa kode negara dan jumlah angkanya.'] },
  )
}

const getPatientNotFoundError = (): DomainError => {
  return new DomainError(
    'PATIENT_NOT_FOUND',
    404,
    'Data pasien tidak ditemukan. Periksa kembali atau kembali ke daftar.',
  )
}

const getNikConflictError = (): DomainError => {
  return new DomainError(
    'PATIENT_NIK_EXISTS',
    409,
    'NIK sudah digunakan pada data pasien lain. Periksa kembali NIK atau cari pasien tersebut.',
    { nik: ['NIK sudah digunakan pada data pasien lain.'] },
  )
}

const getWriteData = (data: PatientMutationData) => {
  return {
    address: data.address,
    dateOfBirth: data.dateOfBirth,
    fullName: data.fullName,
    nik: data.nik,
    normalizedPhone: normalizePhone(data.phone),
    phone: data.phone,
    sex: data.sex,
  }
}

const mapPatientList = (result: PatientListResult, query: PatientListQuery): PatientListData => {
  return {
    items: result.items.map(toPatientAdministrativeData),
    pagination: {
      limit: query.limit,
      page: query.page,
      totalItems: result.totalItems,
      totalPages: result.totalItems === 0 ? 0 : Math.ceil(result.totalItems / query.limit),
    },
  }
}

export const createPatientService = ({
  clock = () => new Date(),
  repository = patientRepository,
}: PatientServiceDependencies = {}): PatientService => {
  return {
    createPatient: async (input) => {
      assertCanManagePatients(input)
      validateDateOfBirth(input.data.dateOfBirth, clock())
      const result = await repository.createPatient({
        ...input,
        ...getWriteData(input.data),
      })

      if (result.status === 'NIK_EXISTS') {
        throw getNikConflictError()
      }

      return toPatientAdministrativeData(result.patient)
    },

    listPatients: async (input) => {
      assertCanReadPatients(input)
      const result = await repository.listPatients({ ...input, ...input.query })
      return mapPatientList(result, input.query)
    },

    getPatient: async (input) => {
      assertCanReadPatients(input)
      const patient = await repository.findPatient({
        ...input,
        patientPublicId: input.patientId,
      })

      if (!patient) {
        throw getPatientNotFoundError()
      }

      return toPatientAdministrativeData(patient)
    },

    updatePatient: async (input) => {
      assertCanManagePatients(input)
      validateDateOfBirth(input.data.dateOfBirth, clock())
      const result = await repository.updatePatient({
        ...input,
        ...getWriteData(input.data),
        patientPublicId: input.patientId,
        rowVersion: input.data.rowVersion,
      })

      if (result.status === 'NOT_FOUND') {
        throw getPatientNotFoundError()
      }

      if (result.status === 'NIK_EXISTS') {
        throw getNikConflictError()
      }

      if (result.status === 'VERSION_CONFLICT') {
        throw new DomainError(
          'PATIENT_VERSION_CONFLICT',
          409,
          'Data pasien telah berubah. Muat ulang data lalu periksa kembali sebelum menyimpan.',
        )
      }

      return toPatientAdministrativeData(result.patient)
    },

    deletePatient: async (input) => {
      assertCanManagePatients(input)
      const result = await repository.deletePatient({
        ...input,
        patientPublicId: input.patientId,
      })

      if (result.status === 'NOT_FOUND') {
        throw getPatientNotFoundError()
      }

      if (result.status === 'HAS_REGISTRATIONS') {
        throw new DomainError(
          'PATIENT_HAS_REGISTRATIONS',
          409,
          'Data pasien tidak dapat dihapus karena sudah memiliki riwayat kunjungan. Data tetap disimpan untuk menjaga riwayat pelayanan.',
        )
      }
    },
  }
}

export const patientService = createPatientService()
