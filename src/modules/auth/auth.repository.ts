import { timingSafeEqual } from 'node:crypto'

import type { Prisma } from '../../generated/prisma/client.js'
import { prisma } from '../../db/prisma.js'
import { withTransaction } from '../../db/transaction.js'
import { authPolicy } from './auth.constants.js'
import type {
  AuthRequestMetadata,
  AuthUserRecord,
  AuthenticatedPrincipal,
  SessionUserRecord,
} from './auth.types.js'

interface RecordDeniedLoginInput extends AuthRequestMetadata {
  readonly now: Date
  readonly reason: string
  readonly shouldIncrementFailure: boolean
  readonly userId?: bigint
}

interface CreateSessionInput extends AuthRequestMetadata {
  readonly absoluteExpiresAt: Date
  readonly expectedPasswordHash: string
  readonly idleExpiresAt: Date
  readonly now: Date
  readonly refreshTokenHash: string
  readonly sessionPublicId: string
  readonly userId: bigint
}

interface RotateSessionInput extends AuthRequestMetadata {
  readonly newRefreshTokenHash: string
  readonly now: Date
  readonly presentedRefreshTokenHash: string
  readonly sessionPublicId: string
}

interface RevokeSessionInput extends AuthRequestMetadata {
  readonly now: Date
  readonly presentedRefreshTokenHash: string
  readonly sessionPublicId: string
}

interface ValidateAccessSessionInput extends AuthRequestMetadata {
  readonly countsAsActivity: boolean
  readonly now: Date
  readonly sessionPublicId: string
}

export type CreateSessionResult =
  | { readonly status: 'CREATED'; readonly session: SessionUserRecord }
  | { readonly status: 'ACCOUNT_INACTIVE' | 'ACCOUNT_LOCKED' | 'CREDENTIALS_CHANGED' }

export type RotateSessionResult =
  | { readonly status: 'ROTATED'; readonly session: SessionUserRecord; readonly expiresAt: Date }
  | { readonly status: 'INVALID' | 'EXPIRED' }

export type ValidateAccessSessionResult =
  | { readonly status: 'ACTIVE'; readonly session: SessionUserRecord }
  | { readonly status: 'INVALID' | 'EXPIRED' }

export interface AuthRepository {
  readonly createSessionReplacingActive: (input: CreateSessionInput) => Promise<CreateSessionResult>
  readonly findUserForLogin: (username: string) => Promise<AuthUserRecord | null>
  readonly recordDeniedLogin: (input: RecordDeniedLoginInput) => Promise<void>
  readonly recordAuthorizationDenied: (
    input: AuthRequestMetadata & {
      readonly principal: AuthenticatedPrincipal
      readonly reason: string
    },
  ) => Promise<void>
  readonly revokeSession: (input: RevokeSessionInput) => Promise<void>
  readonly rotateSession: (input: RotateSessionInput) => Promise<RotateSessionResult>
  readonly validateAccessSession: (
    input: ValidateAccessSessionInput,
  ) => Promise<ValidateAccessSessionResult>
}

interface AuditActor {
  readonly id: bigint
  readonly role: string
  readonly username: string
}

interface CreateAuditInput extends AuthRequestMetadata {
  readonly action: string
  readonly actor?: AuditActor | undefined
  readonly outcome: 'SUCCESS' | 'DENIED' | 'FAILURE'
  readonly reason?: string | undefined
  readonly resourcePublicId?: string | undefined
  readonly resourceType?: string | undefined
  readonly sessionId?: bigint | undefined
}

const createAudit = async (
  transaction: Prisma.TransactionClient,
  input: CreateAuditInput,
): Promise<void> => {
  const data: Prisma.audit_logsUncheckedCreateInput = {
    action: input.action,
    actor_role_snapshot: input.actor?.role ?? null,
    actor_user_id: input.actor?.id ?? null,
    actor_username_snapshot: input.actor?.username ?? null,
    ip_address: input.ipAddress ?? null,
    outcome: input.outcome,
    reason: input.reason ?? null,
    request_id: input.requestId,
    resource_public_id: input.resourcePublicId ?? null,
    resource_type: input.resourceType ?? 'AUTH_SESSION',
    session_id: input.sessionId ?? null,
    user_agent: input.userAgent ?? null,
  }

  await transaction.audit_logs.create({
    data,
  })
}

