import request, { type Response as SupertestResponse } from 'supertest'
import { describe, expect, it } from 'vitest'

import { createApp } from '../src/app.js'
import { prisma } from '../src/db/prisma.js'
import { authCookieNames } from '../src/modules/auth/auth.constants.js'
import { authService } from '../src/modules/auth/auth.service.js'
import { verifyAccessToken } from '../src/modules/auth/auth.token.js'

const frontendOrigin = 'http://localhost:5173'

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

const getDemoPassword = (): string => {
  const password = process.env.DEMO_USER_PASSWORD

  if (!password) {
    throw new Error('DEMO_USER_PASSWORD is required for database authentication tests')
  }

  return password
}

const login = async (app: ReturnType<typeof createApp>): Promise<SupertestResponse> => {
  return request(app)
    .post('/api/v1/login')
    .set('x-request-id', 'database-login-test')
    .send({ password: getDemoPassword(), username: 'admin' })
}

const authenticate = async (accessToken: string, requestId: string): Promise<void> => {
  await authService.authenticateAccessToken({
    accessToken,
    countsAsActivity: true,
    metadata: { requestId },
  })
}

describe
  .runIf(process.env.DATABASE_TESTS === '1')
  .sequential('database authentication flow', () => {
    it('rotates credentials, detects replay, enforces one session, and revokes on account changes', async () => {
      const app = createApp()
      const firstLogin = await login(app)

      expect(firstLogin.status).toBe(200)
      const firstAccessToken: string = firstLogin.body.data.accessToken
      const firstCsrfToken: string = firstLogin.body.data.csrfToken
      const firstCookies = getSetCookies(firstLogin)
      const firstCookieHeader = [
        getCookiePair(firstCookies, authCookieNames.refresh),
        getCookiePair(firstCookies, authCookieNames.csrf),
      ].join('; ')

      const refreshResponse = await request(app)
        .post('/api/v1/refresh')
        .set('cookie', firstCookieHeader)
        .set('origin', frontendOrigin)
        .set('x-csrf-token', firstCsrfToken)

      expect(refreshResponse.status).toBe(200)
      const refreshedAccessToken: string = refreshResponse.body.data.accessToken
      await authenticate(refreshedAccessToken, 'refreshed-access-test')

      const replayResponse = await request(app)
        .post('/api/v1/refresh')
        .set('cookie', firstCookieHeader)
        .set('origin', frontendOrigin)
        .set('x-csrf-token', firstCsrfToken)

      expect(replayResponse.status).toBe(401)
      expect(replayResponse.body.code).toBe('SESSION_EXPIRED')
      await expect(
        authenticate(refreshedAccessToken, 'replayed-session-test'),
      ).rejects.toMatchObject({
        code: 'SESSION_EXPIRED',
      })

      const secondLogin = await login(app)
      const secondAccessToken: string = secondLogin.body.data.accessToken
      await expect(authenticate(firstAccessToken, 'replaced-session-test')).rejects.toMatchObject({
        code: 'SESSION_EXPIRED',
      })
      await authenticate(secondAccessToken, 'second-session-test')

      const secondClaims = await verifyAccessToken(secondAccessToken)
      const expiryTestTime = new Date()
      await prisma.sessions.update({
        data: {
          idle_expires_at: new Date(expiryTestTime.getTime() - 1_000),
          last_activity_at: new Date(expiryTestTime.getTime() - 20 * 60 * 1_000),
        },
        where: { public_id: secondClaims.sessionPublicId },
      })
      await expect(authenticate(secondAccessToken, 'idle-timeout-test')).rejects.toMatchObject({
        code: 'SESSION_EXPIRED',
      })

      const accountChangeLogin = await login(app)
      const accountChangeAccessToken: string = accountChangeLogin.body.data.accessToken
      await prisma.users.update({ data: { is_active: false }, where: { username: 'admin' } })
      await expect(
        authenticate(accountChangeAccessToken, 'inactive-account-test'),
      ).rejects.toMatchObject({ code: 'SESSION_EXPIRED' })
      await prisma.users.update({ data: { is_active: true }, where: { username: 'admin' } })

      const finalLogin = await login(app)
      const finalAccessToken: string = finalLogin.body.data.accessToken
      const finalCsrfToken: string = finalLogin.body.data.csrfToken
      const finalCookies = getSetCookies(finalLogin)

      const logoutResponse = await request(app)
        .post('/api/v1/logout')
        .set(
          'cookie',
          [
            getCookiePair(finalCookies, authCookieNames.refresh),
            getCookiePair(finalCookies, authCookieNames.csrf),
          ].join('; '),
        )
        .set('origin', frontendOrigin)
        .set('x-csrf-token', finalCsrfToken)

      expect(logoutResponse.status).toBe(200)
      await expect(authenticate(finalAccessToken, 'logged-out-session-test')).rejects.toMatchObject(
        {
          code: 'SESSION_EXPIRED',
        },
      )
    })
  })
