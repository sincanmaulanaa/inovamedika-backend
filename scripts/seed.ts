import 'dotenv/config'

import { argon2id, hash } from 'argon2'

import { closeDatabase, prisma } from '../src/db/prisma.js'
import type { Prisma } from '../src/generated/prisma/client.js'

const advisoryLockNamespace = 84_621
const advisoryLockKey = 2
const supportedSeedEnvironments = new Set(['development', 'test'])

type UserRole = 'ADMINISTRATOR' | 'DOCTOR' | 'REGISTRATION_OFFICER'

interface UserSeed {
  readonly displayName: string
  readonly email: string
  readonly role: UserRole
  readonly username: string
}

const users: readonly UserSeed[] = [
  {
    displayName: 'Administrator Demo',
    email: 'admin@example.test',
    role: 'ADMINISTRATOR',
    username: 'admin',
  },
  {
    displayName: 'Petugas Pendaftaran Demo',
    email: 'registration@example.test',
    role: 'REGISTRATION_OFFICER',
    username: 'registration',
  },
  {
    displayName: 'dr. Maya Pratama',
    email: 'doctor@example.test',
    role: 'DOCTOR',
    username: 'doctor',
  },
]

const permissions = [
  ['AUDIT_READ', 'Read and export the append-only processing audit trail.'],
  ['PMIK_APPROVAL', 'Approve administrative corrections under the clinic SOP.'],
  ['PATIENT_DATA_EXPORT', 'Approve and export one verified patient data-subject request.'],
  ['BREAK_GLASS', 'Use the separately audited emergency-access workflow.'],
] as const

const polyclinics = [
  { code: 'POLI_UMUM', name: 'Poli Umum', queuePrefix: 'UM' },
  { code: 'POLI_GIGI', name: 'Poli Gigi', queuePrefix: 'GI' },
] as const

const queueLanes = [
  { code: 'LANE_UMUM', displayName: 'Antrean Poli Umum', polyclinicCode: 'POLI_UMUM' },
  { code: 'LANE_GIGI', displayName: 'Antrean Poli Gigi', polyclinicCode: 'POLI_GIGI' },
] as const

const payers = [
  { code: 'BPJS', name: 'BPJS Kesehatan', payerType: 'BPJS_KESEHATAN' },
  { code: 'COMPANY_DEMO', name: 'Perusahaan Mitra Demo', payerType: 'COMPANY' },
  {
    code: 'INSURANCE_DEMO',
    name: 'Asuransi Swasta Demo',
    payerType: 'PRIVATE_INSURANCE',
  },
] as const

const medications = [
  { code: 'PARA500TAB', dosageForm: 'Tablet', name: 'Paracetamol', strength: '500 mg' },
  { code: 'AMOX500CAP', dosageForm: 'Kapsul', name: 'Amoxicillin', strength: '500 mg' },
  { code: 'CTM4TAB', dosageForm: 'Tablet', name: 'Chlorpheniramine maleate', strength: '4 mg' },
  { code: 'ANTASIDA_TAB', dosageForm: 'Tablet kunyah', name: 'Antasida', strength: '200 mg' },
  { code: 'ORALIT_SACHET', dosageForm: 'Serbuk oral', name: 'Oralit', strength: '200 mL' },
] as const

const patients = [
  {
    address: 'Alamat sintetis untuk pengujian',
    dateOfBirth: '1990-04-12',
    fullName: 'Pasien Demo Satu',
    nik: '3174000000000001',
    normalizedPhone: '+6281200000001',
    phone: '0812-0000-0001',
    sex: 'FEMALE',
  },
  {
    address: 'Alamat sintetis untuk pengujian',
    dateOfBirth: '1985-09-23',
    fullName: 'Pasien Demo Dua',
    nik: '3174000000000002',
    normalizedPhone: '+6281200000002',
    phone: '0812-0000-0002',
    sex: 'MALE',
  },
] as const