const mapUser = (user: {
  readonly display_name: string
  readonly failed_login_attempts: number
  readonly id: bigint
  readonly is_active: boolean
  readonly locked_until: Date | null
  readonly password_hash: string
  readonly public_id: string
  readonly role: string
  readonly username: string
}): AuthUserRecord => {
  return {
    displayName: user.display_name,
    failedLoginAttempts: user.failed_login_attempts,
    id: user.id,
    isActive: user.is_active,
    lockedUntil: user.locked_until,
    passwordHash: user.password_hash,
    publicId: user.public_id,
    role: user.role,
    username: user.username,
  }
}

const mapActor = (user: {
  readonly display_name: string
  readonly id: bigint
  readonly role: string
  readonly username: string
}): AuditActor => {
  return {
    id: user.id,
    role: user.role,
    username: user.username,
  }
}

const getPermissionCodes = async (
  transaction: Prisma.TransactionClient,
  userId: bigint,
): Promise<readonly string[]> => {
  const permissionRows = await transaction.user_permissions.findMany({
    orderBy: { permissions: { code: 'asc' } },
    select: { permissions: { select: { code: true } } },
    where: { user_id: userId },
  })

  return permissionRows.map((row) => row.permissions.code)
}

const mapSessionUser = async (
  transaction: Prisma.TransactionClient,
  session: {
    readonly id: bigint
    readonly public_id: string
    readonly users: {
      readonly display_name: string
      readonly id: bigint
      readonly public_id: string
      readonly role: string
      readonly username: string
    }
  },
): Promise<SessionUserRecord> => {
  return {
    displayName: session.users.display_name,
    permissions: await getPermissionCodes(transaction, session.users.id),
    role: session.users.role,
    sessionId: session.id,
    sessionPublicId: session.public_id,
    userId: session.users.id,
    userPublicId: session.users.public_id,
    username: session.users.username,
  }
}

const lockUser = async (transaction: Prisma.TransactionClient, userId: bigint): Promise<void> => {
  await transaction.$queryRaw`select id from public.users where id = ${userId} for update`
}

const lockSession = async (
  transaction: Prisma.TransactionClient,
  sessionPublicId: string,
): Promise<void> => {
  await transaction.$queryRaw`
    select id
    from public.sessions
    where public_id = cast(${sessionPublicId} as uuid)
    for update
  `
}

