import type { AuthRequestMetadata, AuthenticatedPrincipal } from '../auth/auth.types.js'

export interface DashboardSummaryData {
  readonly date: string
  readonly totalPatients: number
  readonly totalRegistrations: number
  readonly waitingPatients: number
  readonly completedVisits: number
  // Included for internal compatibility if needed
  readonly waitingQueues: number
  readonly servingQueues: number
}

export interface DashboardRequestContext {
  readonly metadata: AuthRequestMetadata
  readonly principal: AuthenticatedPrincipal
}
