import { z } from 'zod'

import { patientSexes } from './patient.types.js'

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/
const phoneCharacterPattern = /^[0-9+().\-\s]+$/

const normalizeNullableText = (value: string | null | undefined): string | null => {
  if (value === undefined || value === null) {
    return null
  }

  const trimmedValue = value.trim()
  return trimmedValue.length === 0 ? null : trimmedValue
}

const isValidDateOnly = (value: string): boolean => {
  if (!isoDatePattern.test(value)) {
    return false
  }

  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

const nullableTrimmedText = (maximumLength: number, message: string) => {
  return z
    .union([z.string(), z.null()])
    .optional()
    .transform(normalizeNullableText)
    .pipe(z.string().max(maximumLength, message).nullable())
}

const nikSchema = z
  .string({ error: 'NIK wajib diisi.' })
  .transform((value) => value.replace(/\s/g, ''))
  .pipe(z.string().regex(/^\d{16}$/, 'NIK harus terdiri dari 16 angka.'))

const phoneSchema = z
  .union([z.string(), z.null()])
  .optional()
  .transform(normalizeNullableText)
  .pipe(
    z
      .string()
      .max(30, 'Nomor telepon tidak dapat melebihi 30 karakter.')
      .refine(
        (value) => phoneCharacterPattern.test(value),
        'Nomor telepon hanya dapat memuat angka dan tanda telepon umum.',
      )
      .refine((value) => {
        const digitCount = value.replace(/\D/g, '').length
        return digitCount >= 8 && digitCount <= 15
      }, 'Nomor telepon harus terdiri dari 8 sampai 15 angka.')
      .nullable(),
  )

const patientMutationSchema = z.strictObject({
  address: nullableTrimmedText(1_000, 'Alamat tidak dapat melebihi 1.000 karakter.'),
  dateOfBirth: z
    .string({ error: 'Tanggal lahir wajib diisi.' })
    .refine(isValidDateOnly, 'Tanggal lahir harus berupa tanggal yang valid.'),
  fullName: z
    .string({ error: 'Nama pasien wajib diisi.' })
    .trim()
    .min(1, 'Nama pasien wajib diisi.')
    .max(200, 'Nama pasien tidak dapat melebihi 200 karakter.'),
  nik: nikSchema,
  phone: phoneSchema,
  sex: z.enum(patientSexes, { error: 'Pilih jenis kelamin.' }),
})

export const createPatientBodySchema = patientMutationSchema

export const updatePatientBodySchema = patientMutationSchema.extend({
  rowVersion: z
    .number({ error: 'Versi data pasien wajib disertakan.' })
    .int('Versi data pasien belum sesuai.')
    .positive('Versi data pasien belum sesuai.'),
})

export const patientIdParamsSchema = z.strictObject({
  id: z.uuid('Identitas pasien belum sesuai.'),
})

export const patientListQuerySchema = z.strictObject({
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
  search: z
    .string()
    .trim()
    .max(100, 'Kata pencarian tidak dapat melebihi 100 karakter.')
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
})
