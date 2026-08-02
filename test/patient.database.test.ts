import { randomBytes } from 'node:crypto'

import request, { type Response as SupertestResponse } from 'supertest'
import { describe, expect, it } from 'vitest'

import { createApp } from '../src/app.js'
import { prisma } from '../src/db/prisma.js'
import { authService } from '../src/modules/auth/auth.service.js'
import { patientRepository } from '../src/modules/patients/patient.repository.js'

const getDemoPassword = (): string => {
  const password = process.env.DEMO_USER_PASSWORD

  if (!password) {
    throw new Error('DEMO_USER_PASSWORD is required for database patient tests')
  }

  return password
}

const createNik = (): string => {
  const randomValue = BigInt(`0x${randomBytes(8).toString('hex')}`) % 1_000_000_000_000_000n
  return `3${randomValue.toString().padStart(15, '0')}`
}

const login = async (app: ReturnType<typeof createApp>): Promise<string> => {
  const response = await request(app)
    .post('/api/v1/login')
    .send({ password: getDemoPassword(), username: 'registration' })

  expect(response.status).toBe(200)
  return response.body.data.accessToken as string
}

const createPatient = async ({
  accessToken,
  app,
  fullName,
  nik,
}: {
  readonly accessToken: string
  readonly app: ReturnType<typeof createApp>
  readonly fullName: string
  readonly nik: string
}): Promise<SupertestResponse> => {
  return request(app).post('/api/v1/patients').set('authorization', `Bearer ${accessToken}`).send({
    address: 'Alamat sintetis untuk pengujian pasien',
    dateOfBirth: '1990-04-12',
    fullName,
    nik,
    phone: '0812-3456-7890',
    sex: 'FEMALE',
  })
}

