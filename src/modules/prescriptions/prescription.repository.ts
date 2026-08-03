import { Prisma } from '../../generated/prisma/client.js'

import { withTransaction } from '../../db/transaction.js'
import type { AuthRequestMetadata, AuthenticatedPrincipal } from '../auth/auth.types.js'
import {
  prescriptionStatuses,
  type PrescriptionListQuery,
  type PrescriptionMutationData,
  type PrescriptionRecord,
  type PrescriptionStatus,
  type PrescriptionUpdateData,
} from './prescription.types.js'

interface PrescriptionRow {
  readonly id: bigint
  readonly public_id: string
  readonly medical_record_id: bigint
  readonly medical_record_public_id: string
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
  readonly date: Date
  readonly status: string
  readonly notes: string | null
  readonly row_version: number
  readonly created_at: Date
  readonly updated_at: Date
}

interface PrescriptionItemRow {
  readonly id: bigint
  readonly prescription_id: bigint
  readonly medication_id: bigint
  readonly medication_public_id: string
  readonly medication_name: string
  readonly medication_code: string
  readonly medication_dosage_form: string
  readonly medication_strength: string
  readonly quantity: number
  readonly dosage_instructions: string
  readonly notes: string | null
}

interface PrescriptionRepositoryContext {
  readonly metadata: AuthRequestMetadata
  readonly principal: AuthenticatedPrincipal
}

interface AuditInput extends PrescriptionRepositoryContext {
  readonly action: string
  readonly outcome: 'SUCCESS' | 'FAILURE'
  readonly patientId?: bigint | undefined
  readonly medicalRecordId?: bigint | undefined
  readonly prescriptionId?: bigint | undefined
  readonly resourcePublicId?: string | undefined
  readonly reason?: string | undefined
  readonly metadataValues?: Readonly<Record<string, unknown>> | undefined
}

export interface CreatePrescriptionInput extends PrescriptionRepositoryContext {
  readonly data: PrescriptionMutationData
}

export interface UpdatePrescriptionInput extends PrescriptionRepositoryContext {
  readonly prescriptionPublicId: string
  readonly data: PrescriptionUpdateData
  readonly status?: PrescriptionStatus | undefined
}

export interface ListPrescriptionsInput extends PrescriptionRepositoryContext {
  readonly query: PrescriptionListQuery
}

export interface FindPrescriptionInput extends PrescriptionRepositoryContext {
  readonly prescriptionPublicId: string
}

export type CreatePrescriptionResult =
  | { readonly status: 'CREATED'; readonly prescription: PrescriptionRecord }
  | { readonly status: 'MEDICAL_RECORD_NOT_FOUND' }
  | { readonly status: 'MEDICAL_RECORD_LOCKED' }
  | { readonly status: 'PRESCRIPTION_ALREADY_EXISTS' }
  | { readonly status: 'NOT_ASSIGNED_TO_DOCTOR' }
  | { readonly status: 'MEDICATION_NOT_FOUND'; readonly missingIds: readonly string[] }

export type UpdatePrescriptionResult =
  | { readonly status: 'UPDATED'; readonly prescription: PrescriptionRecord }
  | { readonly status: 'NOT_FOUND' }
  | { readonly status: 'VERSION_CONFLICT' }
  | { readonly status: 'LOCKED_RECORD' }
  | { readonly status: 'INVALID_STATUS_TRANSITION' }
  | { readonly status: 'MEDICATION_NOT_FOUND'; readonly missingIds: readonly string[] }

export interface PrescriptionListResult {
  readonly items: readonly PrescriptionRecord[]
  readonly totalItems: number
}

export interface PrescriptionRepository {
  readonly createPrescription: (input: CreatePrescriptionInput) => Promise<CreatePrescriptionResult>
  readonly updatePrescription: (input: UpdatePrescriptionInput) => Promise<UpdatePrescriptionResult>
  readonly listPrescriptions: (input: ListPrescriptionsInput) => Promise<PrescriptionListResult>
  readonly findPrescription: (input: FindPrescriptionInput) => Promise<PrescriptionRecord | null>
}

