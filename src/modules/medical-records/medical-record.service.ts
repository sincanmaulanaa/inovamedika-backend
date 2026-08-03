import { DomainError } from '../../http/domain-error.js'
import { toMedicalRecordData } from './medical-record.mapper.js'
import {
  medicalRecordRepository,
  type MedicalRecordListResult,
  type MedicalRecordRepository,
} from './medical-record.repository.js'
import type {
  MedicalRecordAmendmentData,
  MedicalRecordData,
  MedicalRecordListData,
  MedicalRecordListQuery,
  MedicalRecordMutationData,
  MedicalRecordRequestContext,
  MedicalRecordUpdateData,
} from './medical-record.types.js'

interface CreateMedicalRecordInput extends MedicalRecordRequestContext {
  readonly data: MedicalRecordMutationData
}

interface UpdateMedicalRecordInput extends MedicalRecordRequestContext {
  readonly medicalRecordId: string
  readonly data: MedicalRecordUpdateData
}

interface AmendMedicalRecordInput extends MedicalRecordRequestContext {
  readonly medicalRecordId: string
  readonly data: MedicalRecordAmendmentData
}

interface FinalizeMedicalRecordInput extends MedicalRecordRequestContext {
  readonly medicalRecordId: string
  readonly rowVersion: number
}

interface MedicalRecordIdentityInput extends MedicalRecordRequestContext {
  readonly medicalRecordId: string
}

interface ListMedicalRecordsInput extends MedicalRecordRequestContext {
  readonly query: MedicalRecordListQuery
}

interface CreateCorrectionRequestInput extends MedicalRecordRequestContext {
  readonly medicalRecordId: string
  readonly reason: string
}

interface ApproveCorrectionRequestInput extends MedicalRecordRequestContext {
  readonly correctionRequestId: string
}

export interface MedicalRecordService {
  readonly createMedicalRecord: (input: CreateMedicalRecordInput) => Promise<MedicalRecordData>
  readonly updateMedicalRecord: (input: UpdateMedicalRecordInput) => Promise<MedicalRecordData>
  readonly amendMedicalRecord: (input: AmendMedicalRecordInput) => Promise<MedicalRecordData>
  readonly finalizeMedicalRecord: (input: FinalizeMedicalRecordInput) => Promise<MedicalRecordData>
  readonly getMedicalRecord: (input: MedicalRecordIdentityInput) => Promise<MedicalRecordData>
  readonly listMedicalRecords: (input: ListMedicalRecordsInput) => Promise<MedicalRecordListData>
  readonly createCorrectionRequest: (input: CreateCorrectionRequestInput) => Promise<void>
  readonly approveCorrectionRequest: (input: ApproveCorrectionRequestInput) => Promise<void>
}

interface MedicalRecordServiceDependencies {
  readonly repository?: MedicalRecordRepository
}

const medicalRecordRoles = new Set(['DOCTOR'])

const assertIsDoctor = (input: MedicalRecordRequestContext): void => {
  if (medicalRecordRoles.has(input.principal.role)) return
  throw new DomainError(
    'FORBIDDEN',
    403,
    'Tindakan ini tidak tersedia untuk akun yang sedang digunakan.',
  )
}

const getMedicalRecordNotFoundError = (): DomainError => {
  return new DomainError('MEDICAL_RECORD_NOT_FOUND', 404, 'Data rekam medis tidak ditemukan.')
}

const mapMedicalRecordList = (
  result: MedicalRecordListResult,
  query: MedicalRecordListQuery,
): MedicalRecordListData => ({
  items: result.items.map(toMedicalRecordData),
  pagination: {
    limit: query.limit,
    page: query.page,
    totalItems: result.totalItems,
    totalPages: result.totalItems === 0 ? 0 : Math.ceil(result.totalItems / query.limit),
  },
})

