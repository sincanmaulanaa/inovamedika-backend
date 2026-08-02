import 'dotenv/config'

import { z } from 'zod'

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  DATABASE_URL: z.string().url(),
  FRONTEND_ORIGIN: z.string().url().default('http://localhost:5173'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ISSUER: z.string().min(1).default('inovamedika-backend'),
  JWT_AUDIENCE: z.string().min(1).default('inovamedika-frontend'),
})

const parsedEnvironment = environmentSchema.safeParse(process.env)

if (!parsedEnvironment.success) {
  throw new Error(`Invalid environment configuration: ${z.prettifyError(parsedEnvironment.error)}`)
}

export const env = {
  nodeEnv: parsedEnvironment.data.NODE_ENV,
  port: parsedEnvironment.data.PORT,
  databaseUrl: parsedEnvironment.data.DATABASE_URL,
  frontendOrigin: parsedEnvironment.data.FRONTEND_ORIGIN,
  logLevel: parsedEnvironment.data.LOG_LEVEL,
  dbPoolMax: parsedEnvironment.data.DB_POOL_MAX,
  jwtAccessSecret: parsedEnvironment.data.JWT_ACCESS_SECRET,
  jwtIssuer: parsedEnvironment.data.JWT_ISSUER,
  jwtAudience: parsedEnvironment.data.JWT_AUDIENCE,
} as const
