import type { QueueAdministrativeData, QueueRecord } from './queue.types.js'

const toDateOnly = (date: Date): string => date.toISOString().slice(0, 10)
const toIso = (date: Date | null): string | null => (date ? date.toISOString() : null)

export const toQueueAdministrativeData = (record: QueueRecord): QueueAdministrativeData => ({
  callCount: record.callCount,
  cancellationReason: record.cancellationReason,
  cancelledAt: toIso(record.cancelledAt),
  completedAt: toIso(record.completedAt),
  displayNumber: record.displayNumber,
  id: record.publicId,
  laneDisplayName: record.laneDisplayName,
  laneId: record.lanePublicId,
  lastCalledAt: toIso(record.lastCalledAt),
  patientMedicalRecordNumber: record.patientMedicalRecordNumber,
  patientName: record.patientName,
  registrationId: record.registrationPublicId,
  requeuedAt: toIso(record.requeuedAt),
  rowVersion: record.rowVersion,
  serviceDate: toDateOnly(record.serviceDate),
  servingStartedAt: toIso(record.servingStartedAt),
  skippedAt: toIso(record.skippedAt),
  status: record.status,
})
