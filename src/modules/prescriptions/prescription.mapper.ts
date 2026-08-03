import type {
  PrescriptionData,
  PrescriptionItemData,
  PrescriptionItemRecord,
  PrescriptionRecord,
} from './prescription.types.js'

const toDateOnly = (date: Date): string => date.toISOString().slice(0, 10)

const toPrescriptionItemData = (record: PrescriptionItemRecord): PrescriptionItemData => ({
  dosageInstructions: record.dosageInstructions,
  medicationCode: record.medicationCode,
  medicationDosageForm: record.medicationDosageForm,
  medicationId: record.medicationPublicId,
  medicationName: record.medicationName,
  medicationStrength: record.medicationStrength,
  notes: record.notes,
  quantity: record.quantity,
})

export const toPrescriptionData = (record: PrescriptionRecord): PrescriptionData => ({
  createdAt: record.createdAt.toISOString(),
  date: toDateOnly(record.date),
  doctorId: record.doctorPublicId,
  doctorName: record.doctorName,
  id: record.publicId,
  items: record.items.map(toPrescriptionItemData),
  medicalRecordId: record.medicalRecordPublicId,
  notes: record.notes,
  patientId: record.patientPublicId,
  patientMedicalRecordNumber: record.patientMedicalRecordNumber,
  patientName: record.patientName,
  polyclinicId: record.polyclinicPublicId,
  polyclinicName: record.polyclinicName,
  rowVersion: record.rowVersion,
  status: record.status,
  updatedAt: record.updatedAt.toISOString(),
})
