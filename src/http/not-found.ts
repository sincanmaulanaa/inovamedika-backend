import type { RequestHandler } from 'express'

import { DomainError } from './domain-error.js'

export const notFoundHandler: RequestHandler = (request, _response, next) => {
  next(new DomainError('ROUTE_NOT_FOUND', 404, `Route ${request.method} ${request.path} not found`))
}
