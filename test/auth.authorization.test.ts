import { randomUUID } from 'node:crypto'

import express from 'express'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'

import { errorHandler } from '../src/http/error-handler.js'
import { requestContextMiddleware } from '../src/http/request-context.js'
import {
  createAuthenticationMiddleware,
  createPermissionAuthorizationMiddleware,
  createRoleAuthorizationMiddleware,
} from '../src/modules/auth/auth.middleware.js'
import type { AuthService } from '../src/modules/auth/auth.service.js'
import type { AuthenticatedPrincipal } from '../src/modules/auth/auth.types.js'

const createPrincipal = (
  overrides: Partial<AuthenticatedPrincipal> = {},
): AuthenticatedPrincipal => {
  return {
    displayName: 'Petugas Pengujian',
    id: randomUUID(),
    internalSessionId: 2n,
    internalUserId: 1n,
    permissions: [],
    role: 'REGISTRATION_OFFICER',
    sessionId: randomUUID(),
    username: 'registration.test',
    ...overrides,
  }
}

const createService = (principal: AuthenticatedPrincipal): AuthService => {
  return {
    authenticateAccessToken: vi.fn(async () => principal),
    login: vi.fn(async () => {
      throw new Error('Not used in authorization tests')
    }),
    logout: vi.fn(async () => undefined),
    recordAuthorizationDenied: vi.fn(async () => undefined),
    refresh: vi.fn(async () => {
      throw new Error('Not used in authorization tests')
    }),
  }
}

describe('authorization middleware', () => {
  it('denies an unsupported role and records the decision', async () => {
    const service = createService(createPrincipal())
    const app = express()

    app.use(requestContextMiddleware)
    app.get(
      '/doctor-only',
      createAuthenticationMiddleware(service),
      createRoleAuthorizationMiddleware(service, ['DOCTOR']),
      (_request, response) => response.json({ allowed: true }),
    )
    app.use(errorHandler)

    const response = await request(app)
      .get('/doctor-only')
      .set('authorization', 'Bearer test-access-token')
      .set('x-request-id', 'role-denied-test')

    expect(response.status).toBe(403)
    expect(response.body).toEqual({
      code: 'FORBIDDEN',
      message: 'Tindakan ini tidak tersedia untuk akun yang sedang digunakan.',
      requestId: 'role-denied-test',
      success: false,
    })
    expect(service.recordAuthorizationDenied).toHaveBeenCalledWith({
      metadata: expect.objectContaining({ requestId: 'role-denied-test' }),
      principal: expect.objectContaining({ role: 'REGISTRATION_OFFICER' }),
      reason: 'ROLE_NOT_ALLOWED',
    })
  })

  it('allows an authenticated user with the required permission', async () => {
    const service = createService(createPrincipal({ permissions: ['AUDIT_READ'] }))
    const app = express()

    app.use(requestContextMiddleware)
    app.get(
      '/audit',
      createAuthenticationMiddleware(service, { countsAsActivity: false }),
      createPermissionAuthorizationMiddleware(service, ['AUDIT_READ']),
      (_request, response) => response.json({ allowed: true }),
    )
    app.use(errorHandler)

    const response = await request(app)
      .get('/audit')
      .set('authorization', 'Bearer test-access-token')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ allowed: true })
    expect(service.authenticateAccessToken).toHaveBeenCalledWith(
      expect.objectContaining({ countsAsActivity: false }),
    )
    expect(service.recordAuthorizationDenied).not.toHaveBeenCalled()
  })
})
