# Inova Medika backend

Express 5 and PostgreSQL API foundation for the Mini Clinic Information System.
The codebase is a standalone strict-TypeScript modular monolith with Prisma ORM.

## Requirements

- Node.js 22.12 or newer; Node.js 24 LTS recommended for production
- pnpm 11.18 or newer within major version 11
- PostgreSQL 17, normally provided by Docker Compose

## Setup

```bash
cp .env.example .env
corepack enable pnpm
pnpm install --frozen-lockfile
docker compose up -d postgres
pnpm db:migrate
pnpm db:seed
pnpm dev
```

`.env.example` is intentionally empty. Define these variables only in the ignored
local `.env` file, CI secret storage, or the deployment platform's secret manager:

- Runtime: `DATABASE_URL`, `JWT_ACCESS_SECRET`
- Database administration: `MIGRATION_DATABASE_URL`
- Docker Compose: `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`
- Development seed: `DEMO_USER_PASSWORD`
- Optional settings: `NODE_ENV`, `PORT`, `POSTGRES_PORT`, `FRONTEND_ORIGIN`,
  `LOG_LEVEL`, `DB_POOL_MAX`, `JWT_ISSUER`, `JWT_AUDIENCE`

The repository does not provide default passwords, tokens, or database connection
strings. Generate unique local values and never reuse production credentials.

The API listens on `http://localhost:3000/api/v1` by default.

If host port 5432 is occupied, use a different Compose port and update both
database URLs in `.env`:

```bash
POSTGRES_PORT=55432 docker compose up -d postgres
```

## Health endpoints

- `GET /api/v1/health/live` checks the HTTP process only.
- `GET /api/v1/health/ready` checks the database and migration ledger.

## Database workflow

- `pnpm db:generate` generates the typed Prisma client into `src/generated/prisma`.
- `pnpm db:migrate` deploys versioned migrations from `prisma/migrations`.
- `pnpm db:migrate:dev` creates and applies a migration during local development.
- Applied migrations must never be edited after merge; create a new migration.
- `pnpm db:seed` is idempotent and refuses to run outside development/test.
- Seeded accounts are `admin`, `registration`, and `doctor`. Their shared local
  password comes from `DEMO_USER_PASSWORD`; never use the demo seed in production.

Prisma is the application data-access layer. SQL migrations remain authoritative
for PostgreSQL features that Prisma cannot fully express, including CHECK
constraints, deferrable foreign keys, append-only audit triggers, and queue
concurrency functions. Keep `prisma/schema.prisma` and the deployed database free
of drift by running `pnpm db:migrate:status` after schema changes.

The initial schema includes identity and permissions, sessions, master data,
patients, visits, queue concurrency controls, versioned clinical records,
structured prescriptions, status histories, and append-only processing audit.

Production uses separate migration and runtime database roles. The runtime role
must not own the schema, execute DDL, or update/delete audit and final clinical
records.

## Secret handling

- Never commit `.env`, credentials, access tokens, private keys, or connection
  strings containing a password.
- Confirm the local environment remains ignored with `git check-ignore .env`.
- Run a secret scanner against the worktree and full Git history before pushing.
- Rotate a credential immediately if it appears in a commit, log, screenshot, or
  other shared artifact. Removing the file alone does not remove it from history.

Install [Gitleaks](https://github.com/gitleaks/gitleaks), then enable the tracked
pre-commit and pre-push checks once after cloning:

```bash
git config core.hooksPath .githooks
gitleaks git --redact --no-banner --log-opts="--all"
```

## Commands

```bash
pnpm dev
pnpm format
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm quality:duplication
pnpm check
```

This repository is self-contained and does not import files or packages from the
frontend repository. The two applications integrate only through the HTTP API.
Business transitions and authorization belong in service modules; controllers do
not access the database and repositories do not decide access policy.
