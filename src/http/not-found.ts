import type { RequestHandler } from 'express'

import { DomainError } from './domain-error.js'

export const notFoundHandler: RequestHandler = (_request, _response, next) => {
  next(
    new DomainError(
      'ROUTE_NOT_FOUND',
      404,
      'Layanan yang diminta tidak ditemukan. Periksa kembali alamat yang digunakan.',
    ),
  )
}
