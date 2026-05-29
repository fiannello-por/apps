# Lightdash Performance Control Plane — Design

**Date:** 2026-05-29
**Status:** Approved (design) — pending spec review

## Purpose

A control plane to benchmark, test, and diagnose the query performance of a
self-hosted (Render) Lightdash instance, accessed through the Lightdash HTTP API.

The primary need is to know the **exact latency** of a given query — not as a
single number, but decomposed into phases so we can attribute slowness to the
warehouse, the queue, or the network. Secondary needs: run queries concurrently
to test behavior under load, and reopen past runs. The tool also doubles as a
**Lightdash API explorer**: a clean UI for driving the different data-retrieval
endpoints and comparing their latency.

The system is built to be extended later with additional testing scenarios
(unattended/scheduled runs, alerting, head-to-head comparisons) without
rewriting the measurement core.

## Core concept: latency decomposition

Lightdash's v2 query API is **asynchronous**:

1. `POST /api/v2/projects/{projectUuid}/query/{metric-query|sql|...}` → returns a
   `queryUuid`.
2. `GET /api/v2/projects/{projectUuid}/query/{queryUuid}?page=&pageSize=` → poll
   while `status` is `queued`/`executing`, until `ready` (or `error`/`expired`).
3. The `ready` response carries `rows`, `columns`, pagination, and a
   `metadata.performance` block: `queueTimeMs`, `initialQueryExecutionMs`,
   `resultsPageExecutionMs`.

We capture **two complementary sources** per run:

- **Server-reported** (`metadata.performance`) — authoritative for queue and
  warehouse execution time.
- **Client wall-clock** — our own timestamps around each HTTP call, i.e. what a
  caller actually experiences (network + polling included).

Phases stored per run:

| Phase | Source | Meaning |
|-------|--------|---------|
| Submit round-trip | client | POST → `queryUuid` (includes SQL compile) |
| Queue wait | server | `queueTimeMs` |
| Warehouse execution | server | `initialQueryExecutionMs` |
| Poll overhead | client | gaps between status checks + network |
| Results fetch | client | `resultsPageExecutionMs` + transfer |
| **End-to-end wall-clock** | client | total wait (headline metric) |

**Reconciliation:** client "wait-until-ready" ≈ server `queueTimeMs +
initialQueryExecutionMs` + poll overhead + network. The leftover is itself a
useful signal.

### Measurement vantage

All timing is performed **server-side, from a Vercel serverless function calling
Lightdash** (server-to-server). This gives a stable, reproducible vantage point
(Vercel region → Render-hosted Lightdash) instead of varying per-tester browser
network. The Vercel function region should be configured close to the Render
region. Browser→Vercel latency is deliberately excluded.

## Scope

### In scope (v1)

1. **Auth** — account-based login (Auth.js); all features gated behind it.
2. **Connections** — manage one or more Lightdash instances (base URL, project
   UUID, personal access token) via a Settings screen. Tokens encrypted at rest.
   Connections are **shared across all logged-in users** (team tool), with
   `createdBy` tracked.
3. **API Explorer** — pick a connection, pick a retrieval endpoint
   (`metric_query` / `sql` / `saved_chart` / `underlying_data`), build the
   request, run once, see the latency waterfall + raw JSON response.
4. **Concurrency test** — take a query, choose concurrency level N and iteration
   count, fire via client fan-out, see aggregate stats (p50/p95/p99, min/max,
   mean, error rate) plus each run's phase breakdown.
5. **Run history** — every run persisted; reopen a past run to see its
   waterfall/aggregates; "Re-run" clones its payload.

### Explicitly deferred (engine built to allow them)

- Time-series **trend charts** (evolution over time) — **not in v1**.
- Unattended/scheduled runs, background job queue.
- Alerting.
- Multi-user org/roles beyond shared connections.
- Head-to-head comparison of two connections.

## Stack

- **Next.js (App Router) + TypeScript**, deployed to **Vercel**.
- **shadcn/ui + Tailwind v4**, themed with the project DESIGN.md tokens (Geist,
  monochromatic light theme). DESIGN.md is committed to the repo root.
- **Auth.js (NextAuth)** for account-based authentication.
- **Vercel Postgres (Neon)** via **Drizzle ORM** (light cold-starts, typed
  migrations).
- **Recharts** (shadcn charting) for the waterfall/aggregate visuals.
- Measurement engine as a standalone, framework-agnostic TS module.

## Architecture

### Measurement engine (`lib/engine/`)

Framework-agnostic so future phases (headless batch, scheduled runs) reuse it
untouched.

- `lightdash-client.ts` — typed wrapper over the Lightdash HTTP API: create
  metric-query / SQL / saved-chart / underlying-data query, `getResults(queryUuid,
  page)`, plus discovery (`listExplores`, `getExplore`, `listCharts`). Injects the
  PAT `Authorization` header.
- `runner.ts` — `runSingleQuery(connection, spec): Promise<ExecutionResult>`:
  orchestrates POST → poll-until-ready (capped backoff) → fetch results, stamping
  timestamps per phase and extracting `metadata.performance`. Returns normalized
  phase timings + raw response.
- `aggregate.ts` — percentile/stat helpers (p50/p95/p99, min/max/mean, error
  rate).
- Pure functions; unit-tested against a mocked client.

### Execution model (Approach A — client-orchestrated fan-out)

