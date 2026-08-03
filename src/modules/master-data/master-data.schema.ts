import { z } from 'zod'

export const medicationSearchQuerySchema = z.strictObject({
  limit: z.coerce
    .number({ error: 'Jumlah data per halaman belum sesuai.' })
    .int('Jumlah data per halaman harus berupa angka bulat.')
    .min(1, 'Jumlah data per halaman minimal 1.')
    .max(100, 'Jumlah data per halaman maksimal 100.')
    .default(20),
  search: z
    .string()
    .trim()
    .max(100, 'Kata pencarian tidak dapat melebihi 100 karakter.')
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
})