const parsePrescriptionStatus = (value: string): PrescriptionStatus => {
  const parsed = prescriptionStatuses.find((s) => s === value)
  if (!parsed) throw new Error('Stored prescription status is not supported')
  return parsed
}

const getCount = (value: bigint | number | string): number => {
  const count = Number(value)
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('Count exceeds safe integer')
  return count
}

const prescriptionColumns = Prisma.sql`
  pr.id,
  pr.public_id,
  pr.medical_record_id,
  mr.public_id as medical_record_public_id,
  pr.patient_id,
  p.public_id as patient_public_id,
  p.full_name as patient_name,
  p.medical_record_number as patient_mrn,
  pr.doctor_id,
  d.public_id as doctor_public_id,
  d.full_name as doctor_name,
  pr.polyclinic_id,
  pol.public_id as polyclinic_public_id,
  pol.name as polyclinic_name,
  pr.date,
  pr.status,
  pr.notes,
  pr.row_version,
  pr.created_at,
  pr.updated_at
`

const prescriptionJoins = Prisma.sql`
  from public.prescriptions pr
  join public.medical_records mr on mr.id = pr.medical_record_id
  join public.patients p on p.id = pr.patient_id
  join public.doctors d on d.id = pr.doctor_id
  join public.polyclinics pol on pol.id = pr.polyclinic_id
`

const itemColumns = Prisma.sql`
  pi.id,
  pi.prescription_id,
  pi.medication_id,
  m.public_id as medication_public_id,
  m.name as medication_name,
  m.code as medication_code,
  m.dosage_form as medication_dosage_form,
  m.strength as medication_strength,
  pi.quantity,
  pi.dosage_instructions,
  pi.notes
`

const mapPrescriptionRow = (
  row: PrescriptionRow,
  items: readonly PrescriptionItemRow[],
): PrescriptionRecord => ({
  createdAt: row.created_at,
  date: row.date,
  doctorId: row.doctor_id,
  doctorName: row.doctor_name,
  doctorPublicId: row.doctor_public_id,
  id: row.id,
  items: items.map((item) => ({
    dosageInstructions: item.dosage_instructions,
    id: item.id,
    medicationCode: item.medication_code,
    medicationDosageForm: item.medication_dosage_form,
    medicationId: item.medication_id,
    medicationName: item.medication_name,
    medicationPublicId: item.medication_public_id,
    medicationStrength: item.medication_strength,
    notes: item.notes,
    prescriptionId: item.prescription_id,
    quantity: item.quantity,
  })),
  medicalRecordId: row.medical_record_id,
  medicalRecordPublicId: row.medical_record_public_id,
  notes: row.notes,
  patientId: row.patient_id,
  patientMedicalRecordNumber: row.patient_mrn,
  patientName: row.patient_name,
  patientPublicId: row.patient_public_id,
  polyclinicId: row.polyclinic_id,
  polyclinicName: row.polyclinic_name,
  polyclinicPublicId: row.polyclinic_public_id,
  publicId: row.public_id,
  rowVersion: row.row_version,
  status: parsePrescriptionStatus(row.status),
  updatedAt: row.updated_at,
})

const createAudit = async (
  transaction: Prisma.TransactionClient,
  input: AuditInput,
): Promise<void> => {
  const metadata = JSON.stringify(input.metadataValues ?? {})

  await transaction.$executeRaw`
    insert into public.audit_logs (
      actor_user_id, actor_username_snapshot, actor_role_snapshot, session_id,
      patient_id, medical_record_id, resource_type, resource_public_id, action, outcome, reason,
      request_id, ip_address, user_agent, metadata
    ) values (
      ${input.principal.internalUserId}, ${input.principal.username}, ${input.principal.role}, ${input.principal.internalSessionId},
      ${input.patientId ?? null}, ${input.medicalRecordId ?? null}, 'PRESCRIPTION', cast(${input.resourcePublicId ?? null} as uuid),
      ${input.action}, ${input.outcome}, ${input.reason ?? null},
      ${input.metadata.requestId}, cast(${input.metadata.ipAddress ?? null} as inet), ${input.metadata.userAgent ?? null}, cast(${metadata} as jsonb)
    )
  `
}

