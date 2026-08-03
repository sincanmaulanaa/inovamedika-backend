import { z } from 'zod'

const textMax = 5_000

const soapField = z
  .union([z.string(), z.null()])
  .optional()
  .transform((value) => {
    if (value === undefined || value === null) return null
    const trimmed = value.trim()
    return trimmed.length === 0 ? null : trimmed
  })
  .pipe(z.string().max(textMax, `Isian tidak dapat melebihi ${textMax} karakter.`).nullable())

export const medicalRecordIdParamsSchema = z.strictObject({
  id: z.uuid('Identitas rekam medis belum sesuai.'),
})

export const createMedicalRecordBodySchema = z.strictObject({
  assessment: soapField,
  objective: soapField,
  plan: soapField,
  registrationId: z.uuid('Identitas pendaftaran belum sesuai.'),
  subjective: soapField,
})

export const updateMedicalRecordBodySchema = z.strictObject({
  assessment: soapField,
  objective: soapField,
  plan: soapField,
  rowVersion: z
    .number({ error: 'Versi data wajib disertakan.' })
    .int('Versi data belum sesuai.')
    .positive('Versi data belum sesuai.'),
  subjective: soapField,
})

export const amendMedicalRecordBodySchema = z.strictObject({
  amendmentReason: z
    .string({ error: 'Alasan perubahan wajib diisi.' })
    .trim()
    .min(1, 'Alasan perubahan wajib diisi.')
    .max(1_000, 'Alasan perubahan tidak dapat melebihi 1.000 karakter.'),
  assessment: soapField,
  objective: soapField,
  plan: soapField,
  rowVersion: z
    .number({ error: 'Versi data wajib disertakan.' })
    .int('Versi data belum sesuai.')
    .positive('Versi data belum sesuai.'),
  subjective: soapField,
})

export const finalizeMedicalRecordBodySchema = z.strictObject({
  rowVersion: z
    .number({ error: 'Versi data wajib disertakan.' })
    .int('Versi data belum sesuai.')
    .positive('Versi data belum sesuai.'),
})

export const medicalRecordListQuerySchema = z.strictObject({
  doctorId: z.uuid('Identitas dokter belum sesuai.').optional(),
  limit: z.coerce
    .number({ error: 'Jumlah data per halaman belum sesuai.' })
    .int('Jumlah data per halaman harus berupa angka bulat.')
    .min(1, 'Jumlah data per halaman minimal 1.')
    .max(100, 'Jumlah data per halaman maksimal 100.')
    .default(10),
  page: z.coerce
    .number({ error: 'Nomor halaman belum sesuai.' })
    .int('Nomor halaman harus berupa angka bulat.')
    .min(1, 'Nomor halaman minimal 1.')
    .default(1),
  patientId: z.uuid('Identitas pasien belum sesuai.'),
  polyclinicId: z.uuid('Identitas poli belum sesuai.').optional(),
})

export const createCorrectionRequestBodySchema = z.strictObject({
  reason: z
    .string({ error: 'Alasan koreksi wajib diisi.' })
    .trim()
    .min(1, 'Alasan koreksi wajib diisi.')
    .max(1_000, 'Alasan koreksi tidak dapat melebihi 1.000 karakter.'),
})

export const correctionRequestIdParamsSchema = z.strictObject({
  id: z.uuid('Identitas permintaan koreksi belum sesuai.'),
})
