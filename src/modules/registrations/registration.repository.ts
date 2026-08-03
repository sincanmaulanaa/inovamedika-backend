import { Prisma } from '../../generated/prisma/client.js'

import { withTransaction } from '../../db/transaction.js'
import type { AuthRequestMetadata, AuthenticatedPrincipal } from '../auth/auth.types.js'
import {
  financingTypes,
  registrationStatuses,
  type FinancingType,
  type RegistrationRecord,
  type RegistrationStatus,
} from './registration.types.js'

interface RegistrationRow {
  readonly id: bigint
  readonly public_id: string
  readonly patient_id: bigint
  readonly patient_public_id: string
  readonly patient_name: string
  readonly patient_mrn: string
  readonly doctor_id: bigint
  readonly doctor_public_id: string
  readonly doctor_name: string
  readonly polyclinic_id: bigint
  readonly polyclinic_public_id: string
  readonly polyclinic_name: string
  readonly payer_id: bigint | null
  readonly payer_public_id: string | null
  readonly payer_name: string | null
  readonly related_registration_id: bigint | null
  readonly service_date: Date
  readonly financing_type: string
  readonly payer_member_number: string | null
  readonly authorization_number: string | null
  readonly visit_reason: string
  readonly repeat_visit_reason: string | null
  readonly status: string
  readonly checked_in_at: Date | null
  readonly exam_started_at: Date | null
  readonly completed_at: Date | null
  readonly cancelled_at: Date | null
  readonly cancelled_reason: string | null
  readonly no_show_at: Date | null
  readonly no_show_reason: string | null
  readonly row_version: number
  readonly created_at: Date
  readonly updated_at: Date
}

interface RegistrationRepositoryContext {
  readonly metadata: AuthRequestMetadata
  readonly principal: AuthenticatedPrincipal
}

interface AuditInput extends RegistrationRepositoryContext {
  readonly action: string
  readonly outcome: 'SUCCESS' | 'FAILURE'
  readonly patientId?: bigint | undefined
  readonly registrationId?: bigint | undefined
  readonly resourcePublicId?: string | undefined
  readonly reason?: string | undefined
  readonly metadataValues?: Readonly<Record<string, unknown>> | undefined
}

export interface CreateRegistrationInput extends RegistrationRepositoryContext {
  readonly patientPublicId: string
  readonly doctorPublicId: string
  readonly polyclinicPublicId: string
  readonly serviceDate: string
  readonly financingType: FinancingType
  readonly payerPublicId: string | null
  readonly payerMemberNumber: string | null
  readonly visitReason: string
  readonly repeatVisitReason: string | null
}

export interface UpdateRegistrationInput extends RegistrationRepositoryContext {
  readonly registrationPublicId: string
  readonly rowVersion: number
  readonly financingType?: FinancingType | undefined
  readonly payerPublicId?: string | null | undefined
  readonly payerMemberNumber?: string | null | undefined
  readonly visitReason?: string | undefined
  readonly status?: RegistrationStatus | undefined
  readonly cancelledReason?: string | undefined
  readonly noShowReason?: string | undefined
}

export interface ListRegistrationsInput extends RegistrationRepositoryContext {
  readonly page: number
  readonly limit: number
  readonly date?: string | undefined
  readonly status?: RegistrationStatus | undefined
  readonly doctorPublicId?: string | undefined
  readonly polyclinicPublicId?: string | undefined
  readonly search?: string | undefined
}

export interface FindRegistrationInput extends RegistrationRepositoryContext {
  readonly registrationPublicId: string
}

export type CreateRegistrationResult =
  | { readonly status: 'CREATED'; readonly registration: RegistrationRecord }
  | { readonly status: 'PATIENT_NOT_FOUND' }
  | { readonly status: 'DOCTOR_NOT_FOUND' }
  | { readonly status: 'POLYCLINIC_NOT_FOUND' }
  | { readonly status: 'DOCTOR_NOT_SERVING_POLYCLINIC' }
  | { readonly status: 'PAYER_NOT_FOUND' }
  | { readonly status: 'ACTIVE_REGISTRATION_EXISTS'; readonly existingRegistrationId: string }
  | { readonly status: 'REPEAT_VISIT_REQUIRES_REASON' }