describe.runIf(process.env.DATABASE_TESTS === '1').sequential('database patient flow', () => {
  it('enforces patient identity, concurrency, audit, update, and delete rules', async () => {
    const app = createApp()
    const accessToken = await login(app)
    const nik = createNik()
    const principal = await authService.authenticateAccessToken({
      accessToken,
      countsAsActivity: true,
      metadata: { requestId: 'patient-concurrency-auth-test' },
    })
    const patientWriteData = {
      address: 'Alamat sintetis untuk pengujian pasien',
      dateOfBirth: '1990-04-12',
      fullName: 'Pasien Konkuren',
      nik,
      normalizedPhone: '+6281234567890',
      phone: '0812-3456-7890',
      principal,
      sex: 'FEMALE' as const,
    }
    const createResults = await Promise.all([
      patientRepository.createPatient({
        ...patientWriteData,
        metadata: { requestId: 'patient-concurrency-first-test' },
      }),
      patientRepository.createPatient({
        ...patientWriteData,
        metadata: { requestId: 'patient-concurrency-second-test' },
      }),
    ])
    const sortedStatuses = createResults.map((result) => result.status).sort()

    expect(sortedStatuses).toEqual(['CREATED', 'NIK_EXISTS'])
    const createdResult = createResults.find((result) => result.status === 'CREATED')

    expect(createdResult?.status).toBe('CREATED')

    if (!createdResult || createdResult.status !== 'CREATED') {
      throw new Error('Concurrent patient creation did not return the created patient')
    }

    expect(createdResult.patient.medicalRecordNumber).toMatch(/^RM-\d{8,}$/)
    const conflictResponse = await createPatient({
      accessToken,
      app,
      fullName: 'Pasien Pengguna NIK Duplikat',
      nik,
    })

    expect(conflictResponse.status).toBe(409)
    expect(conflictResponse.body).toMatchObject({
      code: 'PATIENT_NIK_EXISTS',
      message:
        'NIK sudah digunakan pada data pasien lain. Periksa kembali NIK atau cari pasien tersebut.',
    })

    const patientId = createdResult.patient.publicId
    const listResponse = await request(app)
      .get(`/api/v1/patients?page=1&limit=10&search=${nik}`)
      .set('authorization', `Bearer ${accessToken}`)

    expect(listResponse.status).toBe(200)
    expect(listResponse.body.data.items).toHaveLength(1)
    expect(listResponse.body.data.items[0].id).toBe(patientId)

    const updateResponse = await request(app)
      .put(`/api/v1/patients/${patientId}`)
      .set('authorization', `Bearer ${accessToken}`)
      .send({
        address: 'Alamat sintetis yang diperbarui',
        dateOfBirth: '1990-04-12',
        fullName: createdResult.patient.fullName,
        nik,
        phone: '+62 812 3456 7891',
        rowVersion: createdResult.patient.rowVersion,
        sex: 'FEMALE',
      })

    expect(updateResponse.status).toBe(200)
    expect(updateResponse.body.data.rowVersion).toBe(2)

    const phoneSearchResponse = await request(app)
      .get('/api/v1/patients?page=1&limit=10&search=081234567891')
      .set('authorization', `Bearer ${accessToken}`)

    expect(phoneSearchResponse.status).toBe(200)
    expect(phoneSearchResponse.body.data.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: patientId })]),
    )

    const staleUpdateResponse = await request(app)
      .put(`/api/v1/patients/${patientId}`)
      .set('authorization', `Bearer ${accessToken}`)
      .send({
        address: 'Perubahan yang sudah kedaluwarsa',
        dateOfBirth: '1990-04-12',
        fullName: createdResult.patient.fullName,
        nik,
        phone: '+62 812 3456 7891',
        rowVersion: 1,
        sex: 'FEMALE',
      })

    expect(staleUpdateResponse.status).toBe(409)
    expect(staleUpdateResponse.body.code).toBe('PATIENT_VERSION_CONFLICT')

    const deleteResponse = await request(app)
      .delete(`/api/v1/patients/${patientId}`)
      .set('authorization', `Bearer ${accessToken}`)

    expect(deleteResponse.status).toBe(200)

    const deletedDetailResponse = await request(app)
      .get(`/api/v1/patients/${patientId}`)
      .set('authorization', `Bearer ${accessToken}`)
    const reuseNikResponse = await createPatient({
      accessToken,
      app,
      fullName: 'Pasien Pengguna NIK Lama',
      nik,
    })

    expect(deletedDetailResponse.status).toBe(404)
    expect(reuseNikResponse.status).toBe(409)

    const auditLogs = await prisma.audit_logs.findMany({
      select: { action: true, metadata: true },
      where: { resource_public_id: patientId },
    })
    const auditPayload = JSON.stringify(auditLogs)

    expect(auditLogs.map((entry) => entry.action)).toEqual(
      expect.arrayContaining([
        'PATIENT_CREATED',
        'PATIENT_VIEWED',
        'PATIENT_UPDATED',
        'PATIENT_DELETED',
      ]),
    )
    expect(auditPayload).not.toContain(nik)
    expect(auditPayload).not.toContain('Alamat sintetis')
  })

  it('preserves a patient that already has a registration', async () => {
    const app = createApp()
    const accessToken = await login(app)
    const createResponse = await createPatient({
      accessToken,
      app,
      fullName: 'Pasien Dengan Kunjungan',
      nik: createNik(),
    })
    const patientId: string = createResponse.body.data.id
    const patient = await prisma.patients.findUniqueOrThrow({ where: { public_id: patientId } })
    const registrationUser = await prisma.users.findUniqueOrThrow({
      where: { username: 'registration' },
    })
    const queueLane = await prisma.queue_lanes.findFirstOrThrow({ where: { is_active: true } })

    await prisma.registrations.create({
      data: {
        created_by_user_id: registrationUser.id,
        doctor_id: queueLane.doctor_id,
        financing_type: 'SELF_PAY',
        patient_id: patient.id,
        polyclinic_id: queueLane.polyclinic_id,
        service_date: new Date('2026-08-02T00:00:00.000Z'),
        updated_by_user_id: registrationUser.id,
        visit_reason: 'Kunjungan sintetis untuk pengujian',
      },
    })

    const deleteResponse = await request(app)
      .delete(`/api/v1/patients/${patientId}`)
      .set('authorization', `Bearer ${accessToken}`)

    expect(deleteResponse.status).toBe(409)
    expect(deleteResponse.body.code).toBe('PATIENT_HAS_REGISTRATIONS')
    await expect(
      prisma.patients.findFirstOrThrow({
        where: { deleted_at: null, public_id: patientId },
      }),
    ).resolves.toMatchObject({ public_id: patientId })
  })
})
