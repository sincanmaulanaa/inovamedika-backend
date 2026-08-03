# Inova Medika backend

Express 5 and PostgreSQL API foundation for the Mini Clinic Information System.
The codebase is a standalone strict-TypeScript modular monolith with Prisma ORM.

## Requirements

- Node.js 22.12 or newer; Node.js 24 LTS recommended for production
- pnpm 11.18 or newer within major version 11
- PostgreSQL 17, normally provided by Docker Compose
- Gitleaks 8.30 or newer for local secret checks

## Setup

```bash
corepack enable pnpm
pnpm env:init
pnpm install --frozen-lockfile
docker compose up -d postgres
pnpm db:migrate
pnpm db:seed
pnpm dev
```

`.env.example` is intentionally empty. `pnpm env:init` creates an ignored `.env`
with unique random database credentials, a JWT secret, and a demo password. The
command refuses to overwrite an existing file and creates it with owner-only file
permissions. Define production values only in the deployment platform's secret
manager:

- Runtime: `DATABASE_URL`, `JWT_ACCESS_SECRET`
- Database administration: `MIGRATION_DATABASE_URL`
- Docker Compose: `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`
- Development seed: `DEMO_USER_PASSWORD`
- Optional settings: `NODE_ENV`, `PORT`, `POSTGRES_PORT`, `FRONTEND_ORIGIN`,
  `LOG_LEVEL`, `DB_POOL_MAX`, `JWT_ISSUER`, `JWT_AUDIENCE`

The repository does not provide default passwords, tokens, or database connection
strings. Never reuse generated development credentials in production.

The API listens on `http://localhost:3000/api/v1` by default.

If host port 5432 is occupied, use a different Compose port and update both
database URLs in `.env`:

```bash
POSTGRES_PORT=55432 docker compose up -d postgres
```

## Health endpoints

- `GET /api/v1/health/live` checks the HTTP process only.
- `GET /api/v1/health/ready` checks the database and migration ledger.

## Authentication

- `POST /api/v1/login` accepts a username and password, then returns a 15-minute
  access token and a concise user profile.
- `POST /api/v1/refresh` rotates the opaque refresh credential and returns a new
  access token. It requires the trusted frontend origin and matching CSRF cookie
  and header values.
- `POST /api/v1/logout` revokes the server-side session and clears both auth
  cookies. It uses the same Origin and CSRF protection as refresh.

The raw refresh credential is only sent through an `HttpOnly`, `SameSite=Strict`
cookie; the database stores its SHA-256 hash. Access tokens are expected to stay
in frontend memory and every protected request revalidates its session against
the database. A session expires after 15 minutes without user activity or eight
hours after login. Login from another device, logout, refresh-token replay, and
changes to a user's password, role, or active status revoke the previous session.

After login, send the access token as `Authorization: Bearer <access-token>`. For
refresh and logout, copy the `inovamedika_csrf` cookie value into the
`X-CSRF-Token` header. Do not log or persist either token in browser storage.

## Patient management

Administrators and registration officers can use the following protected
endpoints. Doctors are denied because clinical patient access must be scoped to
an assigned visit through a separate clinical endpoint.

- `GET /api/v1/patients?page=1&limit=10&search=` lists active patients. Search
  matches medical record number, NIK, name, and phone number. `limit` is capped
  at 100.
- `GET /api/v1/patients/:id` returns administrative patient details.
- `POST /api/v1/patients` creates a patient. The database generates the medical
  record number; clients cannot choose or change it.
- `PUT /api/v1/patients/:id` replaces the mutable administrative fields and
  requires the latest `rowVersion` returned by the API.
- `DELETE /api/v1/patients/:id` soft-deletes an unused patient. A patient with a
  registration is preserved and returns `PATIENT_HAS_REGISTRATIONS`.

Create and update payloads contain `nik`, `fullName`, `sex`, `dateOfBirth`,
`phone`, and `address`. NIK is normalized to 16 digits and remains globally
unique, including soft-deleted patients. Phone numbers are normalized for search
while the user-entered format remains available for display. Expected conflicts
use stable codes such as `PATIENT_NIK_EXISTS` and `PATIENT_VERSION_CONFLICT`.

Patient list, search, view, create, update, failed write, and delete activity is
recorded in the append-only audit trail. Audit metadata records the operation and
changed field names, but never copies NIK, addresses, phone numbers, or complete
patient payloads.


## Audit Trails

All sensitive actions across the system (login, patient access, medical record viewing/export, etc) are captured in the `audit_logs` table.
- `GET /api/v1/audit-logs` allows `ADMINISTRATOR` or `AUDITOR` to view all audit logs with pagination and filters (by user, resource, IP address).
- `POST /api/v1/audit-logs/patient-export-requests` securely logs manual or automated patient medical record exports.

## Medical Record Corrections

Clinical data integrity is strictly enforced according to Permenkes 24/2022 Pasal 16.
- Doctors can freely amend medical records using `POST /api/v1/medical-records/:id/amend` within 2x24 hours of finalization.
- After 48 hours, the record is locked (`CORRECTION_REQUEST_REQUIRED`).
- To amend an expired record, a doctor must first request a correction via `POST /api/v1/medical-records/:id/correction-requests`.
- A PMIK or Facility Leader (`ADMINISTRATOR`) can approve the request via `POST /api/v1/medical-records/correction-requests/:id/approve`.
- Once approved, the doctor may amend the medical record again.

## Database workflow

- `pnpm db:generate` generates the typed Prisma client into `src/generated/prisma`.
- `pnpm db:migrate` deploys versioned migrations from `prisma/migrations`.
- `pnpm db:migrate:dev` creates and applies a migration during local development.
- Applied migrations must never be edited after merge; create a new migration.
- `pnpm db:seed` is idempotent and refuses to run outside development/test.
- Seeded accounts are `admin`, `registration`, and `doctor`. Their shared local
  password is reset from `DEMO_USER_PASSWORD` on every seed; never use the demo
  seed in production.

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
pnpm security:secrets
```

GitHub Actions repeats the full-history secret scan and code quality checks on
every push and pull request. Its database credentials and application secrets are
generated inside the disposable runner and are never stored in the repository.
Dependabot checks pnpm and GitHub Actions dependencies weekly; security updates
are enabled in the repository settings.

## Commands

```bash
pnpm dev
pnpm env:init
pnpm format
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm quality:duplication
pnpm security:secrets
pnpm check:code
pnpm check
```

This repository is self-contained and does not import files or packages from the
frontend repository. The two applications integrate only through the HTTP API.
Business transitions and authorization belong in service modules; controllers do
not access the database and repositories do not decide access policy.
