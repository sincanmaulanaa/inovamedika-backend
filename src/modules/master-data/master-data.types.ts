export interface DoctorData {
  readonly id: string
  readonly fullName: string
  readonly sipNumber: string
  readonly specialization: string | null
}

export interface QueueLaneData {
  readonly id: string
  readonly code: string
  readonly displayName: string
  readonly queuePrefix: string
  readonly doctorId: string
  readonly doctorName: string
}

export interface PolyclinicData {
  readonly id: string
  readonly code: string
  readonly name: string
  readonly queuePrefix: string
  readonly queueLane: QueueLaneData | null
}

export interface PayerData {
  readonly id: string
  readonly code: string
  readonly name: string
  readonly payerType: string
}

export interface MedicationData {
  readonly id: string
  readonly code: string
  readonly name: string
  readonly dosageForm: string
  readonly strength: string
  readonly kfaCode: string | null
}

export interface MedicationSearchQuery {
  readonly search?: string | undefined
  readonly limit: number
}
