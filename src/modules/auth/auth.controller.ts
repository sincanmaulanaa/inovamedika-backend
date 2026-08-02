import type { CookieOptions, RequestHandler } from 'express'
import { z } from 'zod'

import { env } from '../../config/env.js'
import { DomainError } from '../../http/domain-error.js'
import { sendSuccess } from '../../http/response.js'
import { authCookieNames } from './auth.constants.js'
import { getAuthRequestMetadata, getRefreshCookie } from './auth.middleware.js'
import type { AuthService } from './auth.service.js'
import type { IssuedSession, PublicSessionResponse } from './auth.types.js'

const loginSchema = z.object({
  password: z
    .string({ error: 'Kata sandi wajib diisi.' })
    .min(1, 'Kata sandi wajib diisi.')
    .max(128, 'Kata sandi tidak dapat melebihi 128 karakter.'),
  username: z
    .string({ error: 'Nama pengguna wajib diisi.' })
    .trim()
    .min(1, 'Nama pengguna wajib diisi.')
    .max(64, 'Nama pengguna tidak dapat melebihi 64 karakter.'),
})

const sharedCookieOptions: CookieOptions = {
  sameSite: 'strict',
  secure: env.nodeEnv === 'production',
}

const refreshCookieOptions: CookieOptions = {
  ...sharedCookieOptions,
  httpOnly: true,
  path: '/api/v1',
}

const csrfCookieOptions: CookieOptions = {
  ...sharedCookieOptions,
  httpOnly: false,
  path: '/',
}

const clearAuthCookies = (response: Parameters<RequestHandler>[1]): void => {
  response.clearCookie(authCookieNames.refresh, refreshCookieOptions)
  response.clearCookie(authCookieNames.csrf, csrfCookieOptions)
}

const setAuthCookies = (response: Parameters<RequestHandler>[1], session: IssuedSession): void => {
  const expires = new Date(session.sessionExpiresAt)

  response.cookie(authCookieNames.refresh, session.refreshToken, {
    ...refreshCookieOptions,
    expires,
  })
  response.cookie(authCookieNames.csrf, session.csrfToken, {
    ...csrfCookieOptions,
    expires,
  })
}

const toPublicResponse = (session: IssuedSession): PublicSessionResponse => {
  return {
    accessToken: session.accessToken,
    accessTokenExpiresInSeconds: session.accessTokenExpiresInSeconds,
    csrfToken: session.csrfToken,
    profile: session.profile,
    sessionExpiresAt: session.sessionExpiresAt,
  }
}

export const createLoginHandler = (service: AuthService): RequestHandler => {
  return async (request, response, next): Promise<void> => {
    try {
      const credentials = loginSchema.parse(request.body)
      const session = await service.login({ ...credentials, ...getAuthRequestMetadata(request) })

      setAuthCookies(response, session)
      sendSuccess(response, toPublicResponse(session), 'Anda telah masuk')
    } catch (error) {
      next(error)
    }
  }
}

export const createRefreshHandler = (service: AuthService): RequestHandler => {
  return async (request, response, next): Promise<void> => {
    const refreshToken = getRefreshCookie(request)

    if (!refreshToken) {
      clearAuthCookies(response)
      next(
        new DomainError('SESSION_EXPIRED', 401, 'Sesi Anda telah berakhir. Silakan masuk kembali.'),
      )
      return
    }

    try {
      const session = await service.refresh({ refreshToken, ...getAuthRequestMetadata(request) })

      setAuthCookies(response, session)
      sendSuccess(response, toPublicResponse(session), 'Sesi tetap aktif')
    } catch (error) {
      if (error instanceof DomainError && error.code === 'SESSION_EXPIRED') {
        clearAuthCookies(response)
      }

      next(error)
    }
  }
}

export const createLogoutHandler = (service: AuthService): RequestHandler => {
  return async (request, response, next): Promise<void> => {
    try {
      await service.logout({
        ...getAuthRequestMetadata(request),
        refreshToken: getRefreshCookie(request),
      })
      clearAuthCookies(response)
      sendSuccess(response, null, 'Anda telah keluar')
    } catch (error) {
      next(error)
    }
  }
}