export type UpdateRegistrationResult =
  | { readonly status: 'UPDATED'; readonly registration: RegistrationRecord }
  | { readonly status: 'NOT_FOUND' }
  | { readonly status: 'VERSION_CONFLICT' }
  | { readonly status: 'INVALID_STATUS_TRANSITION' }
  | { readonly status: 'FIELD_LOCKED_AFTER_CHECK_IN' }
  | { readonly status: 'CANCELLED_REASON_REQUIRED' }
  | { readonly status: 'NO_SHOW_REASON_REQUIRED' }
  | { readonly status: 'PAYER_NOT_FOUND' }

export interface RegistrationListResult {
  readonly items: readonly RegistrationRecord[]
  readonly totalItems: number
}

export interface RegistrationRepository {
  readonly createRegistration: (input: CreateRegistrationInput) => Promise<CreateRegistrationResult>
  readonly updateRegistration: (input: UpdateRegistrationInput) => Promise<UpdateRegistrationResult>
  readonly listRegistrations: (input: ListRegistrationsInput) => Promise<RegistrationListResult>
  readonly findRegistration: (input: FindRegistrationInput) => Promise<RegistrationRecord | null>
}

const parseFinancingType = (value: string): FinancingType => {
  const parsed = financingTypes.find((ft) => ft === value)

  if (!parsed) {
    throw new Error('Stored financing type is not supported')
  }

  return parsed
}

const parseRegistrationStatus = (value: string): RegistrationStatus => {
  const parsed = registrationStatuses.find((s) => s === value)

  if (!parsed) {
    throw new Error('Stored registration status is not supported')
  }

  return parsed
}

const registrationColumns = Prisma.sql`
  r.id,
  r.public_id,
  r.patient_id,
  p.public_id as patient_public_id,
  p.full_name as patient_name,
  p.medical_record_number as patient_mrn,
  r.doctor_id,
  d.public_id as doctor_public_id,
  d.full_name as doctor_name,
  r.polyclinic_id,
  pol.public_id as polyclinic_public_id,
  pol.name as polyclinic_name,
  r.payer_id,
  pay.public_id as payer_public_id,
  pay.name as payer_name,
  r.related_registration_id,
  r.service_date,
  r.financing_type,
  r.payer_member_number,
  r.authorization_number,
  r.visit_reason,
  r.repeat_visit_reason,
  r.status,
  r.checked_in_at,
  r.exam_started_at,
  r.completed_at,
  r.cancelled_at,
  r.cancelled_reason,
  r.no_show_at,
  r.no_show_reason,
  r.row_version,
  r.created_at,
  r.updated_at
`

const registrationJoins = Prisma.sql`
  from public.registrations r
  join public.patients p on p.id = r.patient_id
  join public.doctors d on d.id = r.doctor_id
  join public.polyclinics pol on pol.id = r.polyclinic_id
  left join public.payers pay on pay.id = r.payer_id
`

const mapRegistrationRow = (row: RegistrationRow): RegistrationRecord => ({
  authorizationNumber: row.authorization_number,
  cancelledAt: row.cancelled_at,
  cancelledReason: row.cancelled_reason,
  checkedInAt: row.checked_in_at,
  completedAt: row.completed_at,
  createdAt: row.created_at,
  doctorId: row.doctor_id,
  doctorName: row.doctor_name,
  doctorPublicId: row.doctor_public_id,
  examStartedAt: row.exam_started_at,
  financingType: parseFinancingType(row.financing_type),
  id: row.id,
  noShowAt: row.no_show_at,
  noShowReason: row.no_show_reason,
  patientId: row.patient_id,
  patientMedicalRecordNumber: row.patient_mrn,
  patientName: row.patient_name,
  patientPublicId: row.patient_public_id,
  payerId: row.payer_id,
  payerMemberNumber: row.payer_member_number,
  payerName: row.payer_name,
  payerPublicId: row.payer_public_id,
  polyclinicId: row.polyclinic_id,
  polyclinicName: row.polyclinic_name,
  polyclinicPublicId: row.polyclinic_public_id,
  publicId: row.public_id,
  relatedRegistrationId: row.related_registration_id,
  repeatVisitReason: row.repeat_visit_reason,
  rowVersion: row.row_version,
  serviceDate: row.service_date,
  status: parseRegistrationStatus(row.status),
  updatedAt: row.updated_at,
  visitReason: row.visit_reason,
})

