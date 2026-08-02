import { randomUUID } from 'node:crypto'

import request, { type Test } from 'supertest'
import { describe, expect, it, vi } from 'vitest'

import { createApp } from '../src/app.js'
import type { AuthService } from '../src/modules/auth/auth.service.js'
import type { AuthenticatedPrincipal } from '../src/modules/auth/auth.types.js'
import type { PatientService } from '../src/modules/patients/patient.service.js'
import type { PatientAdministrativeData } from '../src/modules/patients/patient.types.js'

const patient: PatientAdministrativeData = {
  address: 'Jl. Pengujian 1',
  createdAt: '2026-08-02T01:00:00.000Z',
  dateOfBirth: '1990-04-12',
  fullName: 'Pasien Pengujian',
  id: '4bdf0c76-12ad-4ab8-814f-2d56bfd2c6ca',
  medicalRecordNumber: 'RM-00000010',
  nik: '3174000000000010',
  phone: '0812-0000-0010',
  rowVersion: 1,
  sex: 'FEMALE',
  updatedAt: '2026-08-02T01:00:00.000Z',
}

const requestBody = {
  address: patient.address,
  dateOfBirth: patient.dateOfBirth,
  fullName: patient.fullName,
  nik: patient.nik,
  phone: patient.phone,
  sex: patient.sex,
}

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

const createAuthenticationService = (principal = createPrincipal()): AuthService => {
  return {
    authenticateAccessToken: vi.fn(async () => principal),
    login: vi.fn(async () => {
      throw new Error('Not used in patient HTTP tests')
    }),
    logout: vi.fn(async () => undefined),
    recordAuthorizationDenied: vi.fn(async () => undefined),
    refresh: vi.fn(async () => {
      throw new Error('Not used in patient HTTP tests')
    }),
  }
}

const createPatientService = (): PatientService => {
  return {
    createPatient: vi.fn(async () => patient),
    deletePatient: vi.fn(async () => undefined),
    getPatient: vi.fn(async () => patient),
    listPatients: vi.fn(async () => ({
      items: [patient],
      pagination: { limit: 10, page: 1, totalItems: 1, totalPages: 1 },
    })),
    updatePatient: vi.fn(async () => ({ ...patient, rowVersion: 2 })),
  }
}

const authorize = (testRequest: Test): Test => {
  return testRequest.set('authorization', 'Bearer patient-test-access-token')
}

describe('patient HTTP contract', () => {
  it('requires an authenticated session', async () => {
    const patientManagementService = createPatientService()
    const app = createApp({
      authenticationService: createAuthenticationService(),
      patientManagementService,
      readinessCheck: async () => undefined,
    })

    const response = await request(app).get('/api/v1/patients')

    expect(response.status).toBe(401)
    expect(response.body.code).toBe('SESSION_EXPIRED')
    expect(patientManagementService.listPatients).not.toHaveBeenCalled()
  })

  it('denies patient administration to a doctor and records the decision', async () => {
    const authenticationService = createAuthenticationService(createPrincipal({ role: 'DOCTOR' }))
    const patientManagementService = createPatientService()
    const app = createApp({
      authenticationService,
      patientManagementService,
      readinessCheck: async () => undefined,
    })

    const response = await authorize(request(app).get('/api/v1/patients')).set(
      'x-request-id',
      'patient-role-test',
    )

    expect(response.status).toBe(403)
    expect(response.body).toMatchObject({
      code: 'FORBIDDEN',
      message: 'Tindakan ini tidak tersedia untuk akun yang sedang digunakan.',
    })
    expect(authenticationService.recordAuthorizationDenied).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'ROLE_NOT_ALLOWED' }),
    )
    expect(patientManagementService.listPatients).not.toHaveBeenCalled()
  })

  it('returns field-level Indonesian guidance for invalid patient data', async () => {
    const patientManagementService = createPatientService()
    const app = createApp({
      authenticationService: createAuthenticationService(),
      patientManagementService,
      readinessCheck: async () => undefined,
    })

    const response = await authorize(request(app).post('/api/v1/patients')).send({
      ...requestBody,
      fullName: ' ',
      nik: '123',
    })

    expect(response.status).toBe(422)
    expect(response.body).toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'Beberapa data belum sesuai. Periksa kembali kolom yang ditandai.',
    })
    expect(response.body.errors).toEqual({
      fullName: ['Nama pasien wajib diisi.'],
      nik: ['NIK harus terdiri dari 16 angka.'],
    })
    expect(patientManagementService.createPatient).not.toHaveBeenCalled()
  })

  it('creates a patient without accepting a client-supplied medical record number', async () => {
    const patientManagementService = createPatientService()
    const app = createApp({
      authenticationService: createAuthenticationService(),
      patientManagementService,
      readinessCheck: async () => undefined,
    })

    const response = await authorize(request(app).post('/api/v1/patients')).send(requestBody)

    expect(response.status).toBe(201)
    expect(response.body).toEqual({ data: patient, message: 'Data pasien disimpan', success: true })
    expect(patientManagementService.createPatient).toHaveBeenCalledWith(
      expect.objectContaining({ data: requestBody }),
    )
  })

  it('lists, reads, updates, and deletes administrative patient data', async () => {
    const patientManagementService = createPatientService()
    const app = createApp({
      authenticationService: createAuthenticationService(),
      patientManagementService,
      readinessCheck: async () => undefined,
    })

    const listResponse = await authorize(
      request(app).get('/api/v1/patients?page=1&limit=10&search=Pengujian'),
    )
    const detailResponse = await authorize(request(app).get(`/api/v1/patients/${patient.id}`))
    const updateResponse = await authorize(request(app).put(`/api/v1/patients/${patient.id}`)).send(
      { ...requestBody, rowVersion: 1 },
    )
    const deleteResponse = await authorize(request(app).delete(`/api/v1/patients/${patient.id}`))

    expect(listResponse.status).toBe(200)
    expect(listResponse.body.data.pagination).toEqual({
      limit: 10,
      page: 1,
      totalItems: 1,
      totalPages: 1,
    })
    expect(detailResponse.body.data).toEqual(patient)
    expect(updateResponse.body).toMatchObject({
      data: { id: patient.id, rowVersion: 2 },
      message: 'Perubahan data pasien disimpan',
    })
    expect(deleteResponse.body).toEqual({
      data: null,
      message: 'Data pasien dihapus',
      success: true,
    })
    expect(patientManagementService.listPatients).toHaveBeenCalledWith(
      expect.objectContaining({ query: { limit: 10, page: 1, search: 'Pengujian' } }),
    )
  })
})
