import { Prisma } from '../../generated/prisma/client.js'

import { withTransaction } from '../../db/transaction.js'
import type { AuthRequestMetadata, AuthenticatedPrincipal } from '../auth/auth.types.js'
import {
  medicalRecordStatuses,
  type MedicalRecordListQuery,
  type MedicalRecordRecord,
  type MedicalRecordStatus,
} from './medical-record.types.js'

interface MedicalRecordRow {
  readonly id: bigint
  readonly public_id: string
  readonly patient_id: bigint
  readonly patient_public_id: string
  readonly patient_name: string
  readonly patient_mrn: string
  readonly registration_id: bigint
  readonly registration_public_id: string
  readonly doctor_id: bigint
  readonly doctor_public_id: string
  readonly doctor_name: string
  readonly polyclinic_id: bigint
  readonly polyclinic_public_id: string
  readonly polyclinic_name: string
  readonly visit_date: Date
  readonly subjective: string | null
  readonly objective: string | null
  readonly assessment: string | null
  readonly plan: string | null
  readonly status: string
  readonly amendment_reason: string | null
  readonly finalized_at: Date | null
  readonly row_version: number
  readonly created_at: Date
  readonly updated_at: Date
}

interface MedicalRecordRepositoryContext {
  readonly metadata: AuthRequestMetadata
  readonly principal: AuthenticatedPrincipal
}

interface AuditInput extends MedicalRecordRepositoryContext {
  readonly action: string
  readonly outcome: 'SUCCESS' | 'FAILURE'
  readonly patientId?: bigint | undefined
  readonly registrationId?: bigint | undefined
  readonly medicalRecordId?: bigint | undefined
  readonly resourcePublicId?: string | undefined
  readonly reason?: string | undefined
  readonly metadataValues?: Readonly<Record<string, unknown>> | undefined
}

export interface CreateMedicalRecordInput extends MedicalRecordRepositoryContext {
  readonly registrationPublicId: string
  readonly subjective: string | null
  readonly objective: string | null
  readonly assessment: string | null
  readonly plan: string | null
}

export interface UpdateMedicalRecordInput extends MedicalRecordRepositoryContext {
  readonly medicalRecordPublicId: string
  readonly rowVersion: number
  readonly subjective?: string | null | undefined
  readonly objective?: string | null | undefined
  readonly assessment?: string | null | undefined
  readonly plan?: string | null | undefined
  readonly amendmentReason?: string | null | undefined
  readonly status?: MedicalRecordStatus | undefined
  readonly finalizedAt?: boolean | undefined
}

export interface ListMedicalRecordsInput extends MedicalRecordRepositoryContext {
  readonly query: MedicalRecordListQuery
}

export interface FindMedicalRecordInput extends MedicalRecordRepositoryContext {
  readonly medicalRecordPublicId: string
}

export type CreateMedicalRecordResult =
  | { readonly status: 'CREATED'; readonly medicalRecord: MedicalRecordRecord }
  | { readonly status: 'REGISTRATION_NOT_FOUND' }
  | { readonly status: 'MEDICAL_RECORD_ALREADY_EXISTS'; readonly existingId: string }
  | { readonly status: 'NOT_ASSIGNED_TO_DOCTOR' }

export type UpdateMedicalRecordResult =
  | { readonly status: 'UPDATED'; readonly medicalRecord: MedicalRecordRecord }
  | { readonly status: 'NOT_FOUND' }
  | { readonly status: 'LOCKED_RECORD' }
  | { readonly status: 'CORRECTION_REQUEST_REQUIRED' }
  | { readonly status: 'INVALID_STATUS_TRANSITION' }
  | { readonly status: 'VERSION_CONFLICT' }

export interface MedicalRecordListResult {
  readonly items: readonly MedicalRecordRecord[]
  readonly totalItems: number
}

