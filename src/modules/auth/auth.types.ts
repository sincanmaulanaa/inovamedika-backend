import type { UserRole } from './auth.constants.js'

export interface AuthRequestMetadata {
  readonly ipAddress?: string | undefined
  readonly requestId: string
  readonly userAgent?: string | undefined
}

export interface AuthUserRecord {
  readonly displayName: string
  readonly failedLoginAttempts: number
  readonly id: bigint
  readonly isActive: boolean
  readonly lockedUntil: Date | null
  readonly passwordHash: string
  readonly publicId: string
  readonly role: string
  readonly username: string
}

export interface AuthProfile {
  readonly displayName: string
  readonly id: string
  readonly permissions: readonly string[]
  readonly role: UserRole
  readonly username: string
}

export interface AuthenticatedPrincipal extends AuthProfile {
  readonly internalSessionId: bigint
  readonly internalUserId: bigint
  readonly sessionId: string
}

export interface SessionUserRecord {
  readonly displayName: string
  readonly permissions: readonly string[]
  readonly role: string
  readonly sessionId: bigint
  readonly sessionPublicId: string
  readonly userId: bigint
  readonly userPublicId: string
  readonly username: string
}

export interface IssuedSession {
  readonly accessToken: string
  readonly accessTokenExpiresInSeconds: number
  readonly csrfToken: string
  readonly profile: AuthProfile
  readonly refreshToken: string
  readonly sessionExpiresAt: string
}

export interface PublicSessionResponse {
  readonly accessToken: string
  readonly accessTokenExpiresInSeconds: number
  readonly csrfToken: string
  readonly profile: AuthProfile
  readonly sessionExpiresAt: string
}

export interface LoginInput extends AuthRequestMetadata {
  readonly password: string
  readonly username: string
}

export interface RefreshInput extends AuthRequestMetadata {
  readonly refreshToken: string
}

export interface LogoutInput extends AuthRequestMetadata {
  readonly refreshToken?: string | undefined
}

export interface AccessTokenInput {
  readonly accessToken: string
  readonly countsAsActivity: boolean
  readonly metadata: AuthRequestMetadata
}

export interface AccessTokenClaims {
  readonly expiresAt: number
  readonly issuedAt: number
  readonly role: UserRole
  readonly sessionPublicId: string
  readonly userPublicId: string
}
