import { DomainError } from '../../http/domain-error.js'
import { toPrescriptionData } from './prescription.mapper.js'
import {
  prescriptionRepository,
  type PrescriptionListResult,
  type PrescriptionRepository,
} from './prescription.repository.js'
import type {
  PrescriptionData,
  PrescriptionListData,
  PrescriptionListQuery,
  PrescriptionMutationData,
  PrescriptionRequestContext,
  PrescriptionUpdateData,
} from './prescription.types.js'

interface CreatePrescriptionInput extends PrescriptionRequestContext {
  readonly data: PrescriptionMutationData
}

interface UpdatePrescriptionInput extends PrescriptionRequestContext {
  readonly prescriptionId: string
  readonly data: PrescriptionUpdateData
}

interface FinalizePrescriptionInput extends PrescriptionRequestContext {
  readonly prescriptionId: string
  readonly rowVersion: number
}

interface CancelPrescriptionInput extends PrescriptionRequestContext {
  readonly prescriptionId: string
  readonly rowVersion: number
}

interface PrescriptionIdentityInput extends PrescriptionRequestContext {
  readonly prescriptionId: string
}

interface ListPrescriptionsInput extends PrescriptionRequestContext {
  readonly query: PrescriptionListQuery
}

export interface PrescriptionService {
  readonly createPrescription: (input: CreatePrescriptionInput) => Promise<PrescriptionData>
  readonly updatePrescription: (input: UpdatePrescriptionInput) => Promise<PrescriptionData>
  readonly finalizePrescription: (input: FinalizePrescriptionInput) => Promise<PrescriptionData>
  readonly cancelPrescription: (input: CancelPrescriptionInput) => Promise<PrescriptionData>
  readonly getPrescription: (input: PrescriptionIdentityInput) => Promise<PrescriptionData>
  readonly listPrescriptions: (input: ListPrescriptionsInput) => Promise<PrescriptionListData>
}

interface PrescriptionServiceDependencies {
  readonly repository?: PrescriptionRepository
}

const prescriptionRoles = new Set(['DOCTOR'])

const assertIsDoctor = (input: PrescriptionRequestContext): void => {
  if (prescriptionRoles.has(input.principal.role)) return
  throw new DomainError(
    'FORBIDDEN',
    403,
    'Tindakan ini tidak tersedia untuk akun yang sedang digunakan.',
  )
}

const getPrescriptionNotFoundError = (): DomainError => {
  return new DomainError('PRESCRIPTION_NOT_FOUND', 404, 'Data resep tidak ditemukan.')
}

const mapPrescriptionList = (
  result: PrescriptionListResult,
  query: PrescriptionListQuery,
): PrescriptionListData => ({
  items: result.items.map(toPrescriptionData),
  pagination: {
    limit: query.limit,
    page: query.page,
    totalItems: result.totalItems,
    totalPages: result.totalItems === 0 ? 0 : Math.ceil(result.totalItems / query.limit),
  },
})

