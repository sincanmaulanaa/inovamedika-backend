import type { ErrorRequestHandler } from 'express'
import { ZodError } from 'zod'

import { logger } from '../config/logger.js'
import { DomainError } from './domain-error.js'
import { getRequestId } from './request-context.js'

const hasErrorType = (error: unknown, expectedType: string): boolean => {
  return (
    typeof error === 'object' && error !== null && 'type' in error && error.type === expectedType
  )
}

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  const requestId = getRequestId()

  if (hasErrorType(error, 'entity.parse.failed')) {
    response.status(400).json({
      success: false,
      message: 'Request body contains invalid JSON',
      code: 'INVALID_JSON',
      requestId,
    })
    return
  }

  if (hasErrorType(error, 'entity.too.large')) {
    response.status(413).json({
      success: false,
      message: 'Request body is too large',
      code: 'PAYLOAD_TOO_LARGE',
      requestId,
    })
    return
  }

  if (error instanceof ZodError) {
    response.status(422).json({
      success: false,
      message: 'Validation error',
      code: 'VALIDATION_ERROR',
      errors: error.flatten(),
      requestId,
    })
    return
  }

  if (error instanceof DomainError) {
    response.status(error.httpStatus).json({
      success: false,
      message: error.message,
      code: error.code,
      ...(error.details ? { errors: error.details } : {}),
      requestId,
    })
    return
  }

  logger.error({ error, requestId }, 'Unhandled request error')
  response.status(500).json({
    success: false,
    message: 'An unexpected error occurred',
    code: 'INTERNAL_ERROR',
    requestId,
  })
}