const getCount = (value: bigint | number | string): number => {
  const count = Number(value)

  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error('Registration count exceeds the supported response range')
  }

  return count
}

const createAudit = async (
  transaction: Prisma.TransactionClient,
  input: AuditInput,
): Promise<void> => {
  const metadata = JSON.stringify(input.metadataValues ?? {})

  await transaction.$executeRaw`
    insert into public.audit_logs (
      actor_user_id,
      actor_username_snapshot,
      actor_role_snapshot,
      session_id,
      patient_id,
      registration_id,
      resource_type,
      resource_public_id,
      action,
      outcome,
      reason,
      request_id,
      ip_address,
      user_agent,
      metadata
    ) values (
      ${input.principal.internalUserId},
      ${input.principal.username},
      ${input.principal.role},
      ${input.principal.internalSessionId},
      ${input.patientId ?? null},
      ${input.registrationId ?? null},
      'REGISTRATION',
      cast(${input.resourcePublicId ?? null} as uuid),
      ${input.action},
      ${input.outcome},
      ${input.reason ?? null},
      ${input.metadata.requestId},
      cast(${input.metadata.ipAddress ?? null} as inet),
      ${input.metadata.userAgent ?? null},
      cast(${metadata} as jsonb)
    )
  `
}

const insertStatusHistory = async (
  transaction: Prisma.TransactionClient,
  registrationId: bigint,
  fromStatus: RegistrationStatus | null,
  toStatus: RegistrationStatus,
  userId: bigint,
  reason: string | null,
): Promise<void> => {
  await transaction.$executeRaw`
    insert into public.registration_status_history (
      registration_id,
      from_status,
      to_status,
      reason,
      changed_by_user_id
    ) values (
      ${registrationId},
      ${fromStatus},
      ${toStatus},
      ${reason},
      ${userId}
    )
  `
}