export const createPrescriptionService = ({
  repository = prescriptionRepository,
}: PrescriptionServiceDependencies = {}): PrescriptionService => ({
  createPrescription: async (input) => {
    assertIsDoctor(input)

    const result = await repository.createPrescription({ ...input })

    if (result.status === 'MEDICAL_RECORD_NOT_FOUND') {
      throw new DomainError('NOT_FOUND', 404, 'Data rekam medis tidak ditemukan.')
    }

    if (result.status === 'NOT_ASSIGNED_TO_DOCTOR') {
      throw new DomainError(
        'FORBIDDEN',
        403,
        'Anda hanya dapat membuat resep untuk pasien Anda sendiri.',
      )
    }

    if (result.status === 'MEDICAL_RECORD_LOCKED') {
      throw new DomainError(
        'INVALID_STATE',
        422,
        'Tidak dapat menambahkan resep pada rekam medis yang sudah difinalisasi.',
      )
    }

    if (result.status === 'PRESCRIPTION_ALREADY_EXISTS') {
      throw new DomainError('PRESCRIPTION_EXISTS', 409, 'Rekam medis ini sudah memiliki resep.')
    }

    if (result.status === 'MEDICATION_NOT_FOUND') {
      throw new DomainError(
        'VALIDATION_ERROR',
        422,
        'Satu atau lebih obat tidak ditemukan atau sudah tidak aktif.',
      )
    }

    return toPrescriptionData(result.prescription)
  },

  updatePrescription: async (input) => {
    assertIsDoctor(input)

    const result = await repository.updatePrescription({
      ...input,
      prescriptionPublicId: input.prescriptionId,
    })

    if (result.status === 'NOT_FOUND') throw getPrescriptionNotFoundError()
    if (result.status === 'VERSION_CONFLICT') {
      throw new DomainError(
        'PRESCRIPTION_VERSION_CONFLICT',
        409,
        'Data resep telah berubah. Muat ulang data lalu periksa kembali sebelum menyimpan.',
      )
    }
    if (result.status === 'LOCKED_RECORD') {
      throw new DomainError(
        'PRESCRIPTION_LOCKED',
        422,
        'Resep yang sudah difinalisasi atau dibatalkan tidak dapat diubah.',
      )
    }
    if (result.status === 'MEDICATION_NOT_FOUND') {
      throw new DomainError(
        'VALIDATION_ERROR',
        422,
        'Satu atau lebih obat tidak ditemukan atau sudah tidak aktif.',
      )
    }
    if (result.status === 'INVALID_STATUS_TRANSITION') {
      throw new DomainError('INVALID_STATE', 422, 'Status resep tidak dapat diubah.')
    }

    return toPrescriptionData(result.prescription)
  },

  finalizePrescription: async (input) => {
    assertIsDoctor(input)

    const result = await repository.updatePrescription({
      ...input,
      prescriptionPublicId: input.prescriptionId,
      data: { rowVersion: input.rowVersion },
      status: 'FINAL',
    })

    if (result.status === 'NOT_FOUND') throw getPrescriptionNotFoundError()
    if (result.status === 'VERSION_CONFLICT') {
      throw new DomainError('PRESCRIPTION_VERSION_CONFLICT', 409, 'Data resep telah berubah.')
    }
    if (result.status === 'LOCKED_RECORD') {
      throw new DomainError('PRESCRIPTION_LOCKED', 422, 'Resep tidak dalam status draft.')
    }
    if (result.status === 'INVALID_STATUS_TRANSITION') {
      throw new DomainError('INVALID_STATE', 422, 'Resep tidak dapat difinalisasi.')
    }
    if (result.status === 'MEDICATION_NOT_FOUND') {
      throw new DomainError('VALIDATION_ERROR', 422, 'Satu atau lebih obat tidak ditemukan.')
    }

    return toPrescriptionData(result.prescription)
  },

  cancelPrescription: async (input) => {
    assertIsDoctor(input)

    const result = await repository.updatePrescription({
      ...input,
      prescriptionPublicId: input.prescriptionId,
      data: { rowVersion: input.rowVersion },
      status: 'CANCELLED',
    })

    if (result.status === 'NOT_FOUND') throw getPrescriptionNotFoundError()
    if (result.status === 'VERSION_CONFLICT') {
      throw new DomainError('PRESCRIPTION_VERSION_CONFLICT', 409, 'Data resep telah berubah.')
    }
    if (result.status === 'LOCKED_RECORD') {
      throw new DomainError('PRESCRIPTION_LOCKED', 422, 'Resep tidak dalam status draft.')
    }
    if (result.status === 'INVALID_STATUS_TRANSITION') {
      throw new DomainError('INVALID_STATE', 422, 'Resep tidak dapat dibatalkan.')
    }
    if (result.status === 'MEDICATION_NOT_FOUND') {
      throw new DomainError('VALIDATION_ERROR', 422, 'Satu atau lebih obat tidak ditemukan.')
    }

    return toPrescriptionData(result.prescription)
  },

  getPrescription: async (input) => {
    assertIsDoctor(input)
    const record = await repository.findPrescription({
      ...input,
      prescriptionPublicId: input.prescriptionId,
    })
    if (!record) throw getPrescriptionNotFoundError()
    return toPrescriptionData(record)
  },

  listPrescriptions: async (input) => {
    assertIsDoctor(input)
    const result = await repository.listPrescriptions({ ...input, query: input.query })
    return mapPrescriptionList(result, input.query)
  },
})

export const prescriptionService = createPrescriptionService()
