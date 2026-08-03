import { z } from 'zod'

export const prescriptionIdParamsSchema = z.strictObject({
  id: z.uuid('Identitas resep belum sesuai.'),
})

const prescriptionItemSchema = z.strictObject({
  dosageInstructions: z
    .string({ error: 'Aturan pakai wajib diisi.' })
    .trim()
    .min(1, 'Aturan pakai wajib diisi.')
    .max(100, 'Aturan pakai tidak dapat melebihi 100 karakter.'),
  medicationId: z.uuid('Identitas obat belum sesuai.'),
  notes: z
    .union([z.string(), z.null()])
    .optional()
    .transform((value) => {
      if (value === undefined || value === null) return null
      const trimmed = value.trim()
      return trimmed.length === 0 ? null : trimmed
    })
    .pipe(z.string().max(255, 'Catatan tidak dapat melebihi 255 karakter.').nullable()),
  quantity: z
    .number({ error: 'Jumlah obat wajib diisi.' })
    .int('Jumlah obat harus berupa angka bulat.')
    .positive('Jumlah obat minimal 1.')
    .max(10_000, 'Jumlah obat tidak wajar.'),
})

export const createPrescriptionBodySchema = z.strictObject({
  items: z
    .array(prescriptionItemSchema)
    .min(1, 'Resep wajib memiliki minimal 1 obat.')
    .max(50, 'Resep maksimal memiliki 50 obat.'),
  medicalRecordId: z.uuid('Identitas rekam medis belum sesuai.'),
  notes: z
    .union([z.string(), z.null()])
    .optional()
    .transform((value) => {
      if (value === undefined || value === null) return null
      const trimmed = value.trim()
      return trimmed.length === 0 ? null : trimmed
    })
    .pipe(z.string().max(1_000, 'Catatan resep tidak dapat melebihi 1.000 karakter.').nullable()),
})

export const updatePrescriptionBodySchema = z.strictObject({
  items: z
    .array(prescriptionItemSchema)
    .min(1, 'Resep wajib memiliki minimal 1 obat.')
    .max(50, 'Resep maksimal memiliki 50 obat.'),
  notes: z
    .union([z.string(), z.null()])
    .optional()
    .transform((value) => {
      if (value === undefined || value === null) return value === null ? null : undefined
      const trimmed = value.trim()
      return trimmed.length === 0 ? null : trimmed
    }),
  rowVersion: z
    .number({ error: 'Versi data wajib disertakan.' })
    .int('Versi data belum sesuai.')
    .positive('Versi data belum sesuai.'),
})

export const finalizePrescriptionBodySchema = z.strictObject({
  rowVersion: z
    .number({ error: 'Versi data wajib disertakan.' })
    .int('Versi data belum sesuai.')
    .positive('Versi data belum sesuai.'),
})

export const cancelPrescriptionBodySchema = z.strictObject({
  rowVersion: z
    .number({ error: 'Versi data wajib disertakan.' })
    .int('Versi data belum sesuai.')
    .positive('Versi data belum sesuai.'),
})

export const prescriptionListQuerySchema = z.strictObject({
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
})
