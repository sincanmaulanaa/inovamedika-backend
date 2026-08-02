import type { PatientAdministrativeData, PatientRecord } from './patient.types.js'

const toDateOnly = (date: Date): string => date.toISOString().slice(0, 10)

export const toPatientAdministrativeData = (patient: PatientRecord): PatientAdministrativeData => {
  return {
    address: patient.address,
    createdAt: patient.createdAt.toISOString(),
    dateOfBirth: toDateOnly(patient.dateOfBirth),
    fullName: patient.fullName,
    id: patient.publicId,
    medicalRecordNumber: patient.medicalRecordNumber,
    nik: patient.nik,
    phone: patient.phone,
    rowVersion: patient.rowVersion,
    sex: patient.sex,
    updatedAt: patient.updatedAt.toISOString(),
  }
}
