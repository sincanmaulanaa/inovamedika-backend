import { Prisma } from '../../generated/prisma/client.js'

import { withTransaction } from '../../db/transaction.js'
import type { AuthRequestMetadata, AuthenticatedPrincipal } from '../auth/auth.types.js'
import {
  queueStatuses,
  type QueueListQuery,
  type QueueRecord,
  type QueueStatus,
} from './queue.types.js'

interface QueueRow {
  readonly id: bigint
  readonly public_id: string
  readonly registration_id: bigint
  readonly registration_public_id: string
  readonly queue_lane_id: bigint
  readonly lane_public_id: string
  readonly lane_display_name: string
  readonly service_date: Date
  readonly sequence_number: bigint
  readonly service_order: bigint
  readonly display_number: string
  readonly status: string
  readonly call_count: number
  readonly last_called_at: Date | null
  readonly skipped_at: Date | null
  readonly requeued_at: Date | null
  readonly serving_started_at: Date | null
  readonly completed_at: Date | null
  readonly cancelled_at: Date | null
  readonly cancellation_reason: string | null
  readonly row_version: number
  readonly patient_name: string
  readonly patient_mrn: string
}

interface QueueRepositoryContext {
  readonly metadata: AuthRequestMetadata
  readonly principal: AuthenticatedPrincipal
}

interface AuditInput extends QueueRepositoryContext {
  readonly action: string
  readonly outcome: 'SUCCESS' | 'FAILURE'
  readonly queueId?: bigint | undefined
  readonly registrationId?: bigint | undefined
  readonly resourcePublicId?: string | undefined
  readonly reason?: string | undefined
  readonly metadataValues?: Readonly<Record<string, unknown>> | undefined
}

export interface CreateQueueInput extends QueueRepositoryContext {
  readonly registrationPublicId: string
}

export interface CallNextQueueInput extends QueueRepositoryContext {
  readonly queueLanePublicId: string
  readonly date: string
}

export interface RecallQueueInput extends QueueRepositoryContext {
  readonly queuePublicId: string
}

export interface SkipQueueInput extends QueueRepositoryContext {
  readonly queuePublicId: string
}

export interface RequeueQueueInput extends QueueRepositoryContext {
  readonly queuePublicId: string
}

export interface StartQueueInput extends QueueRepositoryContext {
  readonly queuePublicId: string
}

export interface ListQueuesInput extends QueueRepositoryContext {
  readonly query: QueueListQuery
}

export type CreateQueueResult =
  | { readonly status: 'CREATED'; readonly queue: QueueRecord }
  | { readonly status: 'REGISTRATION_NOT_FOUND' }
  | { readonly status: 'REGISTRATION_NOT_CHECKED_IN' }
  | { readonly status: 'QUEUE_ALREADY_EXISTS' }

export type CallNextQueueResult =
  | { readonly status: 'CALLED'; readonly queue: QueueRecord }
  | { readonly status: 'LANE_NOT_FOUND' }
  | { readonly status: 'LANE_NOT_ASSIGNED_TO_DOCTOR' }
  | { readonly status: 'ACTIVE_CALL_EXISTS' }
  | { readonly status: 'EMPTY_QUEUE' }

export type RecallQueueResult =
  | { readonly status: 'RECALLED'; readonly queue: QueueRecord }
  | { readonly status: 'NOT_FOUND' }
  | { readonly status: 'NOT_CALLED_STATE' }

export type SkipQueueResult =
  | { readonly status: 'SKIPPED'; readonly queue: QueueRecord }
  | { readonly status: 'NOT_FOUND' }
  | { readonly status: 'NOT_CALLED_STATE' }
  | { readonly status: 'MINIMUM_CALLS_NOT_REACHED' }

export type RequeueQueueResult =
  | { readonly status: 'REQUEUED'; readonly queue: QueueRecord }
  | { readonly status: 'NOT_FOUND' }
  | { readonly status: 'NOT_SKIPPED_STATE' }

