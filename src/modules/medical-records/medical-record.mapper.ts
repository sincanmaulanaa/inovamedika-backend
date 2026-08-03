import type { MedicalRecordData, MedicalRecordRecord } from './medical-record.types.js'

const toDateOnly = (date: Date): string => date.toISOString().slice(0, 10)
const toIso = (date: Date | null): string | null => (date ? date.toISOString() : null)

export const toMedicalRecordData = (record: MedicalRecordRecord): MedicalRecordData => ({
  amendmentReason: record.amendmentReason,
  assessment: record.assessment,
  createdAt: record.createdAt.toISOString(),
  doctorId: record.doctorPublicId,
  doctorName: record.doctorName,
  finalizedAt: toIso(record.finalizedAt),
  bloodPressureSystolic: record.bloodPressureSystolic,
  bloodPressureDiastolic: record.bloodPressureDiastolic,
  temperatureCelsius: record.temperatureCelsius,
  weightKg: record.weightKg,
  heightCm: record.heightCm,
  actions: record.actions,
  id: record.publicId,
  patientId: record.patientPublicId,
  patientMedicalRecordNumber: record.patientMedicalRecordNumber,
  patientName: record.patientName,
  plan: record.plan,
  polyclinicId: record.polyclinicPublicId,
  polyclinicName: record.polyclinicName,
  registrationId: record.registrationPublicId,
  rowVersion: record.rowVersion,
  status: record.status,
  subjective: record.subjective,
  updatedAt: record.updatedAt.toISOString(),
  visitDate: toDateOnly(record.visitDate),
})