export const prescriptionRepository: PrescriptionRepository = {
  createPrescription: async (input) => {
    return withTransaction(async (transaction): Promise<CreatePrescriptionResult> => {
      const mrQuery = await transaction.$queryRaw<
        readonly {
          readonly id: bigint
          readonly patient_id: bigint
          readonly doctor_id: bigint
          readonly polyclinic_id: bigint
          readonly status: string
          readonly visit_date: Date
        }[]
      >`
        select id, patient_id, doctor_id, polyclinic_id, status, visit_date
        from public.medical_records
        where public_id = cast(${input.data.medicalRecordId} as uuid)
      `

      const mr = mrQuery[0]
      if (!mr) {
        return { status: 'MEDICAL_RECORD_NOT_FOUND' }
      }

      if (input.principal.role === 'DOCTOR' && mr.doctor_id !== input.principal.internalUserId) {
        return { status: 'NOT_ASSIGNED_TO_DOCTOR' }
      }

      if (mr.status === 'FINAL' || mr.status === 'AMENDED') {
        return { status: 'MEDICAL_RECORD_LOCKED' }
      }

      await transaction.$queryRaw`select pg_advisory_xact_lock(hashtextextended(${`pr:${mr.id}`}, 84623))::text as lock_result`

      const existing = await transaction.$queryRaw<readonly { readonly public_id: string }[]>`
        select public_id from public.prescriptions where medical_record_id = ${mr.id}
      `

      if (existing.length > 0) {
        return { status: 'PRESCRIPTION_ALREADY_EXISTS' }
      }

      // Check medications
      const medIds = input.data.items.map((i) => Prisma.sql`cast(${i.medicationId} as uuid)`)
      const medList = Prisma.join(medIds, ', ')
      const medications = await transaction.$queryRaw<
        readonly { readonly id: bigint; readonly public_id: string }[]
      >`
        select id, public_id from public.medications where public_id in (${medList}) and is_active = true
      `

      if (medications.length !== input.data.items.length) {
        const found = new Set(medications.map((m) => m.public_id))
        const missing = input.data.items
          .filter((i) => !found.has(i.medicationId))
          .map((i) => i.medicationId)
        return { status: 'MEDICATION_NOT_FOUND', missingIds: missing }
      }

      const medMap = new Map(medications.map((m) => [m.public_id, m.id]))

      const rows = await transaction.$queryRaw<
        readonly { readonly id: bigint; readonly public_id: string }[]
      >`
        insert into public.prescriptions (
          medical_record_id, patient_id, doctor_id, polyclinic_id, date, status, notes, created_by_user_id, updated_by_user_id
        ) values (
          ${mr.id}, ${mr.patient_id}, ${mr.doctor_id}, ${mr.polyclinic_id}, cast(${mr.visit_date} as date), 'DRAFT', ${input.data.notes}, ${input.principal.internalUserId}, ${input.principal.internalUserId}
        ) returning id, public_id
      `

      const prescriptionId = rows[0]!.id

      for (const item of input.data.items) {
        await transaction.$executeRaw`
          insert into public.prescription_items (
            prescription_id, medication_id, quantity, dosage_instructions, notes
          ) values (
            ${prescriptionId}, ${medMap.get(item.medicationId)}, ${item.quantity}, ${item.dosageInstructions}, ${item.notes}
          )
        `
      }

      const fullRows = await transaction.$queryRaw<readonly PrescriptionRow[]>(Prisma.sql`
        select ${prescriptionColumns} ${prescriptionJoins} where pr.id = ${prescriptionId}
      `)

      const items = await transaction.$queryRaw<readonly PrescriptionItemRow[]>(Prisma.sql`
        select ${itemColumns}
        from public.prescription_items pi
        join public.medications m on m.id = pi.medication_id
        where pi.prescription_id = ${prescriptionId}
        order by pi.id asc
      `)

      await createAudit(transaction, {
        ...input,
        action: 'PRESCRIPTION_CREATED',
        outcome: 'SUCCESS',
        patientId: mr.patient_id,
        medicalRecordId: mr.id,
        prescriptionId: prescriptionId,
        resourcePublicId: rows[0]!.public_id,
      })

      return { status: 'CREATED', prescription: mapPrescriptionRow(fullRows[0]!, items) }
    })
  },

  updatePrescription: async (input) => {
    return withTransaction(async (transaction): Promise<UpdatePrescriptionResult> => {
      const lockRows = await transaction.$queryRaw<
        readonly {
          readonly id: bigint
          readonly patient_id: bigint
          readonly medical_record_id: bigint
          readonly public_id: string
          readonly status: string
          readonly row_version: number
        }[]
      >`
        select id, patient_id, medical_record_id, public_id, status, row_version
        from public.prescriptions
        where public_id = cast(${input.prescriptionPublicId} as uuid)
        for update
      `

      const current = lockRows[0]
      if (!current) return { status: 'NOT_FOUND' }
      if (current.row_version !== input.data.rowVersion) return { status: 'VERSION_CONFLICT' }

      if (current.status !== 'DRAFT') {
        return { status: 'LOCKED_RECORD' }
      }

      const setClauses: Prisma.Sql[] = [
        Prisma.sql`updated_by_user_id = ${input.principal.internalUserId}`,
      ]

      if (input.data.notes !== undefined) setClauses.push(Prisma.sql`notes = ${input.data.notes}`)
      if (input.status !== undefined) setClauses.push(Prisma.sql`status = ${input.status}`)

      let medMap = new Map<string, bigint>()
      // Check medications if updating items
      if (input.data.items !== undefined) {
        const medIds = input.data.items.map((i) => Prisma.sql`cast(${i.medicationId} as uuid)`)
        const medList = Prisma.join(medIds, ', ')
        const medications = await transaction.$queryRaw<
          readonly { readonly id: bigint; readonly public_id: string }[]
        >`
          select id, public_id from public.medications where public_id in (${medList}) and is_active = true
        `

        if (medications.length !== input.data.items.length) {
          const found = new Set(medications.map((m) => m.public_id))
          const missing = input.data.items
            .filter((i) => !found.has(i.medicationId))
            .map((i) => i.medicationId)
          return { status: 'MEDICATION_NOT_FOUND', missingIds: missing }
        }

        medMap = new Map(medications.map((m) => [m.public_id, m.id]))
      }

      const setFragment = Prisma.join(setClauses, ', ')

      await transaction.$executeRaw(Prisma.sql`
        update public.prescriptions
        set ${setFragment}
        where id = ${current.id}
      `)

      if (input.data.items !== undefined) {
        // Recreate items
        await transaction.$executeRaw`delete from public.prescription_items where prescription_id = ${current.id}`

        for (const item of input.data.items) {
          await transaction.$executeRaw`
            insert into public.prescription_items (
              prescription_id, medication_id, quantity, dosage_instructions, notes
            ) values (
              ${current.id}, ${medMap.get(item.medicationId)}, ${item.quantity}, ${item.dosageInstructions}, ${item.notes}
            )
          `
        }
      }

      const fullRows = await transaction.$queryRaw<readonly PrescriptionRow[]>(Prisma.sql`
        select ${prescriptionColumns} ${prescriptionJoins} where pr.id = ${current.id}
      `)

      const items = await transaction.$queryRaw<readonly PrescriptionItemRow[]>(Prisma.sql`
        select ${itemColumns}
        from public.prescription_items pi
        join public.medications m on m.id = pi.medication_id
        where pi.prescription_id = ${current.id}
        order by pi.id asc
      `)

      await createAudit(transaction, {
        ...input,
        action: 'PRESCRIPTION_UPDATED',
        outcome: 'SUCCESS',
        patientId: current.patient_id,
        medicalRecordId: current.medical_record_id,
        prescriptionId: current.id,
        resourcePublicId: current.public_id,
      })

      return { status: 'UPDATED', prescription: mapPrescriptionRow(fullRows[0]!, items) }
    })
  },

  listPrescriptions: async (input) => {
    return withTransaction(async (transaction): Promise<PrescriptionListResult> => {
      const filters: Prisma.Sql[] = [
        Prisma.sql`and p.public_id = cast(${input.query.patientId} as uuid)`,
      ]

      if (input.query.doctorId) {
        filters.push(Prisma.sql`and d.public_id = cast(${input.query.doctorId} as uuid)`)
      }

      const filterFragment = Prisma.join(filters, ' ')
      const offset = (input.query.page - 1) * input.query.limit

      const countRows = await transaction.$queryRaw<
        readonly { readonly total_items: bigint | number | string }[]
      >(Prisma.sql`
        select count(*)::bigint as total_items ${prescriptionJoins} where 1 = 1 ${filterFragment}
      `)

      const rows = await transaction.$queryRaw<readonly PrescriptionRow[]>(Prisma.sql`
        select ${prescriptionColumns} ${prescriptionJoins} where 1 = 1 ${filterFragment}
        order by pr.date desc, pr.created_at desc
        limit ${input.query.limit} offset ${offset}
      `)

      const itemMap = new Map<bigint, PrescriptionItemRow[]>()

      if (rows.length > 0) {
        const prIds = rows.map((r) => r.id)
        const prList = Prisma.join(prIds, ', ')
        const allItems = await transaction.$queryRaw<readonly PrescriptionItemRow[]>(Prisma.sql`
          select ${itemColumns}
          from public.prescription_items pi
          join public.medications m on m.id = pi.medication_id
          where pi.prescription_id in (${prList})
          order by pi.id asc
        `)

        for (const item of allItems) {
          const arr = itemMap.get(item.prescription_id) ?? []
          arr.push(item)
          itemMap.set(item.prescription_id, arr)
        }
      }

      const records = rows.map((row) => mapPrescriptionRow(row, itemMap.get(row.id) ?? []))

      await createAudit(transaction, {
        ...input,
        action: 'PRESCRIPTION_LISTED',
        outcome: 'SUCCESS',
        metadataValues: {
          limit: input.query.limit,
          page: input.query.page,
          resultCount: rows.length,
        },
      })

      return { items: records, totalItems: getCount(countRows[0]?.total_items ?? 0) }
    })
  },

  findPrescription: async (input) => {
    return withTransaction(async (transaction): Promise<PrescriptionRecord | null> => {
      const rows = await transaction.$queryRaw<readonly PrescriptionRow[]>(Prisma.sql`
        select ${prescriptionColumns} ${prescriptionJoins} where pr.public_id = cast(${input.prescriptionPublicId} as uuid)
      `)

      const recordRow = rows[0]
      if (!recordRow) return null

      const items = await transaction.$queryRaw<readonly PrescriptionItemRow[]>(Prisma.sql`
        select ${itemColumns}
        from public.prescription_items pi
        join public.medications m on m.id = pi.medication_id
        where pi.prescription_id = ${recordRow.id}
        order by pi.id asc
      `)

      await createAudit(transaction, {
        ...input,
        action: 'PRESCRIPTION_VIEWED',
        outcome: 'SUCCESS',
        patientId: recordRow.patient_id,
        prescriptionId: recordRow.id,
        resourcePublicId: input.prescriptionPublicId,
      })

      return mapPrescriptionRow(recordRow, items)
    })
  },
}
