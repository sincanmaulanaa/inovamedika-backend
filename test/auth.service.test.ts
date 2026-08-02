import { randomUUID } from 'node:crypto'

import { argon2id, hash } from 'argon2'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import type {
  AuthRepository,
  CreateSessionResult,
  RotateSessionResult,
  ValidateAccessSessionResult,
} from '../src/modules/auth/auth.repository.js'
import { createAuthService } from '../src/modules/auth/auth.service.js'
import type { AuthUserRecord, SessionUserRecord } from '../src/modules/auth/auth.types.js'

const now = new Date()
const userPublicId = randomUUID()
const sessionPublicId = randomUUID()
const password = 'correct-password-for-tests'
let passwordHash: string

const session: SessionUserRecord = {
  displayName: 'Petugas Pengujian',
  permissions: ['AUDIT_READ'],
  role: 'ADMINISTRATOR',
  sessionId: 21n,
  sessionPublicId,
  userId: 12n,
  userPublicId,
  username: 'test.user',
}

const createUser = (overrides: Partial<AuthUserRecord> = {}): AuthUserRecord => {
  return {
    displayName: session.displayName,
    failedLoginAttempts: 0,
    id: session.userId,
    isActive: true,
    lockedUntil: null,
    passwordHash,
    publicId: session.userPublicId,
    role: session.role,
    username: session.username,
    ...overrides,
  }
}

const createRepository = (overrides: Partial<AuthRepository> = {}): AuthRepository => {
  const repository: AuthRepository = {
    createSessionReplacingActive: vi.fn(async (): Promise<CreateSessionResult> => ({
      status: 'CREATED',
      session,
    })),
    findUserForLogin: vi.fn(async () => createUser()),
    recordAuthorizationDenied: vi.fn(async () => undefined),
    recordDeniedLogin: vi.fn(async () => undefined),
    revokeSession: vi.fn(async () => undefined),
    rotateSession: vi.fn(async (): Promise<RotateSessionResult> => ({
      expiresAt: new Date(now.getTime() + 8 * 60 * 60 * 1_000),
      session,
      status: 'ROTATED',
    })),
    validateAccessSession: vi.fn(async (): Promise<ValidateAccessSessionResult> => ({
      status: 'ACTIVE',
      session,
    })),
    ...overrides,
  }

  return repository
}

const loginInput = {
  ipAddress: '127.0.0.1',
  password,
  requestId: 'auth-service-test',
  userAgent: 'Vitest',
  username: ' Test.User ',
} as const

beforeAll(async () => {
  passwordHash = await hash(password, {
    memoryCost: 19_456,
    parallelism: 1,
    timeCost: 2,
    type: argon2id,
  })
})

