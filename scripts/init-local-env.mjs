import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const outputPath = resolve(process.cwd(), '.env')
const identifierSuffix = randomBytes(6).toString('hex')
const databaseName = `inovamedika_${identifierSuffix}`
const databaseUser = `inovamedika_${identifierSuffix}`
const databasePassword = randomBytes(36).toString('base64url')
const databasePort = '5432'
const databaseUrl = new URL('postgresql://127.0.0.1')

databaseUrl.username = databaseUser
databaseUrl.password = databasePassword
databaseUrl.port = databasePort
databaseUrl.pathname = databaseName

const environment = {
  NODE_ENV: 'development',
  PORT: '3000',
  POSTGRES_PORT: databasePort,
  POSTGRES_DB: databaseName,
  POSTGRES_USER: databaseUser,
  POSTGRES_PASSWORD: databasePassword,
  DATABASE_URL: databaseUrl.toString(),
  MIGRATION_DATABASE_URL: databaseUrl.toString(),
  FRONTEND_ORIGIN: 'http://localhost:5173',
  LOG_LEVEL: 'debug',
  DB_POOL_MAX: '10',
  JWT_ACCESS_SECRET: randomBytes(48).toString('base64url'),
  JWT_ISSUER: 'inovamedika-backend',
  JWT_AUDIENCE: 'inovamedika-frontend',
  DEMO_USER_PASSWORD: randomBytes(24).toString('base64url'),
}

const fileContents = `${Object.entries(environment)
  .map(([key, value]) => `${key}=${value}`)
  .join('\n')}\n`

try {
  writeFileSync(outputPath, fileContents, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
  console.info('Local .env created with unique random credentials.')
} catch (error) {
  if (error instanceof Error && 'code' in error && error.code === 'EEXIST') {
    console.error('Local .env already exists. It was not changed.')
    process.exitCode = 1
  } else {
    throw error
  }
}