export interface MedicalRecordRepository {
  readonly createMedicalRecord: (
    input: CreateMedicalRecordInput,
  ) => Promise<CreateMedicalRecordResult>
  readonly updateMedicalRecord: (
    input: UpdateMedicalRecordInput,
  ) => Promise<UpdateMedicalRecordResult>
  readonly createCorrectionRequest: (input: {
    readonly medicalRecordPublicId: string
    readonly reason: string
    readonly principal: AuthenticatedPrincipal
    readonly metadata: AuthRequestMetadata
  }) => Promise<{ status: 'CREATED' } | { status: 'NOT_FOUND' }>
  readonly approveCorrectionRequest: (input: {
    readonly correctionRequestId: string
    readonly principal: AuthenticatedPrincipal
    readonly metadata: AuthRequestMetadata
  }) => Promise<{ status: 'APPROVED' } | { status: 'NOT_FOUND' }>
  readonly listMedicalRecords: (input: ListMedicalRecordsInput) => Promise<MedicalRecordListResult>
  readonly findMedicalRecord: (input: FindMedicalRecordInput) => Promise<MedicalRecordRecord | null>
}

const parseMedicalRecordStatus = (value: string): MedicalRecordStatus => {
  const parsed = medicalRecordStatuses.find((s) => s === value)
  if (!parsed) throw new Error('Stored medical record status is not supported')
  return parsed
}

const getCount = (value: bigint | number | string): number => {
  const count = Number(value)
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('Count exceeds safe integer')
  return count
}

const recordColumns = Prisma.sql`
  mr.id,
  mr.public_id,
  mr.patient_id,
  p.public_id as patient_public_id,
  p.full_name as patient_name,
  p.medical_record_number as patient_mrn,
  mr.registration_id,
  r.public_id as registration_public_id,
  mr.doctor_id,
  d.public_id as doctor_public_id,
  d.full_name as doctor_name,
  mr.polyclinic_id,
  pol.public_id as polyclinic_public_id,
  pol.name as polyclinic_name,
  mr.visit_date,
  mr.subjective,
  mr.objective,
  mr.assessment,
  mr.plan,
  mr.status,
  mr.amendment_reason,
  mr.finalized_at,
  mr.row_version,
  mr.created_at,
  mr.updated_at
`

const recordJoins = Prisma.sql`
  from public.medical_records mr
  join public.patients p on p.id = mr.patient_id
  join public.registrations r on r.id = mr.registration_id
  join public.doctors d on d.id = mr.doctor_id
  join public.polyclinics pol on pol.id = mr.polyclinic_id
`

const mapMedicalRecordRow = (row: MedicalRecordRow): MedicalRecordRecord => ({
  amendmentReason: row.amendment_reason,
  assessment: row.assessment,
  createdAt: row.created_at,
  doctorId: row.doctor_id,
  doctorName: row.doctor_name,
  doctorPublicId: row.doctor_public_id,
  finalizedAt: row.finalized_at,
  id: row.id,
  objective: row.objective,
  patientId: row.patient_id,
  patientMedicalRecordNumber: row.patient_mrn,
  patientName: row.patient_name,
  patientPublicId: row.patient_public_id,
  plan: row.plan,
  polyclinicId: row.polyclinic_id,
  polyclinicName: row.polyclinic_name,
  polyclinicPublicId: row.polyclinic_public_id,
  publicId: row.public_id,
  registrationId: row.registration_id,
  registrationPublicId: row.registration_public_id,
  rowVersion: row.row_version,
  status: parseMedicalRecordStatus(row.status),
  subjective: row.subjective,
  updatedAt: row.updated_at,
  visitDate: row.visit_date,
})

