export const userRoles = ['ADMINISTRATOR', 'REGISTRATION_OFFICER', 'DOCTOR'] as const

export const authPolicy = {
  accessTokenTtlSeconds: 15 * 60,
  absoluteSessionTtlMs: 8 * 60 * 60 * 1_000,
  failedLoginLockMs: 15 * 60 * 1_000,
  failedLoginThreshold: 5,
  idleSessionTtlMs: 15 * 60 * 1_000,
  loginRateLimit: 10,
  loginRateLimitWindowMs: 15 * 60 * 1_000,
} as const

export const authCookieNames = {
  csrf: 'inovamedika_csrf',
  refresh: 'inovamedika_refresh',
} as const

export type UserRole = (typeof userRoles)[number]
