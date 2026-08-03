import { z } from 'zod'

import { financingTypes, registrationStatuses } from './registration.types.js'

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/

const isValidDateOnly = (value: string): boolean => {
  if (!isoDatePattern.test(value)) {
    return false
  }

  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export const createRegistrationBodySchema = z.strictObject({
  doctorId: z.uuid('Identitas dokter belum sesuai.'),
  financingType: z.enum(financingTypes, {
    error: 'Pilih jenis pembiayaan.',
  }),
  patientId: z.uuid('Identitas pasien belum sesuai.'),
  payerId: z
    .union([z.uuid('Identitas penjamin belum sesuai.'), z.null()])
    .optional()
    .transform((value) => value ?? null),
  payerMemberNumber: z
    .union([z.string(), z.null()])
    .optional()
    .transform((value) => {
      if (value === undefined || value === null) return null
      const trimmed = value.trim()
      return trimmed.length === 0 ? null : trimmed
    })
    .pipe(z.string().max(100, 'Nomor peserta tidak dapat melebihi 100 karakter.').nullable()),
  polyclinicId: z.uuid('Identitas poli belum sesuai.'),
  repeatVisitReason: z
    .union([z.string(), z.null()])
    .optional()
    .transform((value) => {
      if (value === undefined || value === null) return null
      const trimmed = value.trim()
      return trimmed.length === 0 ? null : trimmed
    })
    .pipe(
      z
        .string()
        .max(1_000, 'Alasan kunjungan ulang tidak dapat melebihi 1.000 karakter.')
        .nullable(),
    ),
  serviceDate: z
    .string({ error: 'Tanggal kunjungan wajib diisi.' })
    .refine(isValidDateOnly, 'Tanggal kunjungan harus berupa tanggal yang valid.'),
  visitReason: z
    .string({ error: 'Alasan kunjungan wajib diisi.' })
    .trim()
    .min(1, 'Alasan kunjungan wajib diisi.')
    .max(1_000, 'Alasan kunjungan tidak dapat melebihi 1.000 karakter.'),
})

export const updateRegistrationBodySchema = z.strictObject({
  cancelledReason: z
    .string()
    .trim()
    .max(1_000, 'Alasan pembatalan tidak dapat melebihi 1.000 karakter.')
    .optional(),
  financingType: z.enum(financingTypes, { error: 'Pilih jenis pembiayaan.' }).optional(),
  noShowReason: z
    .string()
    .trim()
    .max(1_000, 'Alasan tidak hadir tidak dapat melebihi 1.000 karakter.')
    .optional(),
  payerId: z.union([z.uuid('Identitas penjamin belum sesuai.'), z.null()]).optional(),
  payerMemberNumber: z
    .union([z.string(), z.null()])
    .optional()
    .transform((value) => {
      if (value === undefined || value === null) return value === null ? null : undefined
      const trimmed = value.trim()
      return trimmed.length === 0 ? null : trimmed
    }),
  rowVersion: z
    .number({ error: 'Versi data pendaftaran wajib disertakan.' })
    .int('Versi data pendaftaran belum sesuai.')
    .positive('Versi data pendaftaran belum sesuai.'),
  status: z.enum(registrationStatuses, { error: 'Status kunjungan belum sesuai.' }).optional(),
  visitReason: z
    .string()
    .trim()
    .min(1, 'Alasan kunjungan wajib diisi.')
    .max(1_000, 'Alasan kunjungan tidak dapat melebihi 1.000 karakter.')
    .optional(),
})

export const registrationIdParamsSchema = z.strictObject({
  id: z.uuid('Identitas pendaftaran belum sesuai.'),
})

export const registrationListQuerySchema = z.strictObject({
  date: z
    .string()
    .refine(isValidDateOnly, 'Tanggal filter harus berupa tanggal yang valid.')
    .optional(),
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
  polyclinicId: z.uuid('Identitas poli belum sesuai.').optional(),
  search: z
    .string()
    .trim()
    .max(100, 'Kata pencarian tidak dapat melebihi 100 karakter.')
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
  status: z.enum(registrationStatuses, { error: 'Status kunjungan belum sesuai.' }).optional(),
})