const createAudit = async (
  transaction: Prisma.TransactionClient,
  input: AuditInput,
): Promise<void> => {
  const metadata = JSON.stringify(input.metadataValues ?? {})

  await transaction.$executeRaw`
    insert into public.audit_logs (
      actor_user_id, actor_username_snapshot, actor_role_snapshot, session_id,
      patient_id, registration_id, medical_record_id, resource_type, resource_public_id, action, outcome, reason,
      request_id, ip_address, user_agent, metadata
    ) values (
      ${input.principal.internalUserId}, ${input.principal.username}, ${input.principal.role}, ${input.principal.internalSessionId},
      ${input.patientId ?? null}, ${input.registrationId ?? null}, ${input.medicalRecordId ?? null}, 'MEDICAL_RECORD', cast(${input.resourcePublicId ?? null} as uuid),
      ${input.action}, ${input.outcome}, ${input.reason ?? null},
      ${input.metadata.requestId}, cast(${input.metadata.ipAddress ?? null} as inet), ${input.metadata.userAgent ?? null}, cast(${metadata} as jsonb)
    )
  `
}

const insertHistory = async (
  transaction: Prisma.TransactionClient,
  id: bigint,
  userId: bigint,
): Promise<void> => {
  await transaction.$executeRaw`
    insert into public.medical_record_history (
      medical_record_id, subjective, objective, assessment, plan,
      status, amendment_reason, changed_by_user_id
    )
    select id, subjective, objective, assessment, plan, status, amendment_reason, ${userId}
    from public.medical_records where id = ${id}
  `
}

