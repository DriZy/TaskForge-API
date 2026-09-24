# TaskForge API — Security & Production Hardening Review (Phase 17)

Date: 2026-09-24
Scope: `src/`, `prisma/`, Docker files, npm deps. Express 5.2.1 (maintained line), Node 24 runtime.

## Executive Summary

The application follows secure-by-default practices well: all request input is
schema-validated (Zod) at body/query/params boundaries (EXPRESS-INPUT-001),
Prisma is used without raw SQL or untrusted field interpolation, sorting goes
through an explicit allowlist, bearer-token auth avoids the CSRF class entirely,
custom 404/error handlers mask internals, and secrets are externalized (`.env`
ignored, `.env.example` placeholders only, nothing committed). No injection,
secret-leakage, command-injection, SSRF, template-injection, or
path-traversal sinks were found.

The three actionable hardening gaps (SEC-01..03) have been fixed and are
covered by `tests/security-hardening.integration.test.ts`: HTTP security
headers via `helmet()`, an explicit `100kb` JSON body limit (413), and per-IP
auth rate limiting (429). Remaining items are informational (SEC-04..06):
dependency hygiene and dev-posture documentation.

## Findings

### SEC-01 — Missing HTTP security headers

- Severity: Medium
- Location: `src/app.ts:8-22` (no security-header middleware installed)
- Evidence: `app.disable("x-powered-by")` is set at `src/app.ts:11`, but no
  header middleware was installed anywhere in the middleware stack.
- Impact: Responses lacked `X-Content-Type-Options`, CSP, `Referrer-Policy` and
  clickjacking (`X-Frame-Options`/`frame-ancestors`) protections. Browser
  clients consuming the API had weaker MIME-sniffing / framing / script-source
  defenses.
- Fix (DONE): `helmet()` added early in the middleware chain at `src/app.ts:17`
  (helmet@8.3.0). Default Helmet policy applied; verified the Swagger UI
  (`/api-docs/`) still loads — it uses only same-origin external bundle
  scripts, so the default CSP does not break it. Covered by
  `tests/security-hardening.integration.test.ts`.
- Remaining Recommendation: Set `crossOriginResourcePolicy`/CORS only when a
  browser client origin is introduced (SEC-04).

### SEC-02 — No explicit body-size limit

- Severity: Low
- Location: `src/app.ts:16` — `app.use(express.json());`
- Evidence: `express.json()` is called with no `limit` option. Express 5
  defaults to 100kb, but the limit is implicit and there is no explicit,
  documented cap.
- Impact: Unlimited (implicit) or unrecognized body-size contract; a
  misconfigured upstream default would accept oversized payloads (DoS/disk).
- Fix (DONE): `express.json({ limit: "100kb" })` at `src/app.ts:18`
  (EXPRESS-BODY-001). Oversized bodies are rejected with `413 REQUEST_TOO_LARGE`
  via a dedicated branch in `src/middleware/error-handler.ts` (never a 500, no
  internal detail leaked). Covered by `tests/security-hardening.integration.test.ts`.
- Remaining Recommendation: Also enforce a body cap at the reverse proxy/gateway
  when deployed.

### SEC-03 — No rate limiting on authentication endpoints

- Severity: Medium
- Location: `src/routes/auth.routes.ts` (`POST /api/auth/register`,
  `POST /api/auth/login`)
- Evidence: No throttling middleware exists on auth routes; `requireAuth` at
  `src/middleware/require-auth.ts` only verifies tokens.
- Impact: Brute-force/credential-stuffing attacks against login and account
  creation are unbounded (EXPRESS-AUTH-001).
- Fix (DONE): `express-rate-limit@8.7.0` applied to all `/api/auth/*` requests
  in `src/routes/auth.routes.ts` — 100 requests per 15-minute window per IP,
  returning `429 RATE_LIMITED` (EXPRESS-AUTH-001). Limits are injectable via
  `createApp({ authRateLimit })` so tests can exercise the low-limit path.
  Covered by `tests/security-hardening.integration.test.ts`.
- Remaining Recommendation: Combine with account-lockout logic only if the
  product requires it; per-IP throttle + bcrypt cost already raise attack cost.
  Tune the window/limit for real traffic before production.

### SEC-04 — CORS policy not yet defined

- Severity: Low (informational)
- Location: `src/app.ts` (no CORS middleware)
- Evidence: No `cors()` usage and no `Access-Control-Allow-*` headers emitted.
- Impact: Browsers block cross-origin browser clients by default. This is the
  safe default for now, but a future web client will need an explicit,
  least-privilege allowlist (never `*` with credentials).
- Fix: None required today (EXPRESS-CORS-001 compliance is achieved by CORS
  being disabled). When a first-party client is added, configure an explicit
  origin allowlist.
- Remaining Recommendation: Document the future CORS policy in this file.

### SEC-05 — High-severity transitive advisory: `deepmerge-ts` via Prisma CLI

- Severity: Medium (dev-tooling only)
- Location: `package.json` (prisma devDependency), `node_modules/deepmerge-ts`
- Evidence: `npm audit` reports GHSA-ggr8-5vv4-36mx (stack exhaustion on
  recursive object merge) reachable through `@prisma/config` via the `prisma`
  CLI. The suggested automated "fix" downgrades Prisma to 6.12.0.
- Impact: The vulnerable path is only in the Prisma CLI used at build/migrate
  time (config-file parsing), not the runtime API server.
- Fix: Monitor for a patched Prisma line and upgrade when available. Do not
  force-downgrade.
- Remaining Recommendation: Add a scheduled `npm audit` triage step to CI.

### SEC-06 — Defaults/dev env posture (informational)

- Severity: Low (informational)
- Location: `src/config/env.ts:3-8`, `docker-compose.yml:9-12`
- Evidence: `NODE_ENV` defaults to `development` in `env.ts`; the compose API
  container sets `NODE_ENV=development` and hardcodes `taskforge:taskforge`
  DB credentials.
- Impact: Dev-friendly defaults are expected for local tooling; the production
  Dockerfile correctly sets `NODE_ENV=production` and the error handler masks
  internals regardless of NODE_ENV.
- Fix: None required. Ensure production deploys set their own `DATABASE_URL`
  and never reuse the dev compose credentials.
- Remaining Recommendation: Restrict `postgres:5432` exposure and rotate the
  dev password for non-local environments.

## Verified Non-Issues

- No raw SQL or untrusted field interpolation in `src/` (Prisma only).
- Sorting allowlist enforced (`src/services/task.service.ts`, Phase 14).
- Bearer-token auth (no cookies) → CSRF not applicable (EXPRESS-CSRF-001).
- Custom 404 + error handlers mask stack traces/credentials/connection strings
  (`src/middleware/error-handler.ts`, tested in Phase 16).
- `.env` is gitignored and untracked; `.env.example` is placeholders only.
- No command injection, SSRF, template injection, or file-serving sinks.
- UUID public IDs used (`id`/`ownerId`); no enumeration via incrementing IDs.
- No `--inspect` or `insecureHTTPParser` in any runtime/dev config.
- Express 5.2.1 is a maintained line.