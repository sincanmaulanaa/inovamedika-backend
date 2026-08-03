import type { Request, RequestHandler } from 'express'

import { DomainError } from '../../http/domain-error.js'
import { getRequestId } from '../../http/request-context.js'
import { sendSuccess } from '../../http/response.js'
import { getAuthRequestMetadata } from '../auth/auth.middleware.js'
import type { AuthenticatedPrincipal } from '../auth/auth.types.js'
import {
  createRegistrationBodySchema,
  registrationIdParamsSchema,
  registrationListQuerySchema,
  updateRegistrationBodySchema,
} from './registration.schema.js'
import type { RegistrationService } from './registration.service.js'

const getPrincipal = (request: Request): AuthenticatedPrincipal => {
  if (request.auth) {
    return request.auth
  }

  throw new DomainError('SESSION_EXPIRED', 401, 'Sesi Anda telah berakhir. Silakan masuk kembali.')
}

const getContext = (request: Request) => ({
  metadata: { ...getAuthRequestMetadata(request), requestId: getRequestId() },
  principal: getPrincipal(request),
})

export const createRegistrationHandler = (service: RegistrationService): RequestHandler => {
  return async (request, response, next): Promise<void> => {
    try {
      const data = createRegistrationBodySchema.parse(request.body)
      const registration = await service.createRegistration({
        ...getContext(request),
        data,
      })
      sendSuccess(response.status(201), registration, 'Pendaftaran disimpan')
    } catch (error) {
      next(error)
    }
  }
}

export const listRegistrationsHandler = (service: RegistrationService): RequestHandler => {
  return async (request, response, next): Promise<void> => {
    try {
      const query = registrationListQuerySchema.parse(request.query)
      const registrations = await service.listRegistrations({
        ...getContext(request),
        query,
      })
      sendSuccess(response, registrations, 'Daftar pendaftaran tersedia')
    } catch (error) {
      next(error)
    }
  }
}

export const getRegistrationHandler = (service: RegistrationService): RequestHandler => {
  return async (request, response, next): Promise<void> => {
    try {
      const { id } = registrationIdParamsSchema.parse(request.params)
      const registration = await service.getRegistration({
        ...getContext(request),
        registrationId: id,
      })
      sendSuccess(response, registration, 'Data pendaftaran tersedia')
    } catch (error) {
      next(error)
    }
  }
}

export const updateRegistrationHandler = (service: RegistrationService): RequestHandler => {
  return async (request, response, next): Promise<void> => {
    try {
      const { id } = registrationIdParamsSchema.parse(request.params)
      const data = updateRegistrationBodySchema.parse(request.body)
      const registration = await service.updateRegistration({
        ...getContext(request),
        data,
        registrationId: id,
      })
      sendSuccess(response, registration, 'Perubahan pendaftaran disimpan')
    } catch (error) {
      next(error)
    }
  }
}