describe('authentication service', () => {
  it('creates a session without passing the password to persistence', async () => {
    const repository = createRepository()
    const service = createAuthService({ clock: () => now, repository })

    const result = await service.login(loginInput)

    expect(result.profile).toEqual({
      displayName: session.displayName,
      id: session.userPublicId,
      permissions: session.permissions,
      role: session.role,
      username: session.username,
    })
    expect(result.accessTokenExpiresInSeconds).toBe(900)
    expect(result.refreshToken).not.toBe(result.accessToken)
    expect(result.csrfToken).not.toBe(result.refreshToken)
    expect(repository.findUserForLogin).toHaveBeenCalledWith('test.user')

    const persistedInput = vi.mocked(repository.createSessionReplacingActive).mock.calls[0]?.[0]
    expect(persistedInput).not.toHaveProperty('password')
    expect(persistedInput).not.toHaveProperty('username')
    expect(persistedInput?.refreshTokenHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('uses the same safe response when the username does not exist', async () => {
    const repository = createRepository({ findUserForLogin: vi.fn(async () => null) })
    const service = createAuthService({ clock: () => now, repository })

    await expect(service.login(loginInput)).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
      httpStatus: 401,
      message: 'Nama pengguna atau kata sandi belum tepat. Periksa kembali lalu coba lagi.',
    })

    const auditInput = vi.mocked(repository.recordDeniedLogin).mock.calls[0]?.[0]
    expect(auditInput).not.toHaveProperty('password')
    expect(auditInput).not.toHaveProperty('username')
    expect(auditInput).toMatchObject({
      reason: 'INVALID_CREDENTIALS',
      shouldIncrementFailure: false,
    })
  })

  it('counts a failed password attempt without exposing account details', async () => {
    const repository = createRepository()
    const service = createAuthService({ clock: () => now, repository })

    await expect(
      service.login({ ...loginInput, password: 'incorrect-password' }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS', httpStatus: 401 })

    expect(repository.recordDeniedLogin).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'INVALID_CREDENTIALS',
        shouldIncrementFailure: true,
        userId: session.userId,
      }),
    )
  })

  it('returns actionable guidance for a correctly authenticated locked account', async () => {
    const repository = createRepository({
      findUserForLogin: vi.fn(async () =>
        createUser({ lockedUntil: new Date(now.getTime() + 60_000) }),
      ),
    })
    const service = createAuthService({ clock: () => now, repository })

    await expect(service.login(loginInput)).rejects.toMatchObject({
      code: 'ACCOUNT_LOCKED',
      httpStatus: 429,
      message: 'Terlalu banyak percobaan masuk. Tunggu beberapa menit lalu coba lagi.',
    })
    expect(repository.createSessionReplacingActive).not.toHaveBeenCalled()
  })

  it('rotates the refresh credential without passing its raw value to persistence', async () => {
    const repository = createRepository()
    const service = createAuthService({ clock: () => now, repository })
    const loginResult = await service.login(loginInput)

    const refreshResult = await service.refresh({
      ipAddress: loginInput.ipAddress,
      refreshToken: loginResult.refreshToken,
      requestId: 'refresh-test',
      userAgent: loginInput.userAgent,
    })

    expect(refreshResult.refreshToken).not.toBe(loginResult.refreshToken)
    const rotationInput = vi.mocked(repository.rotateSession).mock.calls[0]?.[0]
    expect(rotationInput).not.toHaveProperty('refreshToken')
    expect(rotationInput?.newRefreshTokenHash).toMatch(/^[0-9a-f]{64}$/)
    expect(rotationInput?.presentedRefreshTokenHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('validates the database session and respects non-activity requests', async () => {
    const repository = createRepository()
    const service = createAuthService({ clock: () => now, repository })
    const loginResult = await service.login(loginInput)

    const principal = await service.authenticateAccessToken({
      accessToken: loginResult.accessToken,
      countsAsActivity: false,
      metadata: {
        ipAddress: loginInput.ipAddress,
        requestId: 'access-test',
        userAgent: loginInput.userAgent,
      },
    })

    expect(principal.sessionId).toBe(session.sessionPublicId)
    expect(repository.validateAccessSession).toHaveBeenCalledWith(
      expect.objectContaining({ countsAsActivity: false, sessionPublicId }),
    )
  })

  it('rejects an access token when its role no longer matches the database', async () => {
    const repository = createRepository({
      validateAccessSession: vi.fn(async (): Promise<ValidateAccessSessionResult> => ({
        session: { ...session, role: 'DOCTOR' },
        status: 'ACTIVE',
      })),
    })
    const service = createAuthService({ clock: () => now, repository })
    const loginResult = await service.login(loginInput)

    await expect(
      service.authenticateAccessToken({
        accessToken: loginResult.accessToken,
        countsAsActivity: true,
        metadata: { requestId: 'role-change-test' },
      }),
    ).rejects.toMatchObject({ code: 'SESSION_EXPIRED', httpStatus: 401 })
  })

  it('records authorization denial using identifiers instead of clinical data', async () => {
    const repository = createRepository()
    const service = createAuthService({ clock: () => now, repository })
    const principal = {
      ...session,
      id: session.userPublicId,
      internalSessionId: session.sessionId,
      internalUserId: session.userId,
      permissions: session.permissions,
      role: 'ADMINISTRATOR' as const,
      sessionId: session.sessionPublicId,
    }

    await service.recordAuthorizationDenied({
      metadata: { requestId: 'forbidden-test' },
      principal,
      reason: 'ROLE_NOT_ALLOWED',
    })

    expect(repository.recordAuthorizationDenied).toHaveBeenCalledWith({
      principal,
      reason: 'ROLE_NOT_ALLOWED',
      requestId: 'forbidden-test',
    })
  })
})