const hasMatchingHash = (expectedHash: string, actualHash: string): boolean => {
  const expected = Buffer.from(expectedHash, 'hex')
  const actual = Buffer.from(actualHash, 'hex')

  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

const revokeActiveSession = async ({
  actor,
  input,
  reason,
  sessionId,
  sessionPublicId,
  transaction,
}: {
  readonly actor: AuditActor
  readonly input: AuthRequestMetadata & { readonly now: Date }
  readonly reason: string
  readonly sessionId: bigint
  readonly sessionPublicId: string
  readonly transaction: Prisma.TransactionClient
}): Promise<void> => {
  await transaction.sessions.update({
    data: { revoked_at: input.now, revoked_reason: reason },
    where: { id: sessionId },
  })
  const isDenied = !['LOGOUT', 'REPLACED_BY_LOGIN'].includes(reason)
  await createAudit(transaction, {
    ...input,
    action: 'SESSION_REVOKED',
    actor,
    outcome: isDenied ? 'DENIED' : 'SUCCESS',
    reason,
    resourcePublicId: sessionPublicId,
    sessionId,
  })
}

export const authRepository: AuthRepository = {
  findUserForLogin: async (username) => {
    const user = await prisma.users.findUnique({
      where: { username },
    })

    return user ? mapUser(user) : null
  },

  recordDeniedLogin: async (input) => {
    await withTransaction(async (transaction) => {
      if (input.userId === undefined) {
        await createAudit(transaction, {
          ...input,
          action: 'LOGIN',
          outcome: 'DENIED',
          reason: input.reason,
          resourceType: 'USER_ACCOUNT',
        })
        return
      }

      await lockUser(transaction, input.userId)
      const user = await transaction.users.findUnique({ where: { id: input.userId } })

      if (!user) {
        return
      }

      if (input.shouldIncrementFailure) {
        const hasExpiredLock = user.locked_until !== null && user.locked_until <= input.now
        const failedLoginAttempts = (hasExpiredLock ? 0 : user.failed_login_attempts) + 1
        const lockedUntil =
          failedLoginAttempts >= authPolicy.failedLoginThreshold
            ? new Date(input.now.getTime() + authPolicy.failedLoginLockMs)
            : hasExpiredLock
              ? null
              : user.locked_until

        await transaction.users.update({
          data: { failed_login_attempts: failedLoginAttempts, locked_until: lockedUntil },
          where: { id: user.id },
        })
      }

      await createAudit(transaction, {
        ...input,
        action: 'LOGIN',
        outcome: 'DENIED',
        reason: input.reason,
        resourcePublicId: user.public_id,
        resourceType: 'USER_ACCOUNT',
      })
    })
  },

  recordAuthorizationDenied: async (input) => {
    await withTransaction(async (transaction) => {
      await createAudit(transaction, {
        ...input,
        action: 'AUTHORIZATION_DENIED',
        actor: {
          id: input.principal.internalUserId,
          role: input.principal.role,
          username: input.principal.username,
        },
        outcome: 'DENIED',
        reason: input.reason,
        resourcePublicId: input.principal.sessionId,
        sessionId: input.principal.internalSessionId,
      })
    })
  },

  createSessionReplacingActive: async (input) => {
    return withTransaction(async (transaction): Promise<CreateSessionResult> => {
      await lockUser(transaction, input.userId)
      const user = await transaction.users.findUnique({ where: { id: input.userId } })

      if (!user || user.password_hash !== input.expectedPasswordHash) {
        return { status: 'CREDENTIALS_CHANGED' }
      }

      if (!user.is_active) {
        return { status: 'ACCOUNT_INACTIVE' }
      }

      if (user.locked_until !== null && user.locked_until > input.now) {
        return { status: 'ACCOUNT_LOCKED' }
      }

      const previousSessions = await transaction.sessions.findMany({
        select: { id: true, public_id: true },
        where: { user_id: user.id, revoked_at: null },
      })

      for (const previousSession of previousSessions) {
        await revokeActiveSession({
          actor: mapActor(user),
          input,
          reason: 'REPLACED_BY_LOGIN',
          sessionId: previousSession.id,
          sessionPublicId: previousSession.public_id,
          transaction,
        })
      }

      const session = await transaction.sessions.create({
        data: {
          absolute_expires_at: input.absoluteExpiresAt,
          idle_expires_at: input.idleExpiresAt,
          ip_address: input.ipAddress ?? null,
          last_activity_at: input.now,
          public_id: input.sessionPublicId,
          refresh_token_hash: input.refreshTokenHash,
          user_agent: input.userAgent ?? null,
          user_id: user.id,
        },
      })

      await transaction.users.update({
        data: { failed_login_attempts: 0, last_login_at: input.now, locked_until: null },
        where: { id: user.id },
      })
      await createAudit(transaction, {
        ...input,
        action: 'LOGIN',
        actor: mapActor(user),
        outcome: 'SUCCESS',
        resourcePublicId: session.public_id,
        sessionId: session.id,
      })

      return {
        status: 'CREATED',
        session: await mapSessionUser(transaction, { ...session, users: user }),
      }
    })
  },

  rotateSession: async (input) => {
    return withTransaction(async (transaction): Promise<RotateSessionResult> => {
      await lockSession(transaction, input.sessionPublicId)
      const session = await transaction.sessions.findUnique({
        include: { users: true },
        where: { public_id: input.sessionPublicId },
      })

      if (!session || session.revoked_at !== null) {
        return { status: 'INVALID' }
      }

      const actor = mapActor(session.users)

      if (!hasMatchingHash(session.refresh_token_hash, input.presentedRefreshTokenHash)) {
        await revokeActiveSession({
          actor,
          input,
          reason: 'REFRESH_TOKEN_REUSE',
          sessionId: session.id,
          sessionPublicId: session.public_id,
          transaction,
        })
        return { status: 'INVALID' }
      }

      const expirationReason =
        input.now >= session.absolute_expires_at
          ? 'ABSOLUTE_TIMEOUT'
          : input.now >= session.idle_expires_at
            ? 'IDLE_TIMEOUT'
            : null

      if (expirationReason || !session.users.is_active) {
        await revokeActiveSession({
          actor,
          input,
          reason: expirationReason ?? 'ACCOUNT_INACTIVE',
          sessionId: session.id,
          sessionPublicId: session.public_id,
          transaction,
        })
        return { status: 'EXPIRED' }
      }

      const rotatedSession = await transaction.sessions.update({
        data: {
          last_rotated_at: input.now,
          refresh_token_hash: input.newRefreshTokenHash,
          rotation_counter: { increment: 1 },
        },
        where: { id: session.id },
      })
      await createAudit(transaction, {
        ...input,
        action: 'SESSION_REFRESH',
        actor,
        outcome: 'SUCCESS',
        resourcePublicId: session.public_id,
        sessionId: session.id,
      })

      return {
        expiresAt: session.absolute_expires_at,
        session: await mapSessionUser(transaction, { ...rotatedSession, users: session.users }),
        status: 'ROTATED',
      }
    })
  },

  revokeSession: async (input) => {
    await withTransaction(async (transaction) => {
      await lockSession(transaction, input.sessionPublicId)
      const session = await transaction.sessions.findUnique({
        include: { users: true },
        where: { public_id: input.sessionPublicId },
      })

      if (!session || session.revoked_at !== null) {
        return
      }

      await revokeActiveSession({
        actor: mapActor(session.users),
        input,
        reason: hasMatchingHash(session.refresh_token_hash, input.presentedRefreshTokenHash)
          ? 'LOGOUT'
          : 'REFRESH_TOKEN_REUSE',
        sessionId: session.id,
        sessionPublicId: session.public_id,
        transaction,
      })
    })
  },

  validateAccessSession: async (input) => {
    return withTransaction(async (transaction): Promise<ValidateAccessSessionResult> => {
      await lockSession(transaction, input.sessionPublicId)
      const session = await transaction.sessions.findUnique({
        include: { users: true },
        where: { public_id: input.sessionPublicId },
      })

      if (!session || session.revoked_at !== null || !session.users.is_active) {
        return { status: 'INVALID' }
      }

      const expirationReason =
        input.now >= session.absolute_expires_at
          ? 'ABSOLUTE_TIMEOUT'
          : input.now >= session.idle_expires_at
            ? 'IDLE_TIMEOUT'
            : null

      if (expirationReason) {
        await revokeActiveSession({
          actor: mapActor(session.users),
          input,
          reason: expirationReason,
          sessionId: session.id,
          sessionPublicId: session.public_id,
          transaction,
        })
        return { status: 'EXPIRED' }
      }

      const activeSession = input.countsAsActivity
        ? await transaction.sessions.update({
            data: {
              idle_expires_at: new Date(
                Math.min(
                  input.now.getTime() + authPolicy.idleSessionTtlMs,
                  session.absolute_expires_at.getTime(),
                ),
              ),
              last_activity_at: input.now,
            },
            where: { id: session.id },
          })
        : session

      return {
        status: 'ACTIVE',
        session: await mapSessionUser(transaction, { ...activeSession, users: session.users }),
      }
    })
  },
}
