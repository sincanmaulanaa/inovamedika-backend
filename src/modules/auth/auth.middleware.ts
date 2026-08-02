import { timingSafeEqual } from 'node:crypto'

import type { NextFunction, Request, RequestHandler } from 'express'

import { DomainError } from '../../http/domain-error.js'
import { getRequestId } from '../../http/request-context.js'
import { authCookieNames, type UserRole } from './auth.constants.js'
import type { AuthService } from './auth.service.js'
import type { AuthRequestMetadata } from './auth.types.js'

const invalidRequestMessage =
  'Permintaan ini tidak dapat diproses. Muat ulang halaman lalu coba lagi.'

const getCookieValue = (request: Request, name: string): string | undefined => {
  const cookies: unknown = request.cookies

  if (typeof cookies !== 'object' || cookies === null || !Object.hasOwn(cookies, name)) {
    return undefined
  }

  const value = (cookies as Readonly<Record<string, unknown>>)[name]
  return typeof value === 'string' ? value : undefined
}

const hasEqualValue = (firstValue: string, secondValue: string): boolean => {
  const first = Buffer.from(firstValue)
  const second = Buffer.from(secondValue)

  return first.length === second.length && timingSafeEqual(first, second)
}

const sanitizeUserAgent = (userAgent: string | undefined): string | undefined => {
  const sanitizedUserAgent = Array.from(userAgent ?? '')
    .filter((character) => {
      const characterCode = character.charCodeAt(0)
      return characterCode >= 32 && characterCode !== 127
    })
    .join('')
    .slice(0, 512)

  return sanitizedUserAgent || undefined
}

export const getAuthRequestMetadata = (request: Request): AuthRequestMetadata => {
  return {
    ipAddress: request.ip,
    requestId: getRequestId(),
    userAgent: sanitizeUserAgent(request.get('user-agent')),
  }
}

export const getRefreshCookie = (request: Request): string | undefined => {
  return getCookieValue(request, authCookieNames.refresh)
}

export const createTrustedOriginMiddleware = (
  allowedOrigins: readonly string[],
): RequestHandler => {
  const allowlist = new Set(allowedOrigins)

  return (request, _response, next): void => {
    const origin = request.get('origin')

    if (!origin || !allowlist.has(origin)) {
      next(new DomainError('REQUEST_ORIGIN_REJECTED', 403, invalidRequestMessage))
      return
    }

    next()
  }
}

export const csrfProtectionMiddleware: RequestHandler = (request, _response, next) => {
  const cookieToken = getCookieValue(request, authCookieNames.csrf)
  const headerToken = request.get('x-csrf-token')

  if (!cookieToken || !headerToken || !hasEqualValue(cookieToken, headerToken)) {
    next(new DomainError('CSRF_CHECK_FAILED', 403, invalidRequestMessage))
    return
  }

  next()
}

export const createAuthenticationMiddleware = (
  service: AuthService,
  { countsAsActivity = true }: { readonly countsAsActivity?: boolean } = {},
): RequestHandler => {
  return async (request, _response, next): Promise<void> => {
    const authorization = request.get('authorization')
    const match = authorization?.match(/^Bearer ([^\s]+)$/)

    if (!match?.[1]) {
      next(
        new DomainError('SESSION_EXPIRED', 401, 'Sesi Anda telah berakhir. Silakan masuk kembali.'),
      )
      return
    }

    try {
      request.auth = await service.authenticateAccessToken({
        accessToken: match[1],
        countsAsActivity,
        metadata: getAuthRequestMetadata(request),
      })
      next()
    } catch (error) {
      next(error)
    }
  }
}

const denyAuthorization = async ({
  next,
  reason,
  request,
  service,
}: {
  readonly next: NextFunction
  readonly reason: string
  readonly request: Request
  readonly service: AuthService
}): Promise<void> => {
  if (!request.auth) {
    next(
      new DomainError('SESSION_EXPIRED', 401, 'Sesi Anda telah berakhir. Silakan masuk kembali.'),
    )
    return
  }

  try {
    await service.recordAuthorizationDenied({
      metadata: getAuthRequestMetadata(request),
      principal: request.auth,
      reason,
    })
    next(
      new DomainError(
        'FORBIDDEN',
        403,
        'Tindakan ini tidak tersedia untuk akun yang sedang digunakan.',
      ),
    )
  } catch (error) {
    next(error)
  }
}

export const createRoleAuthorizationMiddleware = (
  service: AuthService,
  allowedRoles: readonly UserRole[],
): RequestHandler => {
  const roleSet = new Set(allowedRoles)

  return async (request, _response, next): Promise<void> => {
    if (request.auth && roleSet.has(request.auth.role)) {
      next()
      return
    }

    await denyAuthorization({ next, reason: 'ROLE_NOT_ALLOWED', request, service })
  }
}

export const createPermissionAuthorizationMiddleware = (
  service: AuthService,
  requiredPermissions: readonly string[],
): RequestHandler => {
  return async (request, _response, next): Promise<void> => {
    const permissions = new Set(request.auth?.permissions ?? [])
    const hasEveryPermission = requiredPermissions.every((permission) =>
      permissions.has(permission),
    )

    if (request.auth && hasEveryPermission) {
      next()
      return
    }

    await denyAuthorization({ next, reason: 'PERMISSION_NOT_GRANTED', request, service })
  }
}
