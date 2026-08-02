import { randomUUID } from 'node:crypto'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AuthenticatedPrincipal } from '../auth/auth.types.js'
import type { PatientRepository } from './patient.repository.js'
import { createPatientService } from './patient.service.js'
import type { PatientMutationData, PatientRecord } from './patient.types.js'

const createPrincipal = (
  overrides: Partial<AuthenticatedPrincipal> = {},
): AuthenticatedPrincipal => {
  return {
    displayName: 'Petugas Pengujian',
    id: randomUUID(),
    internalSessionId: 2n,
    internalUserId: 1n,
    permissions: [],
    role: 'REGISTRATION_OFFICER',
    sessionId: randomUUID(),
    username: 'registration.test',
    ...overrides,
  }
}

const patientRecord: PatientRecord = {
  address: 'Jl. Pengujian 1',
  createdAt: new Date('2026-08-02T01:00:00.000Z'),
  dateOfBirth: new Date('1990-04-12T00:00:00.000Z'),
  fullName: 'Pasien Pengujian',
  id: 10n,
  medicalRecordNumber: 'RM-00000010',
  nik: '3174000000000010',
  normalizedPhone: '+6281200000010',
  phone: '0812-0000-0010',
  publicId: '4bdf0c76-12ad-4ab8-814f-2d56bfd2c6ca',
  rowVersion: 1,
  sex: 'FEMALE',
  updatedAt: new Date('2026-08-02T01:00:00.000Z'),
}

const patientData: PatientMutationData = {
  address: patientRecord.address,
  dateOfBirth: '1990-04-12',
  fullName: patientRecord.fullName,
  nik: patientRecord.nik,
  phone: patientRecord.phone,
  sex: patientRecord.sex,
}

const context = {
  metadata: { requestId: 'patient-service-test' },
  principal: createPrincipal(),
}

const createRepository = (): PatientRepository => {
  return {
    createPatient: vi.fn<PatientRepository['createPatient']>(async () => ({
      patient: patientRecord,
      status: 'CREATED',
    })),
    deletePatient: vi.fn<PatientRepository['deletePatient']>(async () => ({
      status: 'DELETED',
    })),
    findPatient: vi.fn<PatientRepository['findPatient']>(async () => patientRecord),
    listPatients: vi.fn<PatientRepository['listPatients']>(async () => ({
      items: [patientRecord],
      totalItems: 1,
    })),
    updatePatient: vi.fn<PatientRepository['updatePatient']>(async () => ({
      patient: patientRecord,
      status: 'UPDATED',
    })),
  }
}

describe('patient service', () => {
  let repository: PatientRepository

  beforeEach(() => {
    repository = createRepository()
  })

  it('normalizes an Indonesian phone number before creating a patient', async () => {
    const service = createPatientService({
      clock: () => new Date('2026-08-02T02:00:00.000Z'),
      repository,
    })

    const patient = await service.createPatient({ ...context, data: patientData })

    expect(patient).toMatchObject({
      id: patientRecord.publicId,
      medicalRecordNumber: patientRecord.medicalRecordNumber,
      nik: patientRecord.nik,
    })
    expect(repository.createPatient).toHaveBeenCalledWith(
      expect.objectContaining({
        normalizedPhone: '+6281200000010',
        phone: '0812-0000-0010',
      }),
    )
  })

  it('rejects a birth date after the current clinic date', async () => {
    const service = createPatientService({
      clock: () => new Date('2026-08-02T02:00:00.000Z'),
      repository,
    })

    await expect(
      service.createPatient({
        ...context,
        data: { ...patientData, dateOfBirth: '2026-08-03' },
      }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      details: { dateOfBirth: ['Tanggal lahir tidak boleh melewati hari ini.'] },
    })
    expect(repository.createPatient).not.toHaveBeenCalled()
  })

  it('maps a duplicate NIK to a safe conflict response', async () => {
    vi.mocked(repository.createPatient).mockResolvedValue({ status: 'NIK_EXISTS' })
    const service = createPatientService({ repository })

    await expect(service.createPatient({ ...context, data: patientData })).rejects.toMatchObject({
      code: 'PATIENT_NIK_EXISTS',
      httpStatus: 409,
      message:
        'NIK sudah digunakan pada data pasien lain. Periksa kembali NIK atau cari pasien tersebut.',
    })
  })

  it('does not allow a doctor to access administrative patient management', async () => {
    const service = createPatientService({ repository })

    await expect(
      service.listPatients({
        metadata: context.metadata,
        principal: createPrincipal({ role: 'DOCTOR' }),
        query: { limit: 10, page: 1 },
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', httpStatus: 403 })
    expect(repository.listPatients).not.toHaveBeenCalled()
  })

  it('returns deterministic pagination metadata', async () => {
    vi.mocked(repository.listPatients).mockResolvedValue({ items: [patientRecord], totalItems: 21 })
    const service = createPatientService({ repository })

    const result = await service.listPatients({
      ...context,
      query: { limit: 10, page: 2, search: 'Pasien' },
    })

    expect(result.pagination).toEqual({ limit: 10, page: 2, totalItems: 21, totalPages: 3 })
  })

  it('reports an update conflict when the submitted row version is stale', async () => {
    vi.mocked(repository.updatePatient).mockResolvedValue({ status: 'VERSION_CONFLICT' })
    const service = createPatientService({ repository })

    await expect(
      service.updatePatient({
        ...context,
        data: { ...patientData, rowVersion: 1 },
        patientId: patientRecord.publicId,
      }),
    ).rejects.toMatchObject({ code: 'PATIENT_VERSION_CONFLICT', httpStatus: 409 })
  })

  it('preserves a patient that already has a registration', async () => {
    vi.mocked(repository.deletePatient).mockResolvedValue({ status: 'HAS_REGISTRATIONS' })
    const service = createPatientService({ repository })

    await expect(
      service.deletePatient({ ...context, patientId: patientRecord.publicId }),
    ).rejects.toMatchObject({ code: 'PATIENT_HAS_REGISTRATIONS', httpStatus: 409 })
  })
})