const getConfiguration = (): {
  demoPassword: string
  nodeEnvironment: string
} => {
  const nodeEnvironment = process.env.NODE_ENV ?? 'development'

  if (!supportedSeedEnvironments.has(nodeEnvironment)) {
    throw new Error(
      `Database seeding is only allowed in development or test, not "${nodeEnvironment}"`,
    )
  }

  const demoPassword = process.env.DEMO_USER_PASSWORD

  if (!demoPassword) {
    throw new Error('DEMO_USER_PASSWORD must be set before seeding')
  }

  if (demoPassword.length < 12) {
    throw new Error('DEMO_USER_PASSWORD must contain at least 12 characters')
  }

  return { demoPassword, nodeEnvironment }
}

const buildPasswordHash = async (password: string): Promise<string> => {
  return hash(password, {
    memoryCost: 19_456,
    parallelism: 1,
    timeCost: 2,
    type: argon2id,
  })
}

const seedUsers = async (
  transaction: Prisma.TransactionClient,
  passwordHash: string,
): Promise<Map<string, bigint>> => {
  const userIds = new Map<string, bigint>()

  for (const user of users) {
    const savedUser = await transaction.users.upsert({
      create: {
        display_name: user.displayName,
        email: user.email,
        is_active: true,
        password_hash: passwordHash,
        role: user.role,
        username: user.username,
      },
      update: {
        display_name: user.displayName,
        email: user.email,
        is_active: true,
        role: user.role,
      },
      where: { username: user.username },
    })

    userIds.set(user.username, savedUser.id)
  }

  return userIds
}

const seedPermissions = async (
  transaction: Prisma.TransactionClient,
  adminUserId: bigint,
): Promise<void> => {
  let auditReadPermissionId: bigint | undefined

  for (const [code, description] of permissions) {
    const permission = await transaction.permissions.upsert({
      create: { code, description },
      update: { description },
      where: { code },
    })

    if (code === 'AUDIT_READ') {
      auditReadPermissionId = permission.id
    }
  }

  if (auditReadPermissionId === undefined) {
    throw new Error('AUDIT_READ permission was not created')
  }

  await transaction.user_permissions.upsert({
    create: {
      granted_by_user_id: adminUserId,
      permission_id: auditReadPermissionId,
      user_id: adminUserId,
    },
    update: { granted_by_user_id: adminUserId },
    where: {
      user_id_permission_id: {
        permission_id: auditReadPermissionId,
        user_id: adminUserId,
      },
    },
  })
}

const seedDoctor = async (
  transaction: Prisma.TransactionClient,
  doctorUserId: bigint,
): Promise<bigint> => {
  const doctor = await transaction.doctors.upsert({
    create: {
      full_name: 'dr. Maya Pratama',
      is_active: true,
      sip_number: 'SIP-DEMO-001',
      specialization: 'Dokter Umum',
      user_id: doctorUserId,
    },
    update: {
      full_name: 'dr. Maya Pratama',
      is_active: true,
      sip_number: 'SIP-DEMO-001',
      specialization: 'Dokter Umum',
    },
    where: { user_id: doctorUserId },
  })

  return doctor.id
}

const seedPolyclinicsAndLanes = async (
  transaction: Prisma.TransactionClient,
  doctorId: bigint,
): Promise<void> => {
  const polyclinicIds = new Map<string, bigint>()

  for (const polyclinic of polyclinics) {
    const savedPolyclinic = await transaction.polyclinics.upsert({
      create: {
        code: polyclinic.code,
        is_active: true,
        name: polyclinic.name,
        queue_prefix: polyclinic.queuePrefix,
      },
      update: {
        is_active: true,
        name: polyclinic.name,
        queue_prefix: polyclinic.queuePrefix,
      },
      where: { code: polyclinic.code },
    })

    polyclinicIds.set(polyclinic.code, savedPolyclinic.id)
  }

  for (const lane of queueLanes) {
    const polyclinicId = polyclinicIds.get(lane.polyclinicCode)
    const queuePrefix = polyclinics.find(
      (polyclinic) => polyclinic.code === lane.polyclinicCode,
    )?.queuePrefix

    if (polyclinicId === undefined || queuePrefix === undefined) {
      throw new Error(`Missing polyclinic configuration for queue lane ${lane.code}`)
    }

    await transaction.queue_lanes.upsert({
      create: {
        code: lane.code,
        display_name: lane.displayName,
        doctor_id: doctorId,
        is_active: true,
        polyclinic_id: polyclinicId,
        queue_prefix: queuePrefix,
      },
      update: {
        display_name: lane.displayName,
        doctor_id: doctorId,
        is_active: true,
        polyclinic_id: polyclinicId,
        queue_prefix: queuePrefix,
      },
      where: { code: lane.code },
    })
  }
}