export const createMedicalRecordService = ({
  repository = medicalRecordRepository,
}: MedicalRecordServiceDependencies = {}): MedicalRecordService => ({
  createMedicalRecord: async (input) => {
    assertIsDoctor(input)

    const result = await repository.createMedicalRecord({
      ...input,
      registrationPublicId: input.data.registrationId,
      assessment: input.data.assessment,
      bloodPressureSystolic: input.data.bloodPressureSystolic,
      bloodPressureDiastolic: input.data.bloodPressureDiastolic,
      temperatureCelsius: input.data.temperatureCelsius,
      weightKg: input.data.weightKg,
      heightCm: input.data.heightCm,
      plan: input.data.plan,
      subjective: input.data.subjective,
      actions: input.data.actions,
    })

    if (result.status === 'REGISTRATION_NOT_FOUND') {
      throw new DomainError('NOT_FOUND', 404, 'Data pendaftaran tidak ditemukan.')
    }

    if (result.status === 'NOT_ASSIGNED_TO_DOCTOR') {
      throw new DomainError(
        'FORBIDDEN',
        403,
        'Anda hanya dapat mengisi rekam medis untuk pasien Anda sendiri.',
      )
    }

    if (result.status === 'MEDICAL_RECORD_ALREADY_EXISTS') {
      throw new DomainError(
        'MEDICAL_RECORD_EXISTS',
        409,
        'Pendaftaran ini sudah memiliki rekam medis.',
      )
    }

    return toMedicalRecordData(result.medicalRecord)
  },

  updateMedicalRecord: async (input) => {
    assertIsDoctor(input)

    const result = await repository.updateMedicalRecord({
      ...input,
      medicalRecordPublicId: input.medicalRecordId,
      rowVersion: input.data.rowVersion,
      assessment: input.data.assessment,
      bloodPressureSystolic: input.data.bloodPressureSystolic,
      bloodPressureDiastolic: input.data.bloodPressureDiastolic,
      temperatureCelsius: input.data.temperatureCelsius,
      weightKg: input.data.weightKg,
      heightCm: input.data.heightCm,
      plan: input.data.plan,
      subjective: input.data.subjective,
      actions: input.data.actions,
    })

    if (result.status === 'NOT_FOUND') throw getMedicalRecordNotFoundError()
    if (result.status === 'VERSION_CONFLICT') {
      throw new DomainError(
        'MEDICAL_RECORD_VERSION_CONFLICT',
        409,
        'Data rekam medis telah berubah. Muat ulang data lalu periksa kembali sebelum menyimpan.',
      )
    }
    if (result.status === 'LOCKED_RECORD') {
      throw new DomainError(
        'MEDICAL_RECORD_LOCKED',
        422,
        'Rekam medis yang sudah difinalisasi tidak dapat diubah, gunakan fitur koreksi jika perlu mengubah.',
      )
    }
    if (result.status === 'CORRECTION_REQUEST_REQUIRED') {
      throw new DomainError(
        'CORRECTION_REQUEST_REQUIRED',
        403,
        'Rekam medis telah difinalisasi lebih dari 2x24 jam. Koreksi memerlukan persetujuan dari PMIK atau pimpinan fasilitas.',
      )
    }
    if (result.status === 'INVALID_STATUS_TRANSITION') {
      throw new DomainError('INVALID_STATE', 422, 'Status rekam medis tidak dapat diubah.')
    }

    return toMedicalRecordData(result.medicalRecord)
  },

  amendMedicalRecord: async (input) => {
    assertIsDoctor(input)

    const result = await repository.updateMedicalRecord({
      ...input,
      medicalRecordPublicId: input.medicalRecordId,
      rowVersion: input.data.rowVersion,
      assessment: input.data.assessment,
      bloodPressureSystolic: input.data.bloodPressureSystolic,
      bloodPressureDiastolic: input.data.bloodPressureDiastolic,
      temperatureCelsius: input.data.temperatureCelsius,
      weightKg: input.data.weightKg,
      heightCm: input.data.heightCm,
      plan: input.data.plan,
      subjective: input.data.subjective,
      actions: input.data.actions,
      amendmentReason: input.data.amendmentReason,
      status: 'AMENDED',
    })

    if (result.status === 'NOT_FOUND') throw getMedicalRecordNotFoundError()
    if (result.status === 'VERSION_CONFLICT') {
      throw new DomainError(
        'MEDICAL_RECORD_VERSION_CONFLICT',
        409,
        'Data rekam medis telah berubah.',
      )
    }
    if (result.status === 'INVALID_STATUS_TRANSITION') {
      throw new DomainError(
        'INVALID_STATE',
        422,
        'Hanya rekam medis yang sudah difinalisasi yang dapat dikoreksi.',
      )
    }
    if (result.status === 'LOCKED_RECORD') {
      throw new DomainError(
        'MEDICAL_RECORD_LOCKED',
        422,
        'Rekam medis tidak dapat dikoreksi saat ini.',
      )
    }
    if (result.status === 'CORRECTION_REQUEST_REQUIRED') {
      throw new DomainError(
        'CORRECTION_REQUEST_REQUIRED',
        403,
        'Rekam medis telah difinalisasi lebih dari 2x24 jam. Koreksi memerlukan persetujuan dari PMIK atau pimpinan fasilitas.',
      )
    }

    return toMedicalRecordData(result.medicalRecord)
  },

  finalizeMedicalRecord: async (input) => {
    assertIsDoctor(input)

    const result = await repository.updateMedicalRecord({
      ...input,
      medicalRecordPublicId: input.medicalRecordId,
      rowVersion: input.rowVersion,
      status: 'FINAL',
      finalizedAt: true,
    })

    if (result.status === 'NOT_FOUND') throw getMedicalRecordNotFoundError()
    if (result.status === 'VERSION_CONFLICT') {
      throw new DomainError(
        'MEDICAL_RECORD_VERSION_CONFLICT',
        409,
        'Data rekam medis telah berubah.',
      )
    }
    if (result.status === 'LOCKED_RECORD') {
      throw new DomainError('MEDICAL_RECORD_LOCKED', 422, 'Rekam medis sudah difinalisasi.')
    }
    if (result.status === 'INVALID_STATUS_TRANSITION') {
      throw new DomainError('INVALID_STATE', 422, 'Rekam medis tidak dapat difinalisasi.')
    }
    if (result.status === 'CORRECTION_REQUEST_REQUIRED') {
      throw new DomainError(
        'CORRECTION_REQUEST_REQUIRED',
        403,
        'Rekam medis telah difinalisasi lebih dari 2x24 jam. Koreksi memerlukan persetujuan dari PMIK atau pimpinan fasilitas.',
      )
    }

    return toMedicalRecordData(result.medicalRecord)
  },

  getMedicalRecord: async (input) => {
    assertIsDoctor(input)
    const record = await repository.findMedicalRecord({
      ...input,
      medicalRecordPublicId: input.medicalRecordId,
    })
    if (!record) throw getMedicalRecordNotFoundError()
    return toMedicalRecordData(record)
  },

  listMedicalRecords: async (input) => {
    assertIsDoctor(input)
    const result = await repository.listMedicalRecords({ ...input, query: input.query })
    return mapMedicalRecordList(result, input.query)
  },

  createCorrectionRequest: async (input) => {
    assertIsDoctor(input)
    const result = await repository.createCorrectionRequest({
      medicalRecordPublicId: input.medicalRecordId,
      reason: input.reason,
      metadata: input.metadata,
      principal: input.principal,
    })
    if (result.status === 'NOT_FOUND') {
      throw getMedicalRecordNotFoundError()
    }
  },

  approveCorrectionRequest: async (input) => {
    if (input.principal.role !== 'ADMINISTRATOR') {
      throw new DomainError('FORBIDDEN', 403, 'Akses ditolak.')
    }
    const result = await repository.approveCorrectionRequest({
      correctionRequestId: input.correctionRequestId,
      metadata: input.metadata,
      principal: input.principal,
    })
    if (result.status === 'NOT_FOUND') {
      throw new DomainError(
        'CORRECTION_REQUEST_NOT_FOUND',
        404,
        'Permintaan koreksi tidak ditemukan.',
      )
    }
  },
})

export const medicalRecordService = createMedicalRecordService()
