import { createHash, randomBytes, randomUUID } from 'node:crypto'

import { jwtVerify, SignJWT } from 'jose'
import { z } from 'zod'

import { env } from '../../config/env.js'
import { authPolicy, userRoles, type UserRole } from './auth.constants.js'
import type { AccessTokenClaims } from './auth.types.js'

const accessTokenPayloadSchema = z.object({
  exp: z.number().int().positive(),
  iat: z.number().int().nonnegative(),
  role: z.enum(userRoles),
  sessionId: z.uuid(),
  sub: z.uuid(),
})
const refreshTokenSchema = z.tuple([z.uuid(), z.string().regex(/^[A-Za-z0-9_-]{64}$/)])
const signingKey = new TextEncoder().encode(env.jwtAccessSecret)

interface CreateAccessTokenInput {
  readonly now: Date
  readonly role: UserRole
  readonly sessionPublicId: string
  readonly userPublicId: string
}

interface RefreshCredential {
  readonly hash: string
  readonly rawToken: string
  readonly sessionPublicId: string
}

export const createAccessToken = async ({
  now,
  role,
  sessionPublicId,
  userPublicId,
}: CreateAccessTokenInput): Promise<string> => {
  const issuedAt = Math.floor(now.getTime() / 1_000)

  return new SignJWT({ role, sessionId: sessionPublicId })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(userPublicId)
    .setIssuer(env.jwtIssuer)
    .setAudience(env.jwtAudience)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + authPolicy.accessTokenTtlSeconds)
    .sign(signingKey)
}

export const verifyAccessToken = async (accessToken: string): Promise<AccessTokenClaims> => {
  const verification = await jwtVerify(accessToken, signingKey, {
    algorithms: ['HS256'],
    audience: env.jwtAudience,
    issuer: env.jwtIssuer,
  })
  const payload = accessTokenPayloadSchema.parse(verification.payload)

  return {
    expiresAt: payload.exp,
    issuedAt: payload.iat,
    role: payload.role,
    sessionPublicId: payload.sessionId,
    userPublicId: payload.sub,
  }
}

export const createRefreshCredential = (
  sessionPublicId: string = randomUUID(),
): RefreshCredential => {
  const secret = randomBytes(48).toString('base64url')
  const rawToken = `${sessionPublicId}.${secret}`

  return {
    hash: hashRefreshToken(rawToken),
    rawToken,
    sessionPublicId,
  }
}

export const parseRefreshToken = (rawToken: string): RefreshCredential | null => {
  const parsedToken = refreshTokenSchema.safeParse(rawToken.split('.'))

  if (!parsedToken.success) {
    return null
  }

  return {
    hash: hashRefreshToken(rawToken),
    rawToken,
    sessionPublicId: parsedToken.data[0],
  }
}

export const createCsrfToken = (): string => randomBytes(32).toString('base64url')

const hashRefreshToken = (rawToken: string): string => {
  return createHash('sha256').update(rawToken).digest('hex')
}