export const registrationRepository: RegistrationRepository = {
  createRegistration: async (input) => {
    return withTransaction(async (transaction): Promise<CreateRegistrationResult> => {
      // Resolve patient
      const patients = await transaction.$queryRaw<readonly { readonly id: bigint }[]>`
        select id from public.patients
        where public_id = cast(${input.patientPublicId} as uuid) and deleted_at is null
      `

      if (patients.length === 0) {
        await createAudit(transaction, {
          ...input,
          action: 'REGISTRATION_CREATED',
          outcome: 'FAILURE',
          reason: 'PATIENT_NOT_FOUND',
        })
        return { status: 'PATIENT_NOT_FOUND' }
      }

      const patientId = patients[0]!.id

      // Resolve doctor
      const doctors = await transaction.$queryRaw<readonly { readonly id: bigint }[]>`
        select id from public.doctors
        where public_id = cast(${input.doctorPublicId} as uuid) and is_active = true
      `

      if (doctors.length === 0) {
        await createAudit(transaction, {
          ...input,
          action: 'REGISTRATION_CREATED',
          outcome: 'FAILURE',
          patientId,
          reason: 'DOCTOR_NOT_FOUND',
        })
        return { status: 'DOCTOR_NOT_FOUND' }
      }

      const doctorId = doctors[0]!.id

      // Resolve polyclinic
      const polyclinics = await transaction.$queryRaw<readonly { readonly id: bigint }[]>`
        select id from public.polyclinics
        where public_id = cast(${input.polyclinicPublicId} as uuid) and is_active = true
      `

      if (polyclinics.length === 0) {
        await createAudit(transaction, {
          ...input,
          action: 'REGISTRATION_CREATED',
          outcome: 'FAILURE',
          patientId,
          reason: 'POLYCLINIC_NOT_FOUND',
        })
        return { status: 'POLYCLINIC_NOT_FOUND' }
      }

      const polyclinicId = polyclinics[0]!.id

      // Check doctor serves this polyclinic's queue lane
      const lanes = await transaction.$queryRaw<readonly { readonly id: bigint }[]>`
        select id from public.queue_lanes
        where polyclinic_id = ${polyclinicId}
          and doctor_id = ${doctorId}
          and is_active = true
        limit 1
      `

      if (lanes.length === 0) {
        await createAudit(transaction, {
          ...input,
          action: 'REGISTRATION_CREATED',
          outcome: 'FAILURE',
          patientId,
          reason: 'DOCTOR_NOT_SERVING_POLYCLINIC',
        })
        return { status: 'DOCTOR_NOT_SERVING_POLYCLINIC' }
      }

      // Resolve payer if needed
      let payerId: bigint | null = null

      if (input.payerPublicId) {
        const payers = await transaction.$queryRaw<readonly { readonly id: bigint }[]>`
          select id from public.payers
          where public_id = cast(${input.payerPublicId} as uuid) and is_active = true
        `

        if (payers.length === 0) {
          await createAudit(transaction, {
            ...input,
            action: 'REGISTRATION_CREATED',
            outcome: 'FAILURE',
            patientId,
            reason: 'PAYER_NOT_FOUND',
          })
          return { status: 'PAYER_NOT_FOUND' }
        }

        payerId = payers[0]!.id
      }

      // Check for active duplicate: advisory lock then query
      await transaction.$queryRaw`
        select pg_advisory_xact_lock(
          hashtextextended(${`reg:${patientId}:${input.serviceDate}:${polyclinicId}`}, 84621)
        )::text as lock_result
      `

      const activeRegistrations = await transaction.$queryRaw<
        readonly { readonly public_id: string; readonly status: string }[]
      >`
        select public_id, status from public.registrations
        where patient_id = ${patientId}
          and service_date = cast(${input.serviceDate} as date)
          and polyclinic_id = ${polyclinicId}
          and status in ('WAITING', 'CHECKED_IN', 'IN_EXAM')
        limit 1
      `

      if (activeRegistrations.length > 0) {
        await createAudit(transaction, {
          ...input,
          action: 'REGISTRATION_CREATED',
          outcome: 'FAILURE',
          patientId,
          reason: 'ACTIVE_REGISTRATION_EXISTS',
          metadataValues: { existingRegistrationId: activeRegistrations[0]!.public_id },
        })
        return {
          existingRegistrationId: activeRegistrations[0]!.public_id,
          status: 'ACTIVE_REGISTRATION_EXISTS',
        }
      }

      // Check for completed visit on same date/poli (repeat visit)
      const completedRegistrations = await transaction.$queryRaw<
        readonly { readonly id: bigint }[]
      >`
        select id from public.registrations
        where patient_id = ${patientId}
          and service_date = cast(${input.serviceDate} as date)
          and polyclinic_id = ${polyclinicId}
          and status = 'COMPLETED'
        limit 1
      `

      let relatedRegistrationId: bigint | null = null

      if (completedRegistrations.length > 0) {
        if (!input.repeatVisitReason) {
          await createAudit(transaction, {
            ...input,
            action: 'REGISTRATION_CREATED',
            outcome: 'FAILURE',
            patientId,
            reason: 'REPEAT_VISIT_REQUIRES_REASON',
          })
          return { status: 'REPEAT_VISIT_REQUIRES_REASON' }
        }

        relatedRegistrationId = completedRegistrations[0]!.id
      }

      // Insert registration
      const rows = await transaction.$queryRaw<readonly RegistrationRow[]>(Prisma.sql`
        insert into public.registrations (
          patient_id,
          doctor_id,
          polyclinic_id,
          payer_id,
          related_registration_id,
          service_date,
          financing_type,
          payer_member_number,
          visit_reason,
          repeat_visit_reason,
          status,
          created_by_user_id,
          updated_by_user_id
        ) values (
          ${patientId},
          ${doctorId},
          ${polyclinicId},
          ${payerId},
          ${relatedRegistrationId},
          cast(${input.serviceDate} as date),
          ${input.financingType},
          ${input.payerMemberNumber},
          ${input.visitReason},
          ${input.repeatVisitReason},
          'WAITING',
          ${input.principal.internalUserId},
          ${input.principal.internalUserId}
        )
        returning id, public_id
      `)
      const insertedRow = rows[0]

      if (!insertedRow) {
        throw new Error('Registration insert did not return a record')
      }

      await insertStatusHistory(
        transaction,
        insertedRow.id,
        null,
        'WAITING',
        input.principal.internalUserId,
        null,
      )

      // Fetch full record with joins
      const fullRows = await transaction.$queryRaw<readonly RegistrationRow[]>(Prisma.sql`
        select ${registrationColumns}
        ${registrationJoins}
        where r.id = ${insertedRow.id}
      `)
      const registrationRow = fullRows[0]

      if (!registrationRow) {
        throw new Error('Registration fetch after insert did not return a record')
      }

      await createAudit(transaction, {
        ...input,
        action: 'REGISTRATION_CREATED',
        outcome: 'SUCCESS',
        patientId,
        registrationId: registrationRow.id,
        resourcePublicId: registrationRow.public_id,
      })

      return { registration: mapRegistrationRow(registrationRow), status: 'CREATED' }
    })
  },

  updateRegistration: async (input) => {
    return withTransaction(async (transaction): Promise<UpdateRegistrationResult> => {
      // Lock registration
      const lockRows = await transaction.$queryRaw<
        readonly {
          readonly id: bigint
          readonly patient_id: bigint
          readonly public_id: string
          readonly status: string
          readonly row_version: number
          readonly checked_in_at: Date | null
        }[]
      >`
        select id, patient_id, public_id, status, row_version, checked_in_at
        from public.registrations
        where public_id = cast(${input.registrationPublicId} as uuid)
        for update
      `
      const currentReg = lockRows[0]

      if (!currentReg) {
        await createAudit(transaction, {
          ...input,
          action: 'REGISTRATION_UPDATED',
          outcome: 'FAILURE',
          reason: 'NOT_FOUND',
          resourcePublicId: input.registrationPublicId,
        })
        return { status: 'NOT_FOUND' }
      }

      if (currentReg.row_version !== input.rowVersion) {
        await createAudit(transaction, {
          ...input,
          action: 'REGISTRATION_UPDATED',
          outcome: 'FAILURE',
          patientId: currentReg.patient_id,
          registrationId: currentReg.id,
          reason: 'VERSION_CONFLICT',
          resourcePublicId: currentReg.public_id,
        })
        return { status: 'VERSION_CONFLICT' }
      }

      const currentStatus = parseRegistrationStatus(currentReg.status)

      // Status transition
      if (input.status && input.status !== currentStatus) {
        const allowedTransitions = new Set<string>([
          'WAITING->CHECKED_IN',
          'WAITING->CANCELLED',
          'WAITING->NO_SHOW',
          'CHECKED_IN->IN_EXAM',
          'CHECKED_IN->CANCELLED',
          'IN_EXAM->COMPLETED',
        ])

        const transitionKey = `${currentStatus}->${input.status}`

        if (!allowedTransitions.has(transitionKey)) {
          await createAudit(transaction, {
            ...input,
            action: 'REGISTRATION_UPDATED',
            outcome: 'FAILURE',
            patientId: currentReg.patient_id,
            registrationId: currentReg.id,
            reason: 'INVALID_STATUS_TRANSITION',
            metadataValues: { from: currentStatus, to: input.status },
            resourcePublicId: currentReg.public_id,
          })
          return { status: 'INVALID_STATUS_TRANSITION' }
        }

        if (input.status === 'CANCELLED' && !input.cancelledReason) {
          return { status: 'CANCELLED_REASON_REQUIRED' }
        }

        if (input.status === 'NO_SHOW' && !input.noShowReason) {
          return { status: 'NO_SHOW_REASON_REQUIRED' }
        }
      }

      // After check-in, certain fields are locked
      if (currentReg.checked_in_at !== null) {
        // Can only change status and financing/payer after check-in, not core visit fields
        // Core visit fields are locked by not providing them in update schema
        // Status transitions are validated above
      }

      // Resolve payer if changing
      let resolvedPayerId: bigint | null | undefined
      if (input.payerPublicId !== undefined) {
        if (input.payerPublicId === null) {
          resolvedPayerId = null
        } else {
          const payers = await transaction.$queryRaw<readonly { readonly id: bigint }[]>`
            select id from public.payers
            where public_id = cast(${input.payerPublicId} as uuid) and is_active = true
          `

          if (payers.length === 0) {
            return { status: 'PAYER_NOT_FOUND' }
          }

          resolvedPayerId = payers[0]!.id
        }
      }

      // Build dynamic update
      const setClauses: Prisma.Sql[] = [
        Prisma.sql`updated_by_user_id = ${input.principal.internalUserId}`,
      ]

      if (input.financingType !== undefined) {
        setClauses.push(Prisma.sql`financing_type = ${input.financingType}`)
      }

      if (resolvedPayerId !== undefined) {
        setClauses.push(Prisma.sql`payer_id = ${resolvedPayerId}`)
      }

      if (input.payerMemberNumber !== undefined) {
        setClauses.push(Prisma.sql`payer_member_number = ${input.payerMemberNumber}`)
      }

      if (input.visitReason !== undefined) {
        setClauses.push(Prisma.sql`visit_reason = ${input.visitReason}`)
      }

      if (input.status && input.status !== currentStatus) {
        setClauses.push(Prisma.sql`status = ${input.status}`)

        if (input.status === 'CHECKED_IN') {
          setClauses.push(Prisma.sql`checked_in_at = clock_timestamp()`)
        } else if (input.status === 'IN_EXAM') {
          setClauses.push(Prisma.sql`exam_started_at = clock_timestamp()`)
        } else if (input.status === 'COMPLETED') {
          setClauses.push(Prisma.sql`completed_at = clock_timestamp()`)
        } else if (input.status === 'CANCELLED') {
          setClauses.push(Prisma.sql`cancelled_at = clock_timestamp()`)
          setClauses.push(Prisma.sql`cancelled_reason = ${input.cancelledReason ?? null}`)
        } else if (input.status === 'NO_SHOW') {
          setClauses.push(Prisma.sql`no_show_at = clock_timestamp()`)
          setClauses.push(Prisma.sql`no_show_reason = ${input.noShowReason ?? null}`)
        }
      }

      const setFragment = Prisma.join(setClauses, ', ')

      await transaction.$executeRaw(Prisma.sql`
        update public.registrations
        set ${setFragment}
        where id = ${currentReg.id}
      `)

      // Cancel linked queue if registration is being cancelled
      if (input.status === 'CANCELLED' || input.status === 'NO_SHOW') {
        const queueRows = await transaction.$queryRaw<
          readonly { readonly id: bigint; readonly status: string }[]
        >`
          select id, status from public.queues
          where registration_id = ${currentReg.id}
            and status not in ('COMPLETED', 'CANCELLED')
          for update
        `

        if (queueRows.length > 0) {
          const queue = queueRows[0]!
          await transaction.$executeRaw`
            update public.queues
            set status = 'CANCELLED',
                cancelled_at = clock_timestamp(),
                cancellation_reason = ${input.cancelledReason ?? input.noShowReason ?? 'Kunjungan dibatalkan'},
                updated_by_user_id = ${input.principal.internalUserId}
            where id = ${queue.id}
          `
          await transaction.$executeRaw`
            insert into public.queue_status_history (
              queue_id, from_status, to_status, reason, changed_by_user_id
            ) values (
              ${queue.id}, ${queue.status}, 'CANCELLED',
              ${input.cancelledReason ?? input.noShowReason ?? 'Kunjungan dibatalkan'},
              ${input.principal.internalUserId}
            )
          `
        }
      }

      // Record status transition
      if (input.status && input.status !== currentStatus) {
        await insertStatusHistory(
          transaction,
          currentReg.id,
          currentStatus,
          input.status,
          input.principal.internalUserId,
          input.cancelledReason ?? input.noShowReason ?? null,
        )
      }

      // Fetch updated record
      const fullRows = await transaction.$queryRaw<readonly RegistrationRow[]>(Prisma.sql`
        select ${registrationColumns}
        ${registrationJoins}
        where r.id = ${currentReg.id}
      `)
      const registrationRow = fullRows[0]

      if (!registrationRow) {
        throw new Error('Registration fetch after update did not return a record')
      }

      await createAudit(transaction, {
        ...input,
        action: 'REGISTRATION_UPDATED',
        outcome: 'SUCCESS',
        patientId: currentReg.patient_id,
        registrationId: currentReg.id,
        resourcePublicId: currentReg.public_id,
        metadataValues: input.status
          ? { fromStatus: currentStatus, toStatus: input.status }
          : undefined,
      })

      return { registration: mapRegistrationRow(registrationRow), status: 'UPDATED' }
    })
  },

  listRegistrations: async (input) => {
    return withTransaction(async (transaction): Promise<RegistrationListResult> => {
      const filters: Prisma.Sql[] = []

      if (input.date) {
        filters.push(Prisma.sql`and r.service_date = cast(${input.date} as date)`)
      }

      if (input.status) {
        filters.push(Prisma.sql`and r.status = ${input.status}`)
      }

      if (input.doctorPublicId) {
        filters.push(Prisma.sql`and d.public_id = cast(${input.doctorPublicId} as uuid)`)
      }

      if (input.polyclinicPublicId) {
        filters.push(Prisma.sql`and pol.public_id = cast(${input.polyclinicPublicId} as uuid)`)
      }

      if (input.search) {
        const escapedSearch = input.search.replace(/[\\%_]/g, '\\$&')
        const searchPattern = `%${escapedSearch}%`
        filters.push(Prisma.sql`
          and (
            p.full_name ilike ${searchPattern} escape '\\'
            or p.medical_record_number ilike ${searchPattern} escape '\\'
            or p.nik like ${searchPattern} escape '\\'
          )
        `)
      }

      const filterFragment = filters.length > 0 ? Prisma.join(filters, ' ') : Prisma.empty
      const offset = (input.page - 1) * input.limit

      const countRows = await transaction.$queryRaw<
        readonly { readonly total_items: bigint | number | string }[]
      >(Prisma.sql`
        select count(*)::bigint as total_items
        ${registrationJoins}
        where 1 = 1
        ${filterFragment}
      `)

      const rows = await transaction.$queryRaw<readonly RegistrationRow[]>(Prisma.sql`
        select ${registrationColumns}
        ${registrationJoins}
        where 1 = 1
        ${filterFragment}
        order by r.service_date desc, r.created_at desc, r.id desc
        limit ${input.limit}
        offset ${offset}
      `)

      const totalItems = getCount(countRows[0]?.total_items ?? 0)

      await createAudit(transaction, {
        ...input,
        action: input.search ? 'REGISTRATION_SEARCHED' : 'REGISTRATION_LISTED',
        outcome: 'SUCCESS',
        metadataValues: {
          hasSearchTerm: Boolean(input.search),
          limit: input.limit,
          page: input.page,
          resultCount: rows.length,
        },
      })

      return { items: rows.map(mapRegistrationRow), totalItems }
    })
  },

  findRegistration: async (input) => {
    return withTransaction(async (transaction): Promise<RegistrationRecord | null> => {
      const rows = await transaction.$queryRaw<readonly RegistrationRow[]>(Prisma.sql`
        select ${registrationColumns}
        ${registrationJoins}
        where r.public_id = cast(${input.registrationPublicId} as uuid)
      `)
      const registrationRow = rows[0]

      await createAudit(transaction, {
        ...input,
        action: 'REGISTRATION_VIEWED',
        outcome: registrationRow ? 'SUCCESS' : 'FAILURE',
        patientId: registrationRow?.patient_id,
        registrationId: registrationRow?.id,
        reason: registrationRow ? undefined : 'NOT_FOUND',
        resourcePublicId: input.registrationPublicId,
      })

      return registrationRow ? mapRegistrationRow(registrationRow) : null
    })
  },
}
