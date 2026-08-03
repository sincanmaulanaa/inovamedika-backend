import { Prisma } from '../../generated/prisma/client.js'

import { withTransaction } from '../../db/transaction.js'
import type {
  DoctorData,
  MedicationData,
  MedicationSearchQuery,
  PayerData,
  PolyclinicData,
} from './master-data.types.js'

interface DoctorRow {
  readonly public_id: string
  readonly full_name: string
  readonly sip_number: string
  readonly specialization: string | null
}

interface PolyclinicRow {
  readonly public_id: string
  readonly code: string
  readonly name: string
  readonly queue_prefix: string
  readonly lane_public_id: string | null
  readonly lane_code: string | null
  readonly lane_display_name: string | null
  readonly lane_queue_prefix: string | null
  readonly lane_doctor_public_id: string | null
  readonly lane_doctor_name: string | null
}

interface PayerRow {
  readonly public_id: string
  readonly code: string
  readonly name: string
  readonly payer_type: string
}

interface MedicationRow {
  readonly public_id: string
  readonly code: string
  readonly name: string
  readonly dosage_form: string
  readonly strength: string
  readonly kfa_code: string | null
}

const mapDoctorRow = (row: DoctorRow): DoctorData => ({
  fullName: row.full_name,
  id: row.public_id,
  sipNumber: row.sip_number,
  specialization: row.specialization,
})

const mapPolyclinicRow = (row: PolyclinicRow): PolyclinicData => ({
  code: row.code,
  id: row.public_id,
  name: row.name,
  queueLane:
    row.lane_public_id !== null
      ? {
          code: row.lane_code!,
          displayName: row.lane_display_name!,
          doctorId: row.lane_doctor_public_id!,
          doctorName: row.lane_doctor_name!,
          id: row.lane_public_id,
          queuePrefix: row.lane_queue_prefix!,
        }
      : null,
  queuePrefix: row.queue_prefix,
})

const mapPayerRow = (row: PayerRow): PayerData => ({
  code: row.code,
  id: row.public_id,
  name: row.name,
  payerType: row.payer_type,
})

const mapMedicationRow = (row: MedicationRow): MedicationData => ({
  code: row.code,
  dosageForm: row.dosage_form,
  id: row.public_id,
  kfaCode: row.kfa_code,
  name: row.name,
  strength: row.strength,
})

export interface MasterDataRepository {
  readonly listDoctors: () => Promise<readonly DoctorData[]>
  readonly listPolyclinics: () => Promise<readonly PolyclinicData[]>
  readonly listPayers: () => Promise<readonly PayerData[]>
  readonly searchMedications: (query: MedicationSearchQuery) => Promise<readonly MedicationData[]>
}

export const masterDataRepository: MasterDataRepository = {
  listDoctors: async () => {
    return withTransaction(async (transaction) => {
      const rows = await transaction.$queryRaw<readonly DoctorRow[]>`
        select
          d.public_id,
          d.full_name,
          d.sip_number,
          d.specialization
        from public.doctors d
        where d.is_active = true
        order by d.full_name, d.id
      `

      return rows.map(mapDoctorRow)
    })
  },

  listPolyclinics: async () => {
    return withTransaction(async (transaction) => {
      const rows = await transaction.$queryRaw<readonly PolyclinicRow[]>`
        select
          p.public_id,
          p.code,
          p.name,
          p.queue_prefix,
          ql.public_id as lane_public_id,
          ql.code as lane_code,
          ql.display_name as lane_display_name,
          ql.queue_prefix as lane_queue_prefix,
          d.public_id as lane_doctor_public_id,
          d.full_name as lane_doctor_name
        from public.polyclinics p
        left join public.queue_lanes ql
          on ql.polyclinic_id = p.id and ql.is_active = true
        left join public.doctors d
          on d.id = ql.doctor_id and d.is_active = true
        where p.is_active = true
        order by p.name, p.id
      `

      return rows.map(mapPolyclinicRow)
    })
  },

  listPayers: async () => {
    return withTransaction(async (transaction) => {
      const rows = await transaction.$queryRaw<readonly PayerRow[]>`
        select
          public_id,
          code,
          name,
          payer_type
        from public.payers
        where is_active = true
        order by payer_type, name, id
      `

      return rows.map(mapPayerRow)
    })
  },

  searchMedications: async (query) => {
    return withTransaction(async (transaction) => {
      const searchClause = query.search
        ? (() => {
            const escapedSearch = query.search.replace(/[\\%_]/g, '\\$&')
            const searchPattern = `%${escapedSearch}%`
            return Prisma.sql`
              and (
                name ilike ${searchPattern} escape '\\'
                or code ilike ${searchPattern} escape '\\'
              )
            `
          })()
        : Prisma.empty

      const rows = await transaction.$queryRaw<readonly MedicationRow[]>(
        Prisma.sql`
          select
            public_id,
            code,
            name,
            dosage_form,
            strength,
            kfa_code
          from public.medications
          where is_active = true
          ${searchClause}
          order by name, id
          limit ${query.limit}
        `,
      )

      return rows.map(mapMedicationRow)
    })
  },
}