export type StartQueueResult =
  | { readonly status: 'STARTED'; readonly queue: QueueRecord }
  | { readonly status: 'NOT_FOUND' }
  | { readonly status: 'NOT_CALLED_STATE' }
  | { readonly status: 'NOT_ASSIGNED_TO_DOCTOR' }

export interface QueueListResult {
  readonly items: readonly QueueRecord[]
}

export interface QueueRepository {
  readonly createQueue: (input: CreateQueueInput) => Promise<CreateQueueResult>
  readonly callNextQueue: (input: CallNextQueueInput) => Promise<CallNextQueueResult>
  readonly recallQueue: (input: RecallQueueInput) => Promise<RecallQueueResult>
  readonly skipQueue: (input: SkipQueueInput) => Promise<SkipQueueResult>
  readonly requeueQueue: (input: RequeueQueueInput) => Promise<RequeueQueueResult>
  readonly startQueue: (input: StartQueueInput) => Promise<StartQueueResult>
  readonly listQueues: (input: ListQueuesInput) => Promise<QueueListResult>
}

const parseQueueStatus = (value: string): QueueStatus => {
  const parsed = queueStatuses.find((s) => s === value)
  if (!parsed) throw new Error('Stored queue status is not supported')
  return parsed
}

const queueColumns = Prisma.sql`
  q.id,
  q.public_id,
  q.registration_id,
  r.public_id as registration_public_id,
  q.queue_lane_id,
  ql.public_id as lane_public_id,
  ql.display_name as lane_display_name,
  q.service_date,
  q.sequence_number,
  q.service_order,
  q.display_number,
  q.status,
  q.call_count,
  q.last_called_at,
  q.skipped_at,
  q.requeued_at,
  q.serving_started_at,
  q.completed_at,
  q.cancelled_at,
  q.cancellation_reason,
  q.row_version,
  p.full_name as patient_name,
  p.medical_record_number as patient_mrn
`

const queueJoins = Prisma.sql`
  from public.queues q
  join public.registrations r on r.id = q.registration_id
  join public.queue_lanes ql on ql.id = q.queue_lane_id
  join public.patients p on p.id = r.patient_id
`

const mapQueueRow = (row: QueueRow): QueueRecord => ({
  callCount: row.call_count,
  cancellationReason: row.cancellation_reason,
  cancelledAt: row.cancelled_at,
  completedAt: row.completed_at,
  displayNumber: row.display_number,
  id: row.id,
  laneDisplayName: row.lane_display_name,
  lanePublicId: row.lane_public_id,
  lastCalledAt: row.last_called_at,
  patientMedicalRecordNumber: row.patient_mrn,
  patientName: row.patient_name,
  publicId: row.public_id,
  queueLaneId: row.queue_lane_id,
  registrationId: row.registration_id,
  registrationPublicId: row.registration_public_id,
  requeuedAt: row.requeued_at,
  rowVersion: row.row_version,
  sequenceNumber: row.sequence_number,
  serviceDate: row.service_date,
  serviceOrder: row.service_order,
  servingStartedAt: row.serving_started_at,
  skippedAt: row.skipped_at,
  status: parseQueueStatus(row.status),
})

const createAudit = async (
  transaction: Prisma.TransactionClient,
  input: AuditInput,
): Promise<void> => {
  const metadata = JSON.stringify(input.metadataValues ?? {})

  await transaction.$executeRaw`
    insert into public.audit_logs (
      actor_user_id, actor_username_snapshot, actor_role_snapshot, session_id,
      registration_id, resource_type, resource_public_id, action, outcome, reason,
      request_id, ip_address, user_agent, metadata
    ) values (
      ${input.principal.internalUserId}, ${input.principal.username}, ${input.principal.role}, ${input.principal.internalSessionId},
      ${input.registrationId ?? null}, 'QUEUE', cast(${input.resourcePublicId ?? null} as uuid), ${input.action}, ${input.outcome}, ${input.reason ?? null},
      ${input.metadata.requestId}, cast(${input.metadata.ipAddress ?? null} as inet), ${input.metadata.userAgent ?? null}, cast(${metadata} as jsonb)
    )
  `
}

