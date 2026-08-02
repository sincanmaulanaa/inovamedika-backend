import type { Request, RequestHandler } from 'express'

import { DomainError } from '../../http/domain-error.js'
import { getRequestId } from '../../http/request-context.js'
import { sendSuccess } from '../../http/response.js'
import { getAuthRequestMetadata } from '../auth/auth.middleware.js'
import type { AuthenticatedPrincipal } from '../auth/auth.types.js'
import {
  createPatientBodySchema,
  patientIdParamsSchema,
  patientListQuerySchema,
  updatePatientBodySchema,
} from './patient.schema.js'
import type { PatientService } from './patient.service.js'

const getPrincipal = (request: Request): AuthenticatedPrincipal => {
  if (request.auth) {
    return request.auth
  }

  throw new DomainError('SESSION_EXPIRED', 401, 'Sesi Anda telah berakhir. Silakan masuk kembali.')
}

const getContext = (request: Request) => {
  return {
    metadata: { ...getAuthRequestMetadata(request), requestId: getRequestId() },
    principal: getPrincipal(request),
  }
}

export const createPatientHandler = (service: PatientService): RequestHandler => {
  return async (request, response, next): Promise<void> => {
    try {
      const data = createPatientBodySchema.parse(request.body)
      const patient = await service.createPatient({ ...getContext(request), data })
      sendSuccess(response.status(201), patient, 'Data pasien disimpan')
    } catch (error) {
      next(error)
    }
  }
}

export const listPatientsHandler = (service: PatientService): RequestHandler => {
  return async (request, response, next): Promise<void> => {
    try {
      const query = patientListQuerySchema.parse(request.query)
      const patients = await service.listPatients({ ...getContext(request), query })
      sendSuccess(response, patients, 'Daftar pasien tersedia')
    } catch (error) {
      next(error)
    }
  }
}

export const getPatientHandler = (service: PatientService): RequestHandler => {
  return async (request, response, next): Promise<void> => {
    try {
      const { id } = patientIdParamsSchema.parse(request.params)
      const patient = await service.getPatient({ ...getContext(request), patientId: id })
      sendSuccess(response, patient, 'Data pasien tersedia')
    } catch (error) {
      next(error)
    }
  }
}

export const updatePatientHandler = (service: PatientService): RequestHandler => {
  return async (request, response, next): Promise<void> => {
    try {
      const { id } = patientIdParamsSchema.parse(request.params)
      const data = updatePatientBodySchema.parse(request.body)
      const patient = await service.updatePatient({
        ...getContext(request),
        data,
        patientId: id,
      })
      sendSuccess(response, patient, 'Perubahan data pasien disimpan')
    } catch (error) {
      next(error)
    }
  }
}

export const deletePatientHandler = (service: PatientService): RequestHandler => {
  return async (request, response, next): Promise<void> => {
    try {
      const { id } = patientIdParamsSchema.parse(request.params)
      await service.deletePatient({ ...getContext(request), patientId: id })
      sendSuccess(response, null, 'Data pasien dihapus')
    } catch (error) {
      next(error)
    }
  }
}
