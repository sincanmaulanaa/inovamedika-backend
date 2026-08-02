import { Prisma } from '../../generated/prisma/client.js'

import { withTransaction } from '../../db/transaction.js'
import type { AuthRequestMetadata, AuthenticatedPrincipal } from '../auth/auth.types.js'
import { patientSexes, type PatientRecord, type PatientSex } from './patient.types.js'

interface PatientRow {
  readonly address: string | null
  readonly created_at: Date
  readonly date_of_birth: Date
  readonly full_name: string
  readonly id: bigint
  readonly medical_record_number: string
  readonly nik: string
  readonly normalized_phone: string | null
  readonly phone: string | null
  readonly public_id: string
  readonly row_version: number
  readonly sex: string
  readonly updated_at: Date
}

interface PatientWriteData {
  readonly address: string | null
  readonly dateOfBirth: string
  readonly fullName: string
  readonly nik: string
  readonly normalizedPhone: string | null
  readonly phone: string | null
  readonly sex: PatientSex
}

interface PatientRepositoryContext {
  readonly metadata: AuthRequestMetadata
  readonly principal: AuthenticatedPrincipal
}

interface PatientListRepositoryInput extends PatientRepositoryContext {
  readonly limit: number
  readonly page: number
  readonly search?: string | undefined
}

interface PatientCreateRepositoryInput extends PatientRepositoryContext, PatientWriteData {}

interface PatientUpdateRepositoryInput extends PatientRepositoryContext, PatientWriteData {
  readonly patientPublicId: string
  readonly rowVersion: number
}

interface PatientIdentityRepositoryInput extends PatientRepositoryContext {
  readonly patientPublicId: string
}

export type CreatePatientResult =
  | { readonly status: 'CREATED'; readonly patient: PatientRecord }
  | { readonly status: 'NIK_EXISTS' }

export type UpdatePatientResult =
  | { readonly status: 'UPDATED'; readonly patient: PatientRecord }
  | { readonly status: 'NIK_EXISTS' }
  | { readonly status: 'NOT_FOUND' }
  | { readonly status: 'VERSION_CONFLICT' }

export type DeletePatientResult =
  | { readonly status: 'DELETED' }
  | { readonly status: 'HAS_REGISTRATIONS' }
  | { readonly status: 'NOT_FOUND' }

export interface PatientListResult {
  readonly items: readonly PatientRecord[]
  readonly totalItems: number
}

export interface PatientRepository {
  readonly createPatient: (input: PatientCreateRepositoryInput) => Promise<CreatePatientResult>
  readonly deletePatient: (input: PatientIdentityRepositoryInput) => Promise<DeletePatientResult>
  readonly findPatient: (input: PatientIdentityRepositoryInput) => Promise<PatientRecord | null>
  readonly listPatients: (input: PatientListRepositoryInput) => Promise<PatientListResult>
  readonly updatePatient: (input: PatientUpdateRepositoryInput) => Promise<UpdatePatientResult>
}

interface AuditInput extends PatientRepositoryContext {
  readonly action: string
  readonly metadataValues?: Readonly<Record<string, unknown>> | undefined
  readonly outcome: 'SUCCESS' | 'FAILURE'
  readonly patientId?: bigint | undefined
  readonly reason?: string | undefined
  readonly resourcePublicId?: string | undefined
}

const patientColumns = Prisma.sql`
  id,
  public_id,
  medical_record_number,
  nik,
  full_name,
  sex,
  date_of_birth,
  phone,
  normalized_phone,
  address,
  row_version,
  created_at,
  updated_at
`

const parsePatientSex = (value: string): PatientSex => {
  const patientSex = patientSexes.find((sex) => sex === value)

  if (!patientSex) {
    throw new Error('Stored patient sex is not supported')
  }

  return patientSex
}

const mapPatientRow = (row: PatientRow): PatientRecord => {
  return {
    address: row.address,
    createdAt: row.created_at,
    dateOfBirth: row.date_of_birth,
    fullName: row.full_name,
    id: row.id,
    medicalRecordNumber: row.medical_record_number,
    nik: row.nik,
    normalizedPhone: row.normalized_phone,
    phone: row.phone,
    publicId: row.public_id,
    rowVersion: row.row_version,
    sex: parsePatientSex(row.sex),
    updatedAt: row.updated_at,
  }
}

