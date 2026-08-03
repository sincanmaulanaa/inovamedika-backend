import { DomainError } from '../../http/domain-error.js'
import {
  registrationRepository,
  type RegistrationRepository,
  type RegistrationListResult,
} from './registration.repository.js'
import { toRegistrationAdministrativeData } from './registration.mapper.js'
import {
  financingTypesRequiringPayer,
  type FinancingType,
  type RegistrationAdministrativeData,
  type RegistrationListData,
  type RegistrationListQuery,
  type RegistrationMutationData,
  type RegistrationRequestContext,
  type RegistrationUpdateData,
} from './registration.types.js'

interface RegistrationIdentityInput extends RegistrationRequestContext {
  readonly registrationId: string
}

interface CreateRegistrationInput extends RegistrationRequestContext {
  readonly data: RegistrationMutationData
}

interface UpdateRegistrationInput extends RegistrationIdentityInput {
  readonly data: RegistrationUpdateData
}

interface ListRegistrationsInput extends RegistrationRequestContext {
  readonly query: RegistrationListQuery
}

export interface RegistrationService {
  readonly createRegistration: (
    input: CreateRegistrationInput,
  ) => Promise<RegistrationAdministrativeData>
  readonly updateRegistration: (
    input: UpdateRegistrationInput,
  ) => Promise<RegistrationAdministrativeData>
  readonly getRegistration: (
    input: RegistrationIdentityInput,
  ) => Promise<RegistrationAdministrativeData>
  readonly listRegistrations: (input: ListRegistrationsInput) => Promise<RegistrationListData>
}

interface RegistrationServiceDependencies {
  readonly repository?: RegistrationRepository
}

const registrationManagementRoles = new Set(['ADMINISTRATOR', 'REGISTRATION_OFFICER'])
const registrationViewRoles = new Set(['ADMINISTRATOR', 'REGISTRATION_OFFICER', 'DOCTOR'])

const assertCanManageRegistrations = (input: RegistrationRequestContext): void => {
  if (registrationManagementRoles.has(input.principal.role)) {
    return
  }

  throw new DomainError(
    'FORBIDDEN',
    403,
    'Tindakan ini tidak tersedia untuk akun yang sedang digunakan.',
  )
}

const assertCanViewRegistrations = (input: RegistrationRequestContext): void => {
  if (registrationViewRoles.has(input.principal.role)) {
    return
  }

  throw new DomainError(
    'FORBIDDEN',
    403,
    'Tindakan ini tidak tersedia untuk akun yang sedang digunakan.',
  )
}

const validatePayerRequirement = (
  financingType: FinancingType,
  payerId: string | null | undefined,
): void => {
  if (financingTypesRequiringPayer.has(financingType) && !payerId) {
    throw new DomainError(
      'VALIDATION_ERROR',
      422,
      'Beberapa data belum sesuai. Periksa kembali kolom yang ditandai.',
      { payerId: ['Penjamin wajib dipilih untuk jenis pembiayaan ini.'] },
    )
  }

  if (financingType === 'SELF_PAY' && payerId) {
    throw new DomainError(
      'VALIDATION_ERROR',
      422,
      'Beberapa data belum sesuai. Periksa kembali kolom yang ditandai.',
      { payerId: ['Penjamin tidak dapat dipilih untuk pembiayaan mandiri.'] },
    )
  }
}

const getRegistrationNotFoundError = (): DomainError => {
  return new DomainError(
    'REGISTRATION_NOT_FOUND',
    404,
    'Data pendaftaran tidak ditemukan. Periksa kembali atau kembali ke daftar.',
  )
}

const mapRegistrationList = (
  result: RegistrationListResult,
  query: RegistrationListQuery,
): RegistrationListData => ({
  items: result.items.map(toRegistrationAdministrativeData),
  pagination: {
    limit: query.limit,
    page: query.page,
    totalItems: result.totalItems,
    totalPages: result.totalItems === 0 ? 0 : Math.ceil(result.totalItems / query.limit),
  },
})

