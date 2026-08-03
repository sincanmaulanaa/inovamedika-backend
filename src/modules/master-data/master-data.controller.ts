import type { RequestHandler } from 'express'

import { sendSuccess } from '../../http/response.js'
import type { MasterDataRepository } from './master-data.repository.js'
import { medicationSearchQuerySchema } from './master-data.schema.js'

export const listDoctorsHandler = (repository: MasterDataRepository): RequestHandler => {
  return async (_request, response, next): Promise<void> => {
    try {
      const doctors = await repository.listDoctors()
      sendSuccess(response, doctors, 'Daftar dokter tersedia')
    } catch (error) {
      next(error)
    }
  }
}

export const listPolyclinicsHandler = (repository: MasterDataRepository): RequestHandler => {
  return async (_request, response, next): Promise<void> => {
    try {
      const polyclinics = await repository.listPolyclinics()
      sendSuccess(response, polyclinics, 'Daftar poli tersedia')
    } catch (error) {
      next(error)
    }
  }
}

export const listPayersHandler = (repository: MasterDataRepository): RequestHandler => {
  return async (_request, response, next): Promise<void> => {
    try {
      const payers = await repository.listPayers()
      sendSuccess(response, payers, 'Daftar penjamin tersedia')
    } catch (error) {
      next(error)
    }
  }
}

export const searchMedicationsHandler = (repository: MasterDataRepository): RequestHandler => {
  return async (request, response, next): Promise<void> => {
    try {
      const query = medicationSearchQuerySchema.parse(request.query)
      const medications = await repository.searchMedications(query)
      sendSuccess(response, medications, 'Daftar obat tersedia')
    } catch (error) {
      next(error)
    }
  }
}