export const medicalRecordRepository: MedicalRecordRepository = {
  createMedicalRecord: async (input) => {
    return withTransaction(async (transaction): Promise<CreateMedicalRecordResult> => {
      const registrations = await transaction.$queryRaw<
        readonly {
          readonly id: bigint
          readonly patient_id: bigint
          readonly doctor_id: bigint
          readonly polyclinic_id: bigint
          readonly service_date: Date
        }[]
      >`select id, patient_id, doctor_id, polyclinic_id, service_date from public.registrations where public_id = cast(${input.registrationPublicId} as uuid)`

      const registration = registrations[0]
      if (!registration) {
        return { status: 'REGISTRATION_NOT_FOUND' }
      }

      if (
        input.principal.role === 'DOCTOR' &&
        registration.doctor_id !== input.principal.internalUserId
      ) {
        return { status: 'NOT_ASSIGNED_TO_DOCTOR' }
      }

      await transaction.$queryRaw`
        select pg_advisory_xact_lock(hashtextextended(${`mr:${registration.id}`}, 84622))::text as lock_result
      `

      const existingRecords = await transaction.$queryRaw<
        readonly { readonly public_id: string }[]
      >`
        select public_id from public.medical_records where registration_id = ${registration.id}
      `

      if (existingRecords.length > 0) {
        return {
          status: 'MEDICAL_RECORD_ALREADY_EXISTS',
          existingId: existingRecords[0]!.public_id,
        }
      }

      const rows = await transaction.$queryRaw<
        readonly { readonly id: bigint; readonly public_id: string }[]
      >`
        insert into public.medical_records (
          patient_id, registration_id, doctor_id, polyclinic_id, visit_date,
          subjective, objective, assessment, plan, status,
          created_by_user_id, updated_by_user_id
        ) values (
          ${registration.patient_id}, ${registration.id}, ${registration.doctor_id}, ${registration.polyclinic_id}, cast(${registration.service_date} as date),
          ${input.subjective}, ${input.objective}, ${input.assessment}, ${input.plan}, 'DRAFT',
          ${input.principal.internalUserId}, ${input.principal.internalUserId}
        ) returning id, public_id
      `

      const recordId = rows[0]!.id

      await insertHistory(transaction, recordId, input.principal.internalUserId)

      const fullRows = await transaction.$queryRaw<readonly MedicalRecordRow[]>(Prisma.sql`
        select ${recordColumns} ${recordJoins} where mr.id = ${recordId}
      `)

      await createAudit(transaction, {
        ...input,
        action: 'MEDICAL_RECORD_CREATED',
        outcome: 'SUCCESS',
        patientId: registration.patient_id,
        registrationId: registration.id,
        medicalRecordId: recordId,
        resourcePublicId: rows[0]!.public_id,
      })

      return { status: 'CREATED', medicalRecord: mapMedicalRecordRow(fullRows[0]!) }
    })
  },

  updateMedicalRecord: async (input) => {
    return withTransaction(async (transaction): Promise<UpdateMedicalRecordResult> => {
      const lockRows = await transaction.$queryRaw<
        readonly {
          readonly id: bigint
          readonly patient_id: bigint
          readonly registration_id: bigint
          readonly public_id: string
          readonly status: string
          readonly row_version: number
          readonly doctor_id: bigint
          readonly finalized_at: Date | null
        }[]
      >`
        select id, patient_id, registration_id, public_id, status, row_version, doctor_id, finalized_at from public.medical_records where public_id = cast(${input.medicalRecordPublicId} as uuid) for update
      `

      const current = lockRows[0]
      if (!current) return { status: 'NOT_FOUND' }
      if (current.row_version !== input.rowVersion) return { status: 'VERSION_CONFLICT' }

      if (current.status === 'FINAL' && input.status !== 'AMENDED') {
        return { status: 'LOCKED_RECORD' }
      }

      if (input.status === 'AMENDED' && current.status !== 'FINAL') {
        return { status: 'INVALID_STATUS_TRANSITION' }
      }

      if (input.status === 'FINAL' && current.status === 'AMENDED') {
        return { status: 'INVALID_STATUS_TRANSITION' }
      }

      if (input.status === 'AMENDED' && current.finalized_at) {
        const msSinceFinalized = Date.now() - current.finalized_at.getTime()
        if (msSinceFinalized > 48 * 3600 * 1000) {
          const approvedReqs = await transaction.$queryRaw<readonly { readonly id: bigint }[]>`
            select id from public.correction_requests 
            where medical_record_id = ${current.id} and status = 'APPROVED'
          `
          if (approvedReqs.length === 0) {
            return { status: 'CORRECTION_REQUEST_REQUIRED' }
          }
        }
      }

      const setClauses: Prisma.Sql[] = [
        Prisma.sql`updated_by_user_id = ${input.principal.internalUserId}`,
      ]

      if (input.subjective !== undefined)
        setClauses.push(Prisma.sql`subjective = ${input.subjective}`)
      if (input.objective !== undefined) setClauses.push(Prisma.sql`objective = ${input.objective}`)
      if (input.assessment !== undefined)
        setClauses.push(Prisma.sql`assessment = ${input.assessment}`)
      if (input.plan !== undefined) setClauses.push(Prisma.sql`plan = ${input.plan}`)

      if (input.status !== undefined) setClauses.push(Prisma.sql`status = ${input.status}`)
      if (input.amendmentReason !== undefined)
        setClauses.push(Prisma.sql`amendment_reason = ${input.amendmentReason}`)
      if (input.finalizedAt) setClauses.push(Prisma.sql`finalized_at = clock_timestamp()`)

      const setFragment = Prisma.join(setClauses, ', ')

      await transaction.$executeRaw(Prisma.sql`
        update public.medical_records
        set ${setFragment}
        where id = ${current.id}
      `)

      await insertHistory(transaction, current.id, input.principal.internalUserId)

      const fullRows = await transaction.$queryRaw<readonly MedicalRecordRow[]>(Prisma.sql`
        select ${recordColumns} ${recordJoins} where mr.id = ${current.id}
      `)

      await createAudit(transaction, {
        ...input,
        action: 'MEDICAL_RECORD_UPDATED',
        outcome: 'SUCCESS',
        patientId: current.patient_id,
        registrationId: current.registration_id,
        medicalRecordId: current.id,
        resourcePublicId: current.public_id,
      })

      return { status: 'UPDATED', medicalRecord: mapMedicalRecordRow(fullRows[0]!) }
    })
  },

  createCorrectionRequest: async (input) => {
    return withTransaction(async (transaction) => {
      const records = await transaction.$queryRaw<readonly { readonly id: bigint }[]>`
        select id from public.medical_records where public_id = cast(${input.medicalRecordPublicId} as uuid)
      `
      const record = records[0]
      if (!record) return { status: 'NOT_FOUND' }

      await transaction.$executeRaw`
        insert into public.correction_requests (medical_record_id, requested_by_user_id, reason)
        values (${record.id}, ${input.principal.internalUserId}, ${input.reason})
      `

      // Ideally we would add an audit log here
      return { status: 'CREATED' }
    })
  },

  approveCorrectionRequest: async (input) => {
    return withTransaction(async (transaction) => {
      const requests = await transaction.$queryRaw<
        readonly { readonly id: bigint; readonly medical_record_id: bigint }[]
      >`
        select id, medical_record_id from public.correction_requests where public_id = cast(${input.correctionRequestId} as uuid) for update
      `
      const request = requests[0]
      if (!request) return { status: 'NOT_FOUND' }

      await transaction.$executeRaw`
        update public.correction_requests
        set status = 'APPROVED', approved_by_user_id = ${input.principal.internalUserId}, approved_at = clock_timestamp(), updated_at = clock_timestamp()
        where id = ${request.id}
      `

      return { status: 'APPROVED' }
    })
  },

  listMedicalRecords: async (input) => {
    return withTransaction(async (transaction): Promise<MedicalRecordListResult> => {
      const filters: Prisma.Sql[] = [
        Prisma.sql`and p.public_id = cast(${input.query.patientId} as uuid)`,
      ]

      if (input.query.doctorId) {
        filters.push(Prisma.sql`and d.public_id = cast(${input.query.doctorId} as uuid)`)
      }
      if (input.query.polyclinicId) {
        filters.push(Prisma.sql`and pol.public_id = cast(${input.query.polyclinicId} as uuid)`)
      }

      const filterFragment = Prisma.join(filters, ' ')
      const offset = (input.query.page - 1) * input.query.limit

      const countRows = await transaction.$queryRaw<
        readonly { readonly total_items: bigint | number | string }[]
      >(Prisma.sql`
        select count(*)::bigint as total_items ${recordJoins} where 1 = 1 ${filterFragment}
      `)

      const rows = await transaction.$queryRaw<readonly MedicalRecordRow[]>(Prisma.sql`
        select ${recordColumns} ${recordJoins} where 1 = 1 ${filterFragment}
        order by mr.visit_date desc, mr.created_at desc
        limit ${input.query.limit} offset ${offset}
      `)

      await createAudit(transaction, {
        ...input,
        action: 'MEDICAL_RECORD_LISTED',
        outcome: 'SUCCESS',
        metadataValues: {
          limit: input.query.limit,
          page: input.query.page,
          resultCount: rows.length,
        },
      })

      return {
        items: rows.map(mapMedicalRecordRow),
        totalItems: getCount(countRows[0]?.total_items ?? 0),
      }
    })
  },

  findMedicalRecord: async (input) => {
    return withTransaction(async (transaction): Promise<MedicalRecordRecord | null> => {
      const rows = await transaction.$queryRaw<readonly MedicalRecordRow[]>(Prisma.sql`
        select ${recordColumns} ${recordJoins} where mr.public_id = cast(${input.medicalRecordPublicId} as uuid)
      `)

      const recordRow = rows[0]

      await createAudit(transaction, {
        ...input,
        action: 'MEDICAL_RECORD_VIEWED',
        outcome: recordRow ? 'SUCCESS' : 'FAILURE',
        patientId: recordRow?.patient_id,
        medicalRecordId: recordRow?.id,
        reason: recordRow ? undefined : 'NOT_FOUND',
        resourcePublicId: input.medicalRecordPublicId,
      })

      return recordRow ? mapMedicalRecordRow(recordRow) : null
    })
  },
}