export const createRegistrationService = ({
  repository = registrationRepository,
}: RegistrationServiceDependencies = {}): RegistrationService => ({
  createRegistration: async (input) => {
    assertCanManageRegistrations(input)
    validatePayerRequirement(input.data.financingType, input.data.payerId)

    const result = await repository.createRegistration({
      ...input,
      doctorPublicId: input.data.doctorId,
      financingType: input.data.financingType,
      patientPublicId: input.data.patientId,
      payerMemberNumber: input.data.payerMemberNumber,
      payerPublicId: input.data.payerId,
      polyclinicPublicId: input.data.polyclinicId,
      repeatVisitReason: input.data.repeatVisitReason,
      serviceDate: input.data.serviceDate,
      visitReason: input.data.visitReason,
    })

    if (result.status === 'PATIENT_NOT_FOUND') {
      throw new DomainError(
        'PATIENT_NOT_FOUND',
        404,
        'Data pasien tidak ditemukan. Pastikan pasien sudah terdaftar.',
      )
    }

    if (result.status === 'DOCTOR_NOT_FOUND') {
      throw new DomainError('DOCTOR_NOT_FOUND', 404, 'Dokter tidak ditemukan atau tidak aktif.')
    }

    if (result.status === 'POLYCLINIC_NOT_FOUND') {
      throw new DomainError('POLYCLINIC_NOT_FOUND', 404, 'Poli tidak ditemukan atau tidak aktif.')
    }

    if (result.status === 'DOCTOR_NOT_SERVING_POLYCLINIC') {
      throw new DomainError(
        'DOCTOR_NOT_SERVING_POLYCLINIC',
        422,
        'Dokter yang dipilih tidak melayani poli ini. Pilih dokter yang sesuai.',
      )
    }

    if (result.status === 'PAYER_NOT_FOUND') {
      throw new DomainError('PAYER_NOT_FOUND', 404, 'Penjamin tidak ditemukan atau tidak aktif.')
    }

    if (result.status === 'ACTIVE_REGISTRATION_EXISTS') {
      throw new DomainError(
        'ACTIVE_REGISTRATION_EXISTS',
        409,
        'Pasien sudah memiliki pendaftaran aktif pada tanggal dan poli yang sama.',
        { existingRegistrationId: result.existingRegistrationId },
      )
    }

    if (result.status === 'REPEAT_VISIT_REQUIRES_REASON') {
      throw new DomainError(
        'REPEAT_VISIT_REQUIRES_REASON',
        409,
        'Pasien sudah memiliki kunjungan selesai pada tanggal dan poli yang sama. Isi alasan kunjungan ulang untuk melanjutkan.',
        { repeatVisitReason: ['Alasan kunjungan ulang wajib diisi.'] },
      )
    }

    return toRegistrationAdministrativeData(result.registration)
  },

  updateRegistration: async (input) => {
    assertCanManageRegistrations(input)

    if (input.data.financingType) {
      const payerId = input.data.payerId !== undefined ? input.data.payerId : undefined
      if (payerId !== undefined) {
        validatePayerRequirement(input.data.financingType, payerId)
      }
    }

    const result = await repository.updateRegistration({
      ...input,
      cancelledReason: input.data.cancelledReason,
      financingType: input.data.financingType,
      noShowReason: input.data.noShowReason,
      payerMemberNumber: input.data.payerMemberNumber,
      payerPublicId: input.data.payerId,
      registrationPublicId: input.registrationId,
      rowVersion: input.data.rowVersion,
      status: input.data.status,
      visitReason: input.data.visitReason,
    })

    if (result.status === 'NOT_FOUND') {
      throw getRegistrationNotFoundError()
    }

    if (result.status === 'VERSION_CONFLICT') {
      throw new DomainError(
        'REGISTRATION_VERSION_CONFLICT',
        409,
        'Data pendaftaran telah berubah. Muat ulang data lalu periksa kembali sebelum menyimpan.',
      )
    }

    if (result.status === 'INVALID_STATUS_TRANSITION') {
      throw new DomainError(
        'INVALID_STATUS_TRANSITION',
        422,
        'Perubahan status ini tidak dapat dilakukan dari status saat ini.',
      )
    }

    if (result.status === 'FIELD_LOCKED_AFTER_CHECK_IN') {
      throw new DomainError(
        'FIELD_LOCKED_AFTER_CHECK_IN',
        422,
        'Data inti kunjungan tidak dapat diubah setelah check-in. Batalkan kunjungan dan buat pendaftaran baru jika diperlukan.',
      )
    }

    if (result.status === 'CANCELLED_REASON_REQUIRED') {
      throw new DomainError(
        'VALIDATION_ERROR',
        422,
        'Beberapa data belum sesuai. Periksa kembali kolom yang ditandai.',
        { cancelledReason: ['Alasan pembatalan wajib diisi.'] },
      )
    }

    if (result.status === 'NO_SHOW_REASON_REQUIRED') {
      throw new DomainError(
        'VALIDATION_ERROR',
        422,
        'Beberapa data belum sesuai. Periksa kembali kolom yang ditandai.',
        { noShowReason: ['Alasan tidak hadir wajib diisi.'] },
      )
    }

    if (result.status === 'PAYER_NOT_FOUND') {
      throw new DomainError('PAYER_NOT_FOUND', 404, 'Penjamin tidak ditemukan atau tidak aktif.')
    }

    return toRegistrationAdministrativeData(result.registration)
  },

  getRegistration: async (input) => {
    assertCanViewRegistrations(input)
    const registration = await repository.findRegistration({
      ...input,
      registrationPublicId: input.registrationId,
    })

    if (!registration) {
      throw getRegistrationNotFoundError()
    }

    return toRegistrationAdministrativeData(registration)
  },

  listRegistrations: async (input) => {
    assertCanViewRegistrations(input)
    const result = await repository.listRegistrations({
      ...input,
      ...input.query,
      doctorPublicId: input.query.doctorId,
      polyclinicPublicId: input.query.polyclinicId,
    })

    return mapRegistrationList(result, input.query)
  },
})

export const registrationService = createRegistrationService()
