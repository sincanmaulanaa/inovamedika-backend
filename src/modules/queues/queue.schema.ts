import { z } from 'zod'
import { queueStatuses } from './queue.types.js'

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/

const isValidDateOnly = (value: string): boolean => {
  if (!isoDatePattern.test(value)) {
    return false
  }

  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export const queueIdParamsSchema = z.strictObject({
  id: z.uuid('Identitas antrean belum sesuai.'),
})

export const queueLaneIdParamsSchema = z.strictObject({
  id: z.uuid('Identitas jalur antrean belum sesuai.'),
})

export const createQueueBodySchema = z.strictObject({
  registrationId: z.uuid('Identitas pendaftaran belum sesuai.'),
})

export const queueListQuerySchema = z.strictObject({
  date: z
    .string({ error: 'Tanggal wajib diisi.' })
    .refine(isValidDateOnly, 'Tanggal harus berupa format yang valid.'),
  doctorId: z.uuid('Identitas dokter belum sesuai.').optional(),
  polyclinicId: z.uuid('Identitas poli belum sesuai.').optional(),
  queueLaneId: z.uuid('Identitas jalur antrean belum sesuai.').optional(),
  search: z
    .string()
    .trim()
    .max(100, 'Kata pencarian tidak dapat melebihi 100 karakter.')
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
  status: z.enum(queueStatuses, { error: 'Status antrean belum sesuai.' }).optional(),
})
