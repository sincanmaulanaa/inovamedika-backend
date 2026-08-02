import { randomBytes, randomUUID } from 'node:crypto'

import request, { type Response as SupertestResponse } from 'supertest'
import { describe, expect, it, vi } from 'vitest'

import { createApp } from '../src/app.js'
import { authCookieNames } from '../src/modules/auth/auth.constants.js'
import type { AuthService } from '../src/modules/auth/auth.service.js'
import type { IssuedSession } from '../src/modules/auth/auth.types.js'

const frontendOrigin = 'http://localhost:5173'

const createIssuedSession = (): IssuedSession => {
  return {
    accessToken: randomBytes(48).toString('base64url'),
    accessTokenExpiresInSeconds: 900,
    csrfToken: randomBytes(32).toString('base64url'),
    profile: {
      displayName: 'Petugas Pengujian',
      id: randomUUID(),
      permissions: [],
      role: 'REGISTRATION_OFFICER',
      username: 'registration.test',
    },
    refreshToken: `${randomUUID()}.${randomBytes(48).toString('base64url')}`,
    sessionExpiresAt: new Date(Date.now() + 8 * 60 * 60 * 1_000).toISOString(),
  }
}

const createService = (session: IssuedSession): AuthService => {
  return {
    authenticateAccessToken: vi.fn(async () => ({
      ...session.profile,
      internalSessionId: 2n,
      internalUserId: 1n,
      sessionId: randomUUID(),
    })),
    login: vi.fn(async () => session),
    logout: vi.fn(async () => undefined),
    recordAuthorizationDenied: vi.fn(async () => undefined),
    refresh: vi.fn(async () => createIssuedSession()),
  }
}

const getSetCookies = (response: SupertestResponse): readonly string[] => {
  const header: unknown = response.headers['set-cookie']

  if (Array.isArray(header) && header.every((value) => typeof value === 'string')) {
    return header
  }

  return typeof header === 'string' ? [header] : []
}

const getCookiePair = (cookies: readonly string[], name: string): string => {
  const cookie = cookies.find((value) => value.startsWith(`${name}=`))

  if (!cookie) {
    throw new Error(`Expected ${name} cookie`)
  }

  return cookie.split(';', 1)[0] ?? ''
}

describe('authentication HTTP contract', () => {
  it('returns field-level Indonesian guidance for invalid login data', async () => {
    const service = createService(createIssuedSession())
    const app = createApp({ authenticationService: service, readinessCheck: async () => undefined })

    const response = await request(app).post('/api/v1/login').send({ password: '', username: '' })

    expect(response.status).toBe(422)
    expect(response.body).toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'Beberapa data belum sesuai. Periksa kembali kolom yang ditandai.',
      success: false,
    })
    expect(response.body.errors).toEqual({
      password: ['Kata sandi wajib diisi.'],
      username: ['Nama pengguna wajib diisi.'],
    })
    expect(service.login).not.toHaveBeenCalled()
  })

  it('returns the access token while keeping the refresh credential in an HttpOnly cookie', async () => {
    const session = createIssuedSession()
    const service = createService(session)
    const app = createApp({ authenticationService: service, readinessCheck: async () => undefined })

    const response = await request(app)
      .post('/api/v1/login')
      .set('user-agent', 'Browser test')
      .send({ password: 'valid-password', username: 'registration.test' })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      data: {
        accessToken: session.accessToken,
        csrfToken: session.csrfToken,
        profile: session.profile,
      },
      message: 'Anda telah masuk',
      success: true,
    })
    expect(response.body.data).not.toHaveProperty('refreshToken')

    const cookies = getSetCookies(response)
    const refreshCookie = cookies.find((value) => value.startsWith(`${authCookieNames.refresh}=`))
    const csrfCookie = cookies.find((value) => value.startsWith(`${authCookieNames.csrf}=`))

    expect(refreshCookie).toContain('HttpOnly')
    expect(refreshCookie).toContain('SameSite=Strict')
    expect(refreshCookie).toContain('Path=/api/v1')
    expect(csrfCookie).not.toContain('HttpOnly')
    expect(service.login).toHaveBeenCalledWith(
      expect.objectContaining({
        password: 'valid-password',
        requestId: expect.any(String),
        userAgent: 'Browser test',
        username: 'registration.test',
      }),
    )
  })

  it('rejects refresh requests without a trusted browser origin', async () => {
    const session = createIssuedSession()
    const service = createService(session)
    const app = createApp({ authenticationService: service, readinessCheck: async () => undefined })
    const cookie = `${authCookieNames.refresh}=${session.refreshToken}; ${authCookieNames.csrf}=${session.csrfToken}`

    const response = await request(app)
      .post('/api/v1/refresh')
      .set('cookie', cookie)
      .set('x-csrf-token', session.csrfToken)

    expect(response.status).toBe(403)
    expect(response.body).toMatchObject({
      code: 'REQUEST_ORIGIN_REJECTED',
      message: 'Permintaan ini tidak dapat diproses. Muat ulang halaman lalu coba lagi.',
    })
    expect(service.refresh).not.toHaveBeenCalled()
  })

  it('rejects refresh requests when the CSRF header and cookie do not match', async () => {
    const session = createIssuedSession()
    const service = createService(session)
    const app = createApp({ authenticationService: service, readinessCheck: async () => undefined })
    const cookie = `${authCookieNames.refresh}=${session.refreshToken}; ${authCookieNames.csrf}=${session.csrfToken}`

    const response = await request(app)
      .post('/api/v1/refresh')
      .set('cookie', cookie)
      .set('origin', frontendOrigin)
      .set('x-csrf-token', 'different-token')

    expect(response.status).toBe(403)
    expect(response.body.code).toBe('CSRF_CHECK_FAILED')
    expect(service.refresh).not.toHaveBeenCalled()
  })

  it('rotates refresh cookies and clears them after logout', async () => {
    const session = createIssuedSession()
    const service = createService(session)
    const app = createApp({ authenticationService: service, readinessCheck: async () => undefined })
    const loginResponse = await request(app)
      .post('/api/v1/login')
      .send({ password: 'valid-password', username: 'registration.test' })
    const loginCookies = getSetCookies(loginResponse)
    const cookieHeader = [
      getCookiePair(loginCookies, authCookieNames.refresh),
      getCookiePair(loginCookies, authCookieNames.csrf),
    ]

    const refreshResponse = await request(app)
      .post('/api/v1/refresh')
      .set('Cookie', cookieHeader)
      .set('origin', frontendOrigin)
      .set('x-csrf-token', session.csrfToken)

    expect(refreshResponse.status).toBe(200)
    expect(refreshResponse.body.message).toBe('Sesi tetap aktif')
    expect(service.refresh).toHaveBeenCalledWith(
      expect.objectContaining({ refreshToken: session.refreshToken }),
    )

    const refreshedCookies = getSetCookies(refreshResponse)
    const logoutResponse = await request(app)
      .post('/api/v1/logout')
      .set('Cookie', [
        getCookiePair(refreshedCookies, authCookieNames.refresh),
        getCookiePair(refreshedCookies, authCookieNames.csrf),
      ])
      .set('origin', frontendOrigin)
      .set('x-csrf-token', refreshResponse.body.data.csrfToken)

    expect(logoutResponse.status).toBe(200)
    expect(logoutResponse.body).toEqual({ data: null, message: 'Anda telah keluar', success: true })
    expect(getSetCookies(logoutResponse).every((cookie) => cookie.includes('Expires='))).toBe(true)
    expect(service.logout).toHaveBeenCalledOnce()
  })
})
