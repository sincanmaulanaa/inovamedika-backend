import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

const scriptPath = resolve(process.cwd(), 'scripts/init-local-env.mjs')
const temporaryDirectories: string[] = []
const requiredKeys = [
  'NODE_ENV',
  'PORT',
  'POSTGRES_PORT',
  'POSTGRES_DB',
  'POSTGRES_USER',
  'POSTGRES_PASSWORD',
  'DATABASE_URL',
  'MIGRATION_DATABASE_URL',
  'FRONTEND_ORIGIN',
  'LOG_LEVEL',
  'DB_POOL_MAX',
  'JWT_ACCESS_SECRET',
  'JWT_ISSUER',
  'JWT_AUDIENCE',
  'DEMO_USER_PASSWORD',
] as const

const createTemporaryDirectory = (): string => {
  const directory = mkdtempSync(resolve(tmpdir(), 'inovamedika-env-'))

  temporaryDirectories.push(directory)

  return directory
}

const parseEnvironmentFile = (contents: string): Readonly<Record<string, string>> => {
  return Object.fromEntries(
    contents
      .trim()
      .split('\n')
      .map((line) => {
        const separatorIndex = line.indexOf('=')

        return [line.slice(0, separatorIndex), line.slice(separatorIndex + 1)]
      }),
  )
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

describe('local environment generator', () => {
  it('creates a private environment file with unique generated secrets', () => {
    const directory = createTemporaryDirectory()
    const environmentPath = resolve(directory, '.env')

    execFileSync(process.execPath, [scriptPath], { cwd: directory, stdio: 'pipe' })

    const environment = parseEnvironmentFile(readFileSync(environmentPath, 'utf8'))
    const secretValues = [
      environment.POSTGRES_PASSWORD,
      environment.JWT_ACCESS_SECRET,
      environment.DEMO_USER_PASSWORD,
    ]

    expect(Object.keys(environment)).toEqual(requiredKeys)
    expect(Object.values(environment).every((value) => value.length > 0)).toBe(true)
    expect(new Set(secretValues).size).toBe(secretValues.length)
    expect(environment.DATABASE_URL).toBe(environment.MIGRATION_DATABASE_URL)

    if (process.platform !== 'win32') {
      expect(statSync(environmentPath).mode & 0o777).toBe(0o600)
    }
  })

  it('refuses to replace an existing environment file', () => {
    const directory = createTemporaryDirectory()
    const environmentPath = resolve(directory, '.env')
    const existingContents = 'keep-existing-file\n'

    writeFileSync(environmentPath, existingContents)

    const result = spawnSync(process.execPath, [scriptPath], { cwd: directory, stdio: 'pipe' })

    expect(result.status).toBe(1)
    expect(readFileSync(environmentPath, 'utf8')).toBe(existingContents)
  })
})
