import { argon2id, hash, verify } from 'argon2'
import { z } from 'zod'

import { DomainError } from '../../http/domain-error.js'
import { authPolicy, userRoles, type UserRole } from './auth.constants.js'
import { authRepository, type AuthRepository } from './auth.repository.js'
import {
  createAccessToken,
  createCsrfToken,
  createRefreshCredential,
  parseRefreshToken,
  verifyAccessToken,
} from './auth.token.js'
import type {
  AccessTokenInput,
  AuthProfile,
  AuthRequestMetadata,
  AuthenticatedPrincipal,
  IssuedSession,
  LoginInput,
  LogoutInput,
  RefreshInput,
  SessionUserRecord,
} from './auth.types.js'

const userRoleSchema = z.enum(userRoles)

export interface AuthService {
  readonly authenticateAccessToken: (input: AccessTokenInput) => Promise<AuthenticatedPrincipal>
  readonly login: (input: LoginInput) => Promise<IssuedSession>
  readonly logout: (input: LogoutInput) => Promise<void>
  readonly recordAuthorizationDenied: (input: {
    readonly metadata: AuthRequestMetadata
    readonly principal: AuthenticatedPrincipal
    readonly reason: string
  }) => Promise<void>
  readonly refresh: (input: RefreshInput) => Promise<IssuedSession>
}

interface AuthServiceDependencies {
  readonly clock?: () => Date
  readonly repository?: AuthRepository
}

const invalidCredentialsError = (): DomainError => {
  return new DomainError(
    'INVALID_CREDENTIALS',
    401,
    'Nama pengguna atau kata sandi belum tepat. Periksa kembali lalu coba lagi.',
  )
}

const sessionExpiredError = (): DomainError => {
  return new DomainError('SESSION_EXPIRED', 401, 'Sesi Anda telah berakhir. Silakan masuk kembali.')
}

const parseRole = (role: string): UserRole => {
  const parsedRole = userRoleSchema.safeParse(role)

  if (!parsedRole.success) {
    throw new Error('Stored user role is not supported')
  }

  return parsedRole.data
}

const createProfile = (session: SessionUserRecord): AuthProfile => {
  return {
    displayName: session.displayName,
    id: session.userPublicId,
    permissions: session.permissions,
    role: parseRole(session.role),
    username: session.username,
  }
}

const createPrincipal = (session: SessionUserRecord): AuthenticatedPrincipal => {
  return {
    ...createProfile(session),
    internalSessionId: session.sessionId,
    internalUserId: session.userId,
    sessionId: session.sessionPublicId,
  }
}

const pickMetadata = (input: AuthRequestMetadata): AuthRequestMetadata => {
  return {
    ipAddress: input.ipAddress,
    requestId: input.requestId,
    userAgent: input.userAgent,
  }
}

const performDummyPasswordWork = async (password: string): Promise<void> => {
  await hash(password, {
    memoryCost: 19_456,
    parallelism: 1,
    timeCost: 2,
    type: argon2id,
  })
}

const issueSession = async ({
  absoluteExpiresAt,
  now,
  refreshToken,
  session,
}: {
  readonly absoluteExpiresAt: Date
  readonly now: Date
  readonly refreshToken: string
  readonly session: SessionUserRecord
}): Promise<IssuedSession> => {
  const profile = createProfile(session)

  return {
    accessToken: await createAccessToken({
      now,
      role: profile.role,
      sessionPublicId: session.sessionPublicId,
      userPublicId: session.userPublicId,
    }),
    accessTokenExpiresInSeconds: authPolicy.accessTokenTtlSeconds,
    csrfToken: createCsrfToken(),
    profile,
    refreshToken,
    sessionExpiresAt: absoluteExpiresAt.toISOString(),
  }
}

