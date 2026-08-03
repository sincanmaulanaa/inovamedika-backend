import { DomainError } from '../../http/domain-error.js'
import { toQueueAdministrativeData } from './queue.mapper.js'
import { queueRepository, type QueueRepository } from './queue.repository.js'
import type {
  QueueAdministrativeData,
  QueueListData,
  QueueListQuery,
  QueueRequestContext,
} from './queue.types.js'

interface CreateQueueInput extends QueueRequestContext {
  readonly registrationId: string
}

interface CallNextInput extends QueueRequestContext {
  readonly queueLaneId: string
  readonly date: string
}

interface QueueIdentityInput extends QueueRequestContext {
  readonly queueId: string
}

interface ListQueuesInput extends QueueRequestContext {
  readonly query: QueueListQuery
}

export interface QueueService {
  readonly createQueue: (input: CreateQueueInput) => Promise<QueueAdministrativeData>
  readonly callNext: (input: CallNextInput) => Promise<QueueAdministrativeData>
  readonly recall: (input: QueueIdentityInput) => Promise<QueueAdministrativeData>
  readonly skip: (input: QueueIdentityInput) => Promise<QueueAdministrativeData>
  readonly requeue: (input: QueueIdentityInput) => Promise<QueueAdministrativeData>
  readonly start: (input: QueueIdentityInput) => Promise<QueueAdministrativeData>
  readonly listQueues: (input: ListQueuesInput) => Promise<QueueListData>
}

interface QueueServiceDependencies {
  readonly repository?: QueueRepository
}

const queueManagementRoles = new Set(['ADMINISTRATOR', 'REGISTRATION_OFFICER', 'DOCTOR'])

const assertCanManageQueues = (input: QueueRequestContext): void => {
  if (queueManagementRoles.has(input.principal.role)) return
  throw new DomainError(
    'FORBIDDEN',
    403,
    'Tindakan ini tidak tersedia untuk akun yang sedang digunakan.',
  )
}

export const createQueueService = ({
  repository = queueRepository,
}: QueueServiceDependencies = {}): QueueService => ({
  createQueue: async (input) => {
    assertCanManageQueues(input)

    const result = await repository.createQueue({
      ...input,
      registrationPublicId: input.registrationId,
    })

    if (result.status === 'REGISTRATION_NOT_FOUND') {
      throw new DomainError('NOT_FOUND', 404, 'Data pendaftaran tidak ditemukan.')
    }

    if (result.status === 'REGISTRATION_NOT_CHECKED_IN') {
      throw new DomainError('INVALID_STATE', 422, 'Pasien belum melakukan check-in pendaftaran.')
    }

    if (result.status === 'QUEUE_ALREADY_EXISTS') {
      throw new DomainError('QUEUE_EXISTS', 409, 'Pendaftaran ini sudah memiliki antrean aktif.')
    }

    return toQueueAdministrativeData(result.queue)
  },

  callNext: async (input) => {
    assertCanManageQueues(input)

    const result = await repository.callNextQueue({
      ...input,
      date: input.date,
      queueLanePublicId: input.queueLaneId,
    })

    if (result.status === 'LANE_NOT_FOUND') {
      throw new DomainError('NOT_FOUND', 404, 'Jalur antrean tidak ditemukan.')
    }

    if (result.status === 'LANE_NOT_ASSIGNED_TO_DOCTOR') {
      throw new DomainError('FORBIDDEN', 403, 'Anda tidak ditugaskan pada jalur antrean ini.')
    }

    if (result.status === 'ACTIVE_CALL_EXISTS') {
      throw new DomainError(
        'ACTIVE_CALL_EXISTS',
        409,
        'Masih ada pasien yang sedang dipanggil atau dilayani pada jalur ini. Selesaikan atau lewati antrean tersebut terlebih dahulu.',
      )
    }

    if (result.status === 'EMPTY_QUEUE') {
      throw new DomainError(
        'EMPTY_QUEUE',
        404,
        'Tidak ada pasien dalam antrean (semua sudah terpanggil).',
      )
    }

    return toQueueAdministrativeData(result.queue)
  },

  recall: async (input) => {
    assertCanManageQueues(input)

    const result = await repository.recallQueue({ ...input, queuePublicId: input.queueId })

    if (result.status === 'NOT_FOUND')
      throw new DomainError('NOT_FOUND', 404, 'Antrean tidak ditemukan.')
    if (result.status === 'NOT_CALLED_STATE')
      throw new DomainError(
        'INVALID_STATE',
        422,
        'Hanya antrean yang sedang dipanggil yang dapat dipanggil ulang.',
      )

    return toQueueAdministrativeData(result.queue)
  },

  skip: async (input) => {
    assertCanManageQueues(input)

    const result = await repository.skipQueue({ ...input, queuePublicId: input.queueId })

    if (result.status === 'NOT_FOUND')
      throw new DomainError('NOT_FOUND', 404, 'Antrean tidak ditemukan.')
    if (result.status === 'NOT_CALLED_STATE')
      throw new DomainError(
        'INVALID_STATE',
        422,
        'Hanya antrean yang sedang dipanggil yang dapat dilewati.',
      )
    if (result.status === 'MINIMUM_CALLS_NOT_REACHED') {
      throw new DomainError(
        'MINIMUM_CALLS_NOT_REACHED',
        422,
        'Pasien harus dipanggil minimal 2 kali sebelum dapat dilewati.',
      )
    }

    return toQueueAdministrativeData(result.queue)
  },

  requeue: async (input) => {
    assertCanManageQueues(input)

    const result = await repository.requeueQueue({ ...input, queuePublicId: input.queueId })

    if (result.status === 'NOT_FOUND')
      throw new DomainError('NOT_FOUND', 404, 'Antrean tidak ditemukan.')
    if (result.status === 'NOT_SKIPPED_STATE')
      throw new DomainError(
        'INVALID_STATE',
        422,
        'Hanya antrean yang terlewati yang dapat dimasukkan kembali.',
      )

    return toQueueAdministrativeData(result.queue)
  },

  start: async (input) => {
    assertCanManageQueues(input)

    const result = await repository.startQueue({ ...input, queuePublicId: input.queueId })

    if (result.status === 'NOT_FOUND')
      throw new DomainError('NOT_FOUND', 404, 'Antrean tidak ditemukan.')
    if (result.status === 'NOT_CALLED_STATE')
      throw new DomainError(
        'INVALID_STATE',
        422,
        'Hanya antrean yang sedang dipanggil yang dapat dimulai pelayanannya.',
      )
    if (result.status === 'NOT_ASSIGNED_TO_DOCTOR')
      throw new DomainError('FORBIDDEN', 403, 'Anda tidak ditugaskan pada antrean ini.')

    return toQueueAdministrativeData(result.queue)
  },

  listQueues: async (input) => {
    assertCanManageQueues(input)
    const result = await repository.listQueues({ ...input, query: input.query })
    return { items: result.items.map(toQueueAdministrativeData) }
  },
})

export const queueService = createQueueService()