const getCount = (value: bigint | number | string): number => {
  const count = Number(value)

  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error('Patient count exceeds the supported response range')
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
      'PATIENT',
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

const lockNik = async (transaction: Prisma.TransactionClient, nik: string): Promise<void> => {
  await transaction.$queryRaw`
    select pg_advisory_xact_lock(hashtextextended(${nik}, 84_621))::text as lock_result
  `
}

const hasDuplicateNik = async (
  transaction: Prisma.TransactionClient,
  nik: string,
  patientId?: bigint,
): Promise<boolean> => {
  const rows = await transaction.$queryRaw<readonly { readonly id: bigint }[]>`
    select id
    from public.patients
    where nik = ${nik}
      and (${patientId ?? null}::bigint is null or id <> ${patientId ?? null})
    limit 1
  `

  return rows.length > 0
}

const getSearchClause = (search: string | undefined): Prisma.Sql => {
  if (!search) {
    return Prisma.empty
  }

  const escapedSearch = search.replace(/[\\%_]/g, '\\$&')
  const searchPattern = `%${escapedSearch}%`
  const phoneDigits = search.replace(/\D/g, '')
  const normalizedPhoneDigits = phoneDigits.startsWith('0')
    ? `62${phoneDigits.slice(1)}`
    : phoneDigits
  const normalizedPhonePattern =
    normalizedPhoneDigits.length > 0 ? `%${normalizedPhoneDigits}%` : searchPattern

  return Prisma.sql`
    and (
      medical_record_number ilike ${searchPattern} escape '\\'
      or nik like ${searchPattern} escape '\\'
      or full_name ilike ${searchPattern} escape '\\'
      or coalesce(phone, '') ilike ${searchPattern} escape '\\'
      or coalesce(normalized_phone, '') like ${normalizedPhonePattern} escape '\\'
    )
  `
}

const lockPatient = async (
  transaction: Prisma.TransactionClient,
  patientPublicId: string,
): Promise<PatientRow | null> => {
  const rows = await transaction.$queryRaw<readonly PatientRow[]>(Prisma.sql`
    select ${patientColumns}
    from public.patients
    where public_id = cast(${patientPublicId} as uuid)
      and deleted_at is null
    for update
  `)

  return rows[0] ?? null
}

const getChangedFields = (patient: PatientRow, input: PatientWriteData): readonly string[] => {
  const changes: string[] = []
  const currentDateOfBirth = patient.date_of_birth.toISOString().slice(0, 10)

  if (patient.nik !== input.nik) changes.push('nik')
  if (patient.full_name !== input.fullName) changes.push('fullName')
  if (patient.sex !== input.sex) changes.push('sex')
  if (currentDateOfBirth !== input.dateOfBirth) changes.push('dateOfBirth')
  if (patient.phone !== input.phone) changes.push('phone')
  if (patient.address !== input.address) changes.push('address')

  return changes
}

export const patientRepository: PatientRepository = {
  createPatient: async (input) => {
    return withTransaction(async (transaction): Promise<CreatePatientResult> => {
      await lockNik(transaction, input.nik)

      if (await hasDuplicateNik(transaction, input.nik)) {
        await createAudit(transaction, {
          ...input,
          action: 'PATIENT_CREATED',
          outcome: 'FAILURE',
          reason: 'NIK_ALREADY_EXISTS',
        })
        return { status: 'NIK_EXISTS' }
      }

      const rows = await transaction.$queryRaw<readonly PatientRow[]>(Prisma.sql`
        insert into public.patients (
          nik,
          full_name,
          sex,
          date_of_birth,
          phone,
          normalized_phone,
          address,
          created_by_user_id,
          updated_by_user_id
        ) values (
          ${input.nik},
          ${input.fullName},
          ${input.sex},
          cast(${input.dateOfBirth} as date),
          ${input.phone},
          ${input.normalizedPhone},
          ${input.address},
          ${input.principal.internalUserId},
          ${input.principal.internalUserId}
        )
        returning ${patientColumns}
      `)
      const patientRow = rows[0]

      if (!patientRow) {
        throw new Error('Patient insert did not return a record')
      }

      await createAudit(transaction, {
        ...input,
        action: 'PATIENT_CREATED',
        outcome: 'SUCCESS',
        patientId: patientRow.id,
        resourcePublicId: patientRow.public_id,
      })

      return { patient: mapPatientRow(patientRow), status: 'CREATED' }
    })
  },

  listPatients: async (input) => {
    return withTransaction(async (transaction): Promise<PatientListResult> => {
      const searchClause = getSearchClause(input.search)
      const offset = (input.page - 1) * input.limit
      const countRows = await transaction.$queryRaw<
        readonly { readonly total_items: bigint | number | string }[]
      >(Prisma.sql`
        select count(*)::bigint as total_items
        from public.patients
        where deleted_at is null
        ${searchClause}
      `)
      const rows = await transaction.$queryRaw<readonly PatientRow[]>(Prisma.sql`
        select ${patientColumns}
        from public.patients
        where deleted_at is null
        ${searchClause}
        order by created_at desc, id desc
        limit ${input.limit}
        offset ${offset}
      `)
      const totalItems = getCount(countRows[0]?.total_items ?? 0)

      await createAudit(transaction, {
        ...input,
        action: input.search ? 'PATIENT_SEARCHED' : 'PATIENT_LISTED',
        metadataValues: {
          hasSearchTerm: Boolean(input.search),
          limit: input.limit,
          page: input.page,
          resultCount: rows.length,
        },
        outcome: 'SUCCESS',
      })

      return { items: rows.map(mapPatientRow), totalItems }
    })
  },

  findPatient: async (input) => {
    return withTransaction(async (transaction): Promise<PatientRecord | null> => {
      const rows = await transaction.$queryRaw<readonly PatientRow[]>(Prisma.sql`
        select ${patientColumns}
        from public.patients
        where public_id = cast(${input.patientPublicId} as uuid)
          and deleted_at is null
      `)
      const patientRow = rows[0]

      await createAudit(transaction, {
        ...input,
        action: 'PATIENT_VIEWED',
        outcome: patientRow ? 'SUCCESS' : 'FAILURE',
        patientId: patientRow?.id,
        reason: patientRow ? undefined : 'PATIENT_NOT_FOUND',
        resourcePublicId: input.patientPublicId,
      })

      return patientRow ? mapPatientRow(patientRow) : null
    })
  },

  updatePatient: async (input) => {
    return withTransaction(async (transaction): Promise<UpdatePatientResult> => {
      const currentPatient = await lockPatient(transaction, input.patientPublicId)

      if (!currentPatient) {
        await createAudit(transaction, {
          ...input,
          action: 'PATIENT_UPDATED',
          outcome: 'FAILURE',
          reason: 'PATIENT_NOT_FOUND',
          resourcePublicId: input.patientPublicId,
        })
        return { status: 'NOT_FOUND' }
      }

      if (currentPatient.row_version !== input.rowVersion) {
        await createAudit(transaction, {
          ...input,
          action: 'PATIENT_UPDATED',
          outcome: 'FAILURE',
          patientId: currentPatient.id,
          reason: 'ROW_VERSION_CONFLICT',
          resourcePublicId: currentPatient.public_id,
        })
        return { status: 'VERSION_CONFLICT' }
      }

      await lockNik(transaction, input.nik)

      if (await hasDuplicateNik(transaction, input.nik, currentPatient.id)) {
        await createAudit(transaction, {
          ...input,
          action: 'PATIENT_UPDATED',
          outcome: 'FAILURE',
          patientId: currentPatient.id,
          reason: 'NIK_ALREADY_EXISTS',
          resourcePublicId: currentPatient.public_id,
        })
        return { status: 'NIK_EXISTS' }
      }

      const changedFields = getChangedFields(currentPatient, input)

      if (changedFields.length === 0) {
        await createAudit(transaction, {
          ...input,
          action: 'PATIENT_UPDATED',
          metadataValues: { changedFields, rowVersion: currentPatient.row_version },
          outcome: 'SUCCESS',
          patientId: currentPatient.id,
          resourcePublicId: currentPatient.public_id,
        })
        return { patient: mapPatientRow(currentPatient), status: 'UPDATED' }
      }

      const rows = await transaction.$queryRaw<readonly PatientRow[]>(Prisma.sql`
        update public.patients
        set nik = ${input.nik},
            full_name = ${input.fullName},
            sex = ${input.sex},
            date_of_birth = cast(${input.dateOfBirth} as date),
            phone = ${input.phone},
            normalized_phone = ${input.normalizedPhone},
            address = ${input.address},
            updated_by_user_id = ${input.principal.internalUserId}
        where id = ${currentPatient.id}
        returning ${patientColumns}
      `)
      const patientRow = rows[0]

      if (!patientRow) {
        throw new Error('Patient update did not return a record')
      }

      await createAudit(transaction, {
        ...input,
        action: 'PATIENT_UPDATED',
        metadataValues: {
          changedFields,
          newRowVersion: patientRow.row_version,
          previousRowVersion: currentPatient.row_version,
        },
        outcome: 'SUCCESS',
        patientId: patientRow.id,
        resourcePublicId: patientRow.public_id,
      })

      return { patient: mapPatientRow(patientRow), status: 'UPDATED' }
    })
  },

  deletePatient: async (input) => {
    return withTransaction(async (transaction): Promise<DeletePatientResult> => {
      const currentPatient = await lockPatient(transaction, input.patientPublicId)

      if (!currentPatient) {
        await createAudit(transaction, {
          ...input,
          action: 'PATIENT_DELETED',
          outcome: 'FAILURE',
          reason: 'PATIENT_NOT_FOUND',
          resourcePublicId: input.patientPublicId,
        })
        return { status: 'NOT_FOUND' }
      }

      const registrations = await transaction.$queryRaw<readonly { readonly id: bigint }[]>`
        select id
        from public.registrations
        where patient_id = ${currentPatient.id}
        limit 1
      `

      if (registrations.length > 0) {
        await createAudit(transaction, {
          ...input,
          action: 'PATIENT_DELETED',
          outcome: 'FAILURE',
          patientId: currentPatient.id,
          reason: 'PATIENT_HAS_REGISTRATIONS',
          resourcePublicId: currentPatient.public_id,
        })
        return { status: 'HAS_REGISTRATIONS' }
      }

      await transaction.$executeRaw`
        update public.patients
        set deleted_at = clock_timestamp(),
            deleted_by_user_id = ${input.principal.internalUserId},
            updated_by_user_id = ${input.principal.internalUserId}
        where id = ${currentPatient.id}
      `
      await createAudit(transaction, {
        ...input,
        action: 'PATIENT_DELETED',
        outcome: 'SUCCESS',
        patientId: currentPatient.id,
        resourcePublicId: currentPatient.public_id,
      })

      return { status: 'DELETED' }
    })
  },
}
