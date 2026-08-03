import type { RequestHandler } from 'express'
import { sendSuccess } from '../../http/response.js'
import type { DashboardRepository } from './dashboard.repository.js'

export const getDashboardSummaryHandler = (repository: DashboardRepository): RequestHandler => {
  return async (request, response, next): Promise<void> => {
    try {
      const dateString =
        typeof request.query.date === 'string'
          ? request.query.date
          : new Date().toISOString().slice(0, 10)
      const date = new Date(`${dateString}T00:00:00.000Z`)
      const metrics = await repository.getDashboardSummary(date)
      sendSuccess(response, metrics, 'Ringkasan dashboard berhasil dimuat')
    } catch (error) {
      next(error)
    }
  }
}
