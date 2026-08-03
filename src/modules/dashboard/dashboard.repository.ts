import { withTransaction } from '../../db/transaction.js'
import type { DashboardSummaryData } from './dashboard.types.js'

export interface DashboardRepository {
  readonly getDashboardSummary: (date: Date) => Promise<DashboardSummaryData>
}

export const dashboardRepository: DashboardRepository = {
  getDashboardSummary: async (date) => {
    return withTransaction(async (transaction) => {
      const patientRows = await transaction.$queryRaw<readonly { readonly count: bigint }[]>`
        select count(*) from public.patients
      `

      const regRows = await transaction.$queryRaw<readonly { readonly count: bigint }[]>`
        select count(*) from public.registrations
        where service_date = cast(${date} as date)
      `

      const waitingRows = await transaction.$queryRaw<readonly { readonly count: bigint }[]>`
        select count(*) from public.queues
        where service_date = cast(${date} as date) and status = 'WAITING'
      `

      const servingRows = await transaction.$queryRaw<readonly { readonly count: bigint }[]>`
        select count(*) from public.queues
        where service_date = cast(${date} as date) and status = 'SERVING'
      `
      
      const skippedRows = await transaction.$queryRaw<readonly { readonly count: bigint }[]>`
        select count(*) from public.queues
        where service_date = cast(${date} as date) and status = 'SKIPPED'
      `

      const completedRows = await transaction.$queryRaw<readonly { readonly count: bigint }[]>`
        select count(*) from public.registrations
        where service_date = cast(${date} as date) and status = 'COMPLETED'
      `

      const waitingQueues = Number(waitingRows[0]?.count ?? 0)
      const servingQueues = Number(servingRows[0]?.count ?? 0)
      const skippedQueues = Number(skippedRows[0]?.count ?? 0)

      return {
        date: date.toISOString().slice(0, 10),
        totalPatients: Number(patientRows[0]?.count ?? 0),
        totalRegistrations: Number(regRows[0]?.count ?? 0),
        waitingPatients: waitingQueues + servingQueues + skippedQueues,
        completedVisits: Number(completedRows[0]?.count ?? 0),
        waitingQueues,
        servingQueues,
      }
    })
  },
}