const insertStatusHistory = async (
  transaction: Prisma.TransactionClient,
  queueId: bigint,
  fromStatus: QueueStatus | null,
  toStatus: QueueStatus,
  userId: bigint,
  reason: string | null = null,
): Promise<void> => {
  await transaction.$executeRaw`
    insert into public.queue_status_history (
      queue_id, from_status, to_status, reason, changed_by_user_id
    ) values (
      ${queueId}, ${fromStatus}, ${toStatus}, ${reason}, ${userId}
    )
  `
}

export const queueRepository: QueueRepository = {
  createQueue: async (input) => {
    return withTransaction(async (transaction): Promise<CreateQueueResult> => {
      const registrations = await transaction.$queryRaw<
        readonly {
          readonly id: bigint
          readonly service_date: Date
          readonly polyclinic_id: bigint
          readonly status: string
        }[]
      >`
        select id, service_date, polyclinic_id, status
        from public.registrations
        where public_id = cast(${input.registrationPublicId} as uuid)
      `

      const registration = registrations[0]

      if (!registration) {
        await createAudit(transaction, {
          ...input,
          action: 'QUEUE_CREATED',
          outcome: 'FAILURE',
          reason: 'REGISTRATION_NOT_FOUND',
        })
        return { status: 'REGISTRATION_NOT_FOUND' }
      }

      if (registration.status !== 'CHECKED_IN' && registration.status !== 'WAITING') {
        // According to queue.service.ts business rules, must be CHECKED_IN, but we will allow it to be created if the caller wants. The service layer will validate if we only want CHECKED_IN.
        // Actually PRD says queue is created after check-in. We'll let service validate or just check here. Let's enforce CHECKED_IN here to be safe.
        if (registration.status !== 'CHECKED_IN') {
          await createAudit(transaction, {
            ...input,
            action: 'QUEUE_CREATED',
            outcome: 'FAILURE',
            reason: 'REGISTRATION_NOT_CHECKED_IN',
          })
          return { status: 'REGISTRATION_NOT_CHECKED_IN' }
        }
      }

      const existingQueues = await transaction.$queryRaw<readonly { readonly id: bigint }[]>`
        select id from public.queues where registration_id = ${registration.id}
      `

      if (existingQueues.length > 0) {
        await createAudit(transaction, {
          ...input,
          action: 'QUEUE_CREATED',
          outcome: 'FAILURE',
          reason: 'QUEUE_ALREADY_EXISTS',
        })
        return { status: 'QUEUE_ALREADY_EXISTS' }
      }

      // Find the lane for this polyclinic (using the first active lane for simplicity, or should it be linked to doctor? The registration has doctor_id. Let's use the doctor_id from registration)
      const regFull = await transaction.$queryRaw<readonly { readonly doctor_id: bigint }[]>`
        select doctor_id from public.registrations where id = ${registration.id}
      `
      const doctorId = regFull[0]!.doctor_id

      const lanes = await transaction.$queryRaw<
        readonly { readonly id: bigint; readonly queue_prefix: string }[]
      >`
        select id, queue_prefix from public.queue_lanes
        where polyclinic_id = ${registration.polyclinic_id} and doctor_id = ${doctorId} and is_active = true limit 1
      `

      if (lanes.length === 0) {
        throw new Error('Queue lane not found for registration polyclinic and doctor')
      }

      const lane = lanes[0]!

      // Atomic sequence number generation
      const counters = await transaction.$queryRaw<
        readonly { readonly last_sequence_number: bigint; readonly last_service_order: bigint }[]
      >`
        insert into public.queue_counters (service_date, queue_lane_id, last_sequence_number, last_service_order)
        values (cast(${registration.service_date} as date), ${lane.id}, 1, 1)
        on conflict (service_date, queue_lane_id)
        do update set 
          last_sequence_number = public.queue_counters.last_sequence_number + 1,
          last_service_order = public.queue_counters.last_service_order + 1
        returning last_sequence_number, last_service_order
      `

      const sequenceNumber = counters[0]!.last_sequence_number
      const serviceOrder = counters[0]!.last_service_order
      const displayNumber = `${lane.queue_prefix}-${sequenceNumber.toString().padStart(3, '0')}`

      const rows = await transaction.$queryRaw<
        readonly { readonly id: bigint; readonly public_id: string }[]
      >`
        insert into public.queues (
          registration_id, queue_lane_id, service_date, sequence_number, service_order, display_number, status, created_by_user_id, updated_by_user_id
        ) values (
          ${registration.id}, ${lane.id}, cast(${registration.service_date} as date), ${sequenceNumber}, ${serviceOrder}, ${displayNumber}, 'WAITING', ${input.principal.internalUserId}, ${input.principal.internalUserId}
        ) returning id, public_id
      `
      const queueId = rows[0]!.id

      await insertStatusHistory(
        transaction,
        queueId,
        null,
        'WAITING',
        input.principal.internalUserId,
      )

      const fullRows = await transaction.$queryRaw<readonly QueueRow[]>(Prisma.sql`
        select ${queueColumns} ${queueJoins} where q.id = ${queueId}
      `)

      await createAudit(transaction, {
        ...input,
        action: 'QUEUE_CREATED',
        outcome: 'SUCCESS',
        registrationId: registration.id,
        resourcePublicId: rows[0]!.public_id,
      })

      return { status: 'CREATED', queue: mapQueueRow(fullRows[0]!) }
    })
  },

  callNextQueue: async (input) => {
    return withTransaction(async (transaction): Promise<CallNextQueueResult> => {
      const lanes = await transaction.$queryRaw<
        readonly { readonly id: bigint; readonly doctor_id: bigint }[]
      >`
        select id, doctor_id from public.queue_lanes where public_id = cast(${input.queueLanePublicId} as uuid)
      `
      const lane = lanes[0]
      if (!lane) return { status: 'LANE_NOT_FOUND' }

      if (lane.doctor_id !== input.principal.internalUserId) {
        // Note: in a real system, nurses might call next on behalf of doctors, but for this demo, assume doctor calls their own, or check roles.
        // If role is DOCTOR, must match. If ADMIN/REGISTRATION, we might allow it.
        if (input.principal.role === 'DOCTOR') {
          return { status: 'LANE_NOT_ASSIGNED_TO_DOCTOR' }
        }
      }

      // Check for active calls (CALLED or SERVING)
      const activeCalls = await transaction.$queryRaw<readonly { readonly id: bigint }[]>`
        select id from public.queues
        where queue_lane_id = ${lane.id} and service_date = cast(${input.date} as date) and status in ('CALLED', 'SERVING')
        for update
      `

      if (activeCalls.length > 0) {
        return { status: 'ACTIVE_CALL_EXISTS' }
      }

      // Find next WAITING
      const nextQueues = await transaction.$queryRaw<
        readonly { readonly id: bigint; readonly status: string }[]
      >`
        select id, status from public.queues
        where queue_lane_id = ${lane.id} and service_date = cast(${input.date} as date) and status = 'WAITING'
        order by service_order asc
        limit 1
        for update
      `

      const nextQueue = nextQueues[0]
      if (!nextQueue) return { status: 'EMPTY_QUEUE' }

      await transaction.$executeRaw`
        update public.queues
        set status = 'CALLED', call_count = 1, last_called_at = clock_timestamp(), updated_by_user_id = ${input.principal.internalUserId}
        where id = ${nextQueue.id}
      `
      await insertStatusHistory(
        transaction,
        nextQueue.id,
        parseQueueStatus(nextQueue.status),
        'CALLED',
        input.principal.internalUserId,
      )

      // Also insert queue call event
      await transaction.$executeRaw`
        insert into public.queue_call_events (queue_id, call_number, called_by_user_id)
        values (${nextQueue.id}, 1, ${input.principal.internalUserId})
      `

      const fullRows = await transaction.$queryRaw<readonly QueueRow[]>(
        Prisma.sql`select ${queueColumns} ${queueJoins} where q.id = ${nextQueue.id}`,
      )

      return { status: 'CALLED', queue: mapQueueRow(fullRows[0]!) }
    })
  },

  recallQueue: async (input) => {
    return withTransaction(async (transaction): Promise<RecallQueueResult> => {
      const lockRows = await transaction.$queryRaw<
        readonly { readonly id: bigint; readonly status: string; readonly call_count: number }[]
      >`
        select id, status, call_count from public.queues where public_id = cast(${input.queuePublicId} as uuid) for update
      `
      const q = lockRows[0]
      if (!q) return { status: 'NOT_FOUND' }
      if (q.status !== 'CALLED') return { status: 'NOT_CALLED_STATE' }

      await transaction.$executeRaw`
        update public.queues
        set call_count = call_count + 1, last_called_at = clock_timestamp(), updated_by_user_id = ${input.principal.internalUserId}
        where id = ${q.id}
      `
      await transaction.$executeRaw`
        insert into public.queue_call_events (queue_id, call_number, called_by_user_id)
        values (${q.id}, ${q.call_count + 1}, ${input.principal.internalUserId})
      `

      const fullRows = await transaction.$queryRaw<readonly QueueRow[]>(
        Prisma.sql`select ${queueColumns} ${queueJoins} where q.id = ${q.id}`,
      )
      return { status: 'RECALLED', queue: mapQueueRow(fullRows[0]!) }
    })
  },

  skipQueue: async (input) => {
    return withTransaction(async (transaction): Promise<SkipQueueResult> => {
      const lockRows = await transaction.$queryRaw<
        readonly { readonly id: bigint; readonly status: string; readonly call_count: number }[]
      >`
        select id, status, call_count from public.queues where public_id = cast(${input.queuePublicId} as uuid) for update
      `
      const q = lockRows[0]
      if (!q) return { status: 'NOT_FOUND' }
      if (q.status !== 'CALLED') return { status: 'NOT_CALLED_STATE' }
      if (q.call_count < 2) return { status: 'MINIMUM_CALLS_NOT_REACHED' }

      await transaction.$executeRaw`
        update public.queues
        set status = 'SKIPPED', skipped_at = clock_timestamp(), updated_by_user_id = ${input.principal.internalUserId}
        where id = ${q.id}
      `
      await insertStatusHistory(
        transaction,
        q.id,
        parseQueueStatus(q.status),
        'SKIPPED',
        input.principal.internalUserId,
      )

      const fullRows = await transaction.$queryRaw<readonly QueueRow[]>(
        Prisma.sql`select ${queueColumns} ${queueJoins} where q.id = ${q.id}`,
      )
      return { status: 'SKIPPED', queue: mapQueueRow(fullRows[0]!) }
    })
  },

  requeueQueue: async (input) => {
    return withTransaction(async (transaction): Promise<RequeueQueueResult> => {
      const lockRows = await transaction.$queryRaw<
        readonly {
          readonly id: bigint
          readonly status: string
          readonly service_date: Date
          readonly queue_lane_id: bigint
        }[]
      >`
        select id, status, service_date, queue_lane_id from public.queues where public_id = cast(${input.queuePublicId} as uuid) for update
      `
      const q = lockRows[0]
      if (!q) return { status: 'NOT_FOUND' }
      if (q.status !== 'SKIPPED') return { status: 'NOT_SKIPPED_STATE' }

      const counters = await transaction.$queryRaw<
        readonly { readonly last_service_order: bigint }[]
      >`
        update public.queue_counters
        set last_service_order = last_service_order + 1
        where service_date = cast(${q.service_date} as date) and queue_lane_id = ${q.queue_lane_id}
        returning last_service_order
      `
      const serviceOrder = counters[0]!.last_service_order

      await transaction.$executeRaw`
        update public.queues
        set status = 'WAITING', service_order = ${serviceOrder}, requeued_at = clock_timestamp(), updated_by_user_id = ${input.principal.internalUserId}
        where id = ${q.id}
      `
      await insertStatusHistory(
        transaction,
        q.id,
        parseQueueStatus(q.status),
        'WAITING',
        input.principal.internalUserId,
        'Dimasukkan kembali ke antrean',
      )

      const fullRows = await transaction.$queryRaw<readonly QueueRow[]>(
        Prisma.sql`select ${queueColumns} ${queueJoins} where q.id = ${q.id}`,
      )
      return { status: 'REQUEUED', queue: mapQueueRow(fullRows[0]!) }
    })
  },

  startQueue: async (input) => {
    return withTransaction(async (transaction): Promise<StartQueueResult> => {
      const lockRows = await transaction.$queryRaw<
        readonly {
          readonly id: bigint
          readonly status: string
          readonly registration_id: bigint
          readonly queue_lane_id: bigint
        }[]
      >`
        select id, status, registration_id, queue_lane_id from public.queues where public_id = cast(${input.queuePublicId} as uuid) for update
      `
      const q = lockRows[0]
      if (!q) return { status: 'NOT_FOUND' }
      if (q.status !== 'CALLED') return { status: 'NOT_CALLED_STATE' }

      const lanes = await transaction.$queryRaw<readonly { readonly doctor_id: bigint }[]>`
        select doctor_id from public.queue_lanes where id = ${q.queue_lane_id}
      `
      if (
        input.principal.role === 'DOCTOR' &&
        lanes[0]?.doctor_id !== input.principal.internalUserId
      ) {
        return { status: 'NOT_ASSIGNED_TO_DOCTOR' }
      }

      await transaction.$executeRaw`
        update public.queues
        set status = 'SERVING', serving_started_at = clock_timestamp(), updated_by_user_id = ${input.principal.internalUserId}
        where id = ${q.id}
      `
      await insertStatusHistory(
        transaction,
        q.id,
        parseQueueStatus(q.status),
        'SERVING',
        input.principal.internalUserId,
      )

      // Also update registration
      await transaction.$executeRaw`
        update public.registrations
        set status = 'IN_EXAM', exam_started_at = clock_timestamp(), updated_by_user_id = ${input.principal.internalUserId}
        where id = ${q.registration_id}
      `
      await transaction.$executeRaw`
        insert into public.registration_status_history (registration_id, from_status, to_status, changed_by_user_id)
        values (${q.registration_id}, 'CHECKED_IN', 'IN_EXAM', ${input.principal.internalUserId})
      `

      const fullRows = await transaction.$queryRaw<readonly QueueRow[]>(
        Prisma.sql`select ${queueColumns} ${queueJoins} where q.id = ${q.id}`,
      )
      return { status: 'STARTED', queue: mapQueueRow(fullRows[0]!) }
    })
  },

  listQueues: async (input) => {
    return withTransaction(async (transaction): Promise<QueueListResult> => {
      const filters: Prisma.Sql[] = [
        Prisma.sql`and q.service_date = cast(${input.query.date} as date)`,
      ]

      if (input.query.polyclinicId) {
        filters.push(
          Prisma.sql`and ql.polyclinic_id = (select id from public.polyclinics where public_id = cast(${input.query.polyclinicId} as uuid))`,
        )
      }
      if (input.query.doctorId) {
        filters.push(
          Prisma.sql`and ql.doctor_id = (select id from public.doctors where public_id = cast(${input.query.doctorId} as uuid))`,
        )
      }
      if (input.query.queueLaneId) {
        filters.push(Prisma.sql`and ql.public_id = cast(${input.query.queueLaneId} as uuid)`)
      }
      if (input.query.status) {
        filters.push(Prisma.sql`and q.status = ${input.query.status}`)
      }
      if (input.query.search) {
        const escapedSearch = input.query.search.replace(/[\\%_]/g, '\\$&')
        const searchPattern = `%${escapedSearch}%`
        filters.push(
          Prisma.sql`and (p.full_name ilike ${searchPattern} escape '\\' or q.display_number ilike ${searchPattern} escape '\\')`,
        )
      }

      const filterFragment = Prisma.join(filters, ' ')

      const rows = await transaction.$queryRaw<readonly QueueRow[]>(Prisma.sql`
        select ${queueColumns}
        ${queueJoins}
        where 1 = 1
        ${filterFragment}
        order by q.service_order asc, q.id asc
      `)

      return { items: rows.map(mapQueueRow) }
    })
  },
}