const seedPayers = async (transaction: Prisma.TransactionClient): Promise<void> => {
  for (const payer of payers) {
    await transaction.payers.upsert({
      create: {
        code: payer.code,
        is_active: true,
        name: payer.name,
        payer_type: payer.payerType,
      },
      update: {
        is_active: true,
        name: payer.name,
        payer_type: payer.payerType,
      },
      where: { code: payer.code },
    })
  }
}

const seedMedications = async (transaction: Prisma.TransactionClient): Promise<void> => {
  for (const medication of medications) {
    await transaction.medications.upsert({
      create: {
        code: medication.code,
        dosage_form: medication.dosageForm,
        is_active: true,
        name: medication.name,
        strength: medication.strength,
      },
      update: {
        dosage_form: medication.dosageForm,
        is_active: true,
        name: medication.name,
        strength: medication.strength,
      },
      where: { code: medication.code },
    })
  }
}

const seedPatients = async (
  transaction: Prisma.TransactionClient,
  adminUserId: bigint,
): Promise<void> => {
  for (const patient of patients) {
    const dateOfBirth = new Date(`${patient.dateOfBirth}T00:00:00.000Z`)

    await transaction.patients.upsert({
      create: {
        address: patient.address,
        created_by_user_id: adminUserId,
        date_of_birth: dateOfBirth,
        full_name: patient.fullName,
        medical_record_number: '',
        nik: patient.nik,
        normalized_phone: patient.normalizedPhone,
        phone: patient.phone,
        sex: patient.sex,
        updated_by_user_id: adminUserId,
      },
      update: {
        address: patient.address,
        date_of_birth: dateOfBirth,
        full_name: patient.fullName,
        normalized_phone: patient.normalizedPhone,
        phone: patient.phone,
        sex: patient.sex,
        updated_by_user_id: adminUserId,
      },
      where: { nik: patient.nik },
    })
  }
}

const seedDatabase = async (
  transaction: Prisma.TransactionClient,
  passwordHash: string,
): Promise<void> => {
  const userIds = await seedUsers(transaction, passwordHash)
  const adminUserId = userIds.get('admin')
  const doctorUserId = userIds.get('doctor')

  if (adminUserId === undefined || doctorUserId === undefined) {
    throw new Error('Required demo users were not created')
  }

  await seedPermissions(transaction, adminUserId)
  const doctorId = await seedDoctor(transaction, doctorUserId)
  await seedPolyclinicsAndLanes(transaction, doctorId)
  await seedPayers(transaction)
  await seedMedications(transaction)
  await seedPatients(transaction, adminUserId)
}

const run = async (): Promise<void> => {
  const configuration = getConfiguration()
  const passwordHash = await buildPasswordHash(configuration.demoPassword)

  await prisma.$transaction(
    async (transaction) => {
      await transaction.$queryRaw`
        select pg_advisory_xact_lock(
          ${advisoryLockNamespace},
          ${advisoryLockKey}
        )::text as "lockResult"
      `
      await transaction.$executeRaw`set local lock_timeout = '5s'`
      await transaction.$executeRaw`set local statement_timeout = '30s'`
      await seedDatabase(transaction, passwordHash)
    },
    { maxWait: 5_000, timeout: 30_000 },
  )

  console.info(`Seed completed for ${configuration.nodeEnvironment}: admin, registration, doctor`)
}

run()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown seed error'
    console.error(`Seed failed: ${message}`)
    process.exitCode = 1
  })
  .finally(async () => {
    await closeDatabase()
  })
