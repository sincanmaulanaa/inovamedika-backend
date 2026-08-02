import type { Response } from 'express'

interface SuccessResponse<Data> {
  success: true
  message: string
  data: Data
}

export const sendSuccess = <Data>(
  response: Response,
  data: Data,
  message = 'Permintaan selesai',
): Response<SuccessResponse<Data>> => {
  return response.json({ success: true, message, data })
}