- A single measurement runs in `/api/run` (one Vercel invocation per query).
- For concurrency tests, the **browser fans out**: it calls `/api/run` N×
  iterations with a shared `testRunId`, respecting a concurrency pool of size N.
  Each query gets its own isolated invocation → true parallelism, no shared
  function timeout, live progress.
- Trade-off accepted for v1: a running test is tied to the open browser tab
  (unattended runs are a later phase via the same engine).

### API routes (server-only Route Handlers)

- `/api/connections` (+ `[id]`) — CRUD; `POST /api/connections/[id]/test`
  validates URL/token.
- `/api/lightdash/explores`, `/explores/[name]`, `/charts` — thin proxies
  powering the Explorer pickers.
- `/api/run` — runs one measurement, persists a `query_executions` row, returns
  timings. Fan-out target for concurrency. `maxDuration` configured for Vercel.
- `/api/test-runs` (+ `[id]`) — create / list / detail of run batches.
- `/api/auth/...` — Auth.js.

### Data model (Postgres / Drizzle)

- **Auth.js tables** — `users`, `accounts`, `sessions`, `verificationTokens`.
- **`connections`** — `id`, `name`, `baseUrl`, `projectUuid`, `encryptedToken`,
  `createdBy`, timestamps. Token AES-256-GCM encrypted via server `ENCRYPTION_KEY`;
  write-only (shown masked, never returned to client).
- **`test_runs`** — `id`, `connectionId`, `endpointType`, `payload` (jsonb request
  snapshot), `mode` (`single`|`concurrent`), `concurrency`, `iterations`,
  `status` (`running`|`completed`|`failed`|`partial`), `startedAt`, `finishedAt`,
  `aggregates` (jsonb: percentiles, error rate, count), `createdBy`.
- **`query_executions`** — `id`, `testRunId`, `iterationIndex`, `status`
  (`ok`|`error`|`timeout`), phase timings (`submitMs`, `queueTimeMs`,
  `warehouseExecMs`, `pollOverheadMs`, `resultsFetchMs`, `totalWallClockMs`),
  `lightdashQueryUuid`, `serverPerf` (jsonb raw `metadata.performance`),
  `rowCount`, `errorMessage`, `startedAt`, `finishedAt`.

(No `query_specs` table and no trends aggregation in v1; re-use is via "Re-run"
cloning a past run's payload.)

## Data flow — concurrency test

1. Client `POST /api/test-runs` → server creates `test_runs` (status `running`),
   returns `id`.
2. Client fan-out: a concurrency pool of size N issues `POST /api/run`
   `{ testRunId, connectionId, endpointType, payload }` until `iterations`
   complete.
3. Each `/api/run`: engine runs the async flow, times phases, persists a
   `query_executions` row, returns timings.
4. Client renders live waterfalls + running aggregates as results stream in.
5. On completion, client `PATCH /api/test-runs/[id]` → status `completed`; server
   computes and stores `aggregates` from the executions.

Single-query (Explorer) runs are the same flow with `mode: single`, N=1,
iterations=1.

## UI surfaces

Themed with DESIGN.md (monochrome, Geist, 14px cards, 10px inputs/buttons, pill
chips/badges, subtle-ash borders, black primary CTA):

- **Explorer** (primary) — left: request builder (endpoint segmented control →
  explore → dimension/metric chips / SQL editor / chart picker → limit → Run);
  right: latency breakdown (headline stats, phase waterfall, raw JSON).
- **Concurrency** — query composer + N/iterations controls; live aggregate panel
  and per-run waterfalls.
- **History** — list of past runs; detail view with waterfall/aggregates; Re-run.
- **Connections** — manage instances; "Test connection"; masked token.
- **Sign in** — Auth.js.

Built using the frontend-design / shadcn / impeccable skills for polish.

## Error handling

- All API inputs validated with **zod** → 400 + clear message on failure.
- Lightdash query errors (4xx/5xx, async `status: error`/`expired`) → execution
  recorded as `error` with message; in a batch, other iterations continue and the
  aggregate surfaces an **error rate**.
- Timeouts — configurable max wait per query (default within Vercel `maxDuration`);
  exceeding → `status: timeout`. Capped backoff polling.
- Bad connection (wrong URL / invalid/expired token) — caught by "Test
  connection" and shown inline; runs fail fast with a readable error.
- Secrets — PAT encrypted at rest; never returned to client; `ENCRYPTION_KEY`, DB
  URL, and Auth secret in Vercel env vars.

## Testing

- **TDD throughout** (test-driven-development skill).
- **Engine unit tests (Vitest)** against a mocked Lightdash client: phase-timing
  capture, server/client reconciliation, percentile aggregation, error/timeout
  paths. Highest-value coverage.
- **API route tests** for validation and persistence.
- **Component checks** for the request builder and waterfall rendering.

## Repo notes

- New repo at `point-of-rental/apps` (remote `fiannello-por/apps`), `main`, no
  prior commits.
- `DESIGN.md` (UI style reference) committed to the repo root and used to derive
  the Tailwind/shadcn theme tokens.
- `.superpowers/` added to `.gitignore`.

## Open items for implementation planning

- Auth.js provider choice (credentials vs OAuth) — decide at plan time; both work
  with the Neon adapter.
- Exact polling interval/backoff and per-query timeout defaults.
- Vercel plan / `maxDuration` ceiling (affects max query wait + concurrency).
- Result fetching: first page only vs all pages for latency purposes (default:
  first page, configurable `pageSize`).
