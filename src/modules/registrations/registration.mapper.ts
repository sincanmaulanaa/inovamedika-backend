import type { RegistrationAdministrativeData, RegistrationRecord } from './registration.types.js'

const toDateOnly = (date: Date): string => date.toISOString().slice(0, 10)
const toIso = (date: Date | null): string | null => (date ? date.toISOString() : null)

export const toRegistrationAdministrativeData = (
  record: RegistrationRecord,
): RegistrationAdministrativeData => ({
  cancelledAt: toIso(record.cancelledAt),
  cancelledReason: record.cancelledReason,
  checkedInAt: toIso(record.checkedInAt),
  completedAt: toIso(record.completedAt),
  createdAt: record.createdAt.toISOString(),
  doctorId: record.doctorPublicId,
  doctorName: record.doctorName,
  financingType: record.financingType,
  id: record.publicId,
  noShowAt: toIso(record.noShowAt),
  noShowReason: record.noShowReason,
  patientId: record.patientPublicId,
  patientMedicalRecordNumber: record.patientMedicalRecordNumber,
  patientName: record.patientName,
  payerId: record.payerPublicId,
  payerMemberNumber: record.payerMemberNumber,
  payerName: record.payerName,
  polyclinicId: record.polyclinicPublicId,
  polyclinicName: record.polyclinicName,
  repeatVisitReason: record.repeatVisitReason,
  rowVersion: record.rowVersion,
  serviceDate: toDateOnly(record.serviceDate),
  status: record.status,
  updatedAt: record.updatedAt.toISOString(),
  visitReason: record.visitReason,
})