export const createAuthService = ({
  clock = () => new Date(),
  repository = authRepository,
}: AuthServiceDependencies = {}): AuthService => {
  return {
    login: async (input) => {
      const now = clock()
      const username = input.username.trim().toLowerCase()
      const user = await repository.findUserForLogin(username)

      if (!user) {
        await performDummyPasswordWork(input.password)
        await repository.recordDeniedLogin({
          ...pickMetadata(input),
          now,
          reason: 'INVALID_CREDENTIALS',
          shouldIncrementFailure: false,
        })
        throw invalidCredentialsError()
      }

      const isPasswordValid = await verify(user.passwordHash, input.password)

      if (!isPasswordValid) {
        await repository.recordDeniedLogin({
          ...pickMetadata(input),
          now,
          reason: 'INVALID_CREDENTIALS',
          shouldIncrementFailure: true,
          userId: user.id,
        })
        throw invalidCredentialsError()
      }

      if (!user.isActive) {
        await repository.recordDeniedLogin({
          ...pickMetadata(input),
          now,
          reason: 'ACCOUNT_INACTIVE',
          shouldIncrementFailure: false,
          userId: user.id,
        })
        throw new DomainError(
          'ACCOUNT_INACTIVE',
          403,
          'Akun ini belum dapat digunakan. Hubungi administrator klinik.',
        )
      }

      if (user.lockedUntil !== null && user.lockedUntil > now) {
        await repository.recordDeniedLogin({
          ...pickMetadata(input),
          now,
          reason: 'ACCOUNT_LOCKED',
          shouldIncrementFailure: false,
          userId: user.id,
        })
        throw new DomainError(
          'ACCOUNT_LOCKED',
          429,
          'Terlalu banyak percobaan masuk. Tunggu beberapa menit lalu coba lagi.',
        )
      }

      const refreshCredential = createRefreshCredential()
      const absoluteExpiresAt = new Date(now.getTime() + authPolicy.absoluteSessionTtlMs)
      const sessionResult = await repository.createSessionReplacingActive({
        ...pickMetadata(input),
        absoluteExpiresAt,
        expectedPasswordHash: user.passwordHash,
        idleExpiresAt: new Date(now.getTime() + authPolicy.idleSessionTtlMs),
        now,
        refreshTokenHash: refreshCredential.hash,
        sessionPublicId: refreshCredential.sessionPublicId,
        userId: user.id,
      })

      if (sessionResult.status === 'ACCOUNT_INACTIVE') {
        throw new DomainError(
          'ACCOUNT_INACTIVE',
          403,
          'Akun ini belum dapat digunakan. Hubungi administrator klinik.',
        )
      }

      if (sessionResult.status === 'ACCOUNT_LOCKED') {
        throw new DomainError(
          'ACCOUNT_LOCKED',
          429,
          'Terlalu banyak percobaan masuk. Tunggu beberapa menit lalu coba lagi.',
        )
      }

      if (sessionResult.status === 'CREDENTIALS_CHANGED') {
        throw invalidCredentialsError()
      }

      if (sessionResult.status !== 'CREATED') {
        throw new Error('Session creation returned an unsupported status')
      }

      return issueSession({
        absoluteExpiresAt,
        now,
        refreshToken: refreshCredential.rawToken,
        session: sessionResult.session,
      })
    },

    refresh: async (input) => {
      const currentCredential = parseRefreshToken(input.refreshToken)

      if (!currentCredential) {
        throw sessionExpiredError()
      }

      const now = clock()
      const nextCredential = createRefreshCredential(currentCredential.sessionPublicId)
      const result = await repository.rotateSession({
        ...pickMetadata(input),
        newRefreshTokenHash: nextCredential.hash,
        now,
        presentedRefreshTokenHash: currentCredential.hash,
        sessionPublicId: currentCredential.sessionPublicId,
      })

      if (result.status !== 'ROTATED') {
        throw sessionExpiredError()
      }

      return issueSession({
        absoluteExpiresAt: result.expiresAt,
        now,
        refreshToken: nextCredential.rawToken,
        session: result.session,
      })
    },

    logout: async (input) => {
      if (!input.refreshToken) {
        return
      }

      const credential = parseRefreshToken(input.refreshToken)

      if (!credential) {
        return
      }

      await repository.revokeSession({
        ...pickMetadata(input),
        now: clock(),
        presentedRefreshTokenHash: credential.hash,
        sessionPublicId: credential.sessionPublicId,
      })
    },

    authenticateAccessToken: async (input) => {
      let claims

      try {
        claims = await verifyAccessToken(input.accessToken)
      } catch {
        throw sessionExpiredError()
      }

      const result = await repository.validateAccessSession({
        ...input.metadata,
        countsAsActivity: input.countsAsActivity,
        now: clock(),
        sessionPublicId: claims.sessionPublicId,
      })

      if (result.status !== 'ACTIVE') {
        throw sessionExpiredError()
      }

      const principal = createPrincipal(result.session)

      if (principal.id !== claims.userPublicId || principal.role !== claims.role) {
        throw sessionExpiredError()
      }

      return principal
    },

    recordAuthorizationDenied: async ({ metadata, principal, reason }) => {
      await repository.recordAuthorizationDenied({ ...metadata, principal, reason })
    },
  }
}

export const authService = createAuthService()
