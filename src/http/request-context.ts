import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'

import type { NextFunction, Request, Response } from 'express'

interface RequestContext {
  requestId: string
}

const requestContextStorage = new AsyncLocalStorage<RequestContext>()
const requestIdPattern = /^[a-zA-Z0-9._-]{1,100}$/

export const requestContextMiddleware = (
  request: Request,
  response: Response,
  next: NextFunction,
): void => {
  const requestedId = request.header('x-request-id')
  const requestId = requestedId && requestIdPattern.test(requestedId) ? requestedId : randomUUID()

  response.setHeader('x-request-id', requestId)
  requestContextStorage.run({ requestId }, next)
}

export const getRequestId = (): string => {
  return requestContextStorage.getStore()?.requestId ?? 'unknown'
}
