# Lightdash Performance Control Plane — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Next.js + shadcn control plane, deployed to Vercel, that benchmarks the per-phase query latency of a self-hosted Lightdash instance via its v2 async API, supports concurrency testing, and saves runs for later review.

**Architecture:** A framework-agnostic measurement engine (`lib/engine/`) runs the Lightdash async flow (POST → poll → fetch results) server-side, timing each phase and reconciling client wall-clock against the server's `metadata.performance`. Next.js Route Handlers expose this engine; the browser orchestrates concurrency by fanning out N calls to `/api/run`. Postgres (Neon/Drizzle) stores auth users, shared connections (encrypted tokens), run batches, and per-query executions.

**Tech Stack:** Next.js (App Router) + TypeScript, Tailwind v4, shadcn/ui, Auth.js (NextAuth) credentials + JWT, Drizzle ORM + Vercel Postgres (Neon), bcryptjs, zod, Vitest, Recharts.

---

## Plan-time decisions (override if desired)

- **Auth:** Auth.js **Credentials** provider — email + password, hashed with `bcryptjs`, **JWT** session strategy. Includes sign-up and sign-in. (Swap to OAuth later without touching the rest.)
- **Result fetching:** fetch **first page only** for latency; `pageSize` default 500, configurable per request.
- **Vercel plan:** assume **Pro** → `/api/run` `maxDuration = 300`. On Hobby, cap is 60s; the per-query timeout default (45s) stays under both.
- **Connections** are shared across all logged-in users; `createdBy` tracked.
- **Polling:** start at 250ms, ×1.5 backoff, cap 2000ms; per-query hard timeout 45s (configurable).

## File structure

```
app/
  layout.tsx                      # root layout, fonts, theme
  globals.css                     # Tailwind v4 @theme tokens from DESIGN.md
  (auth)/sign-in/page.tsx
  (auth)/sign-up/page.tsx
  (app)/layout.tsx                # authed shell + top nav
  (app)/explorer/page.tsx
  (app)/concurrency/page.tsx
  (app)/history/page.tsx
  (app)/history/[id]/page.tsx
  (app)/connections/page.tsx
  api/
    auth/[...nextauth]/route.ts
    register/route.ts
    connections/route.ts
    connections/[id]/route.ts
    connections/[id]/test/route.ts
    lightdash/explores/route.ts
    lightdash/explores/[name]/route.ts
    lightdash/charts/route.ts
    run/route.ts
    test-runs/route.ts
    test-runs/[id]/route.ts
lib/
  engine/
    types.ts                      # EndpointType, QuerySpec, ExecutionResult, PhaseTimings
    lightdash-client.ts           # typed HTTP wrapper
    runner.ts                     # runSingleQuery orchestration + phase timing
    aggregate.ts                  # percentiles / stats
  crypto/encryption.ts            # AES-256-GCM token encrypt/decrypt
  db/
    client.ts                     # drizzle client
    schema.ts                     # all tables
  auth/config.ts                  # Auth.js config
  validation/schemas.ts           # zod schemas for API payloads
  concurrency/pool.ts             # client-side bounded concurrency runner
components/
  nav.tsx
  latency-waterfall.tsx
  ui/                             # shadcn components
drizzle.config.ts
vitest.config.ts
middleware.ts                     # route gating
```

---

## Phase 0 — Scaffolding

### Task 1: Initialize the Next.js app

**Files:**
- Create: project files via scaffolding tools in `point-of-rental/apps`

- [ ] **Step 1: Scaffold Next.js (TypeScript, Tailwind, App Router)**

The repo dir already exists with `.git`, `DESIGN.md`, `.gitignore`, `docs/`. Scaffold in place:

```bash
cd /Users/f/Documents/GitHub/point-of-rental/apps
npx create-next-app@latest . --ts --tailwind --eslint --app --src-dir=false --import-alias "@/*" --no-turbopack --use-npm
# When prompted that the directory is not empty, choose to proceed/keep existing files.
```

- [ ] **Step 2: Verify dev server boots**

Run: `npm run dev` then in another shell `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000`
Expected: `200`. Stop the dev server.

- [ ] **Step 3: Install runtime + dev dependencies**

```bash
npm i drizzle-orm @neondatabase/serverless next-auth@beta bcryptjs zod recharts
npm i -D drizzle-kit vitest @vitejs/plugin-react vite-tsconfig-paths @types/bcryptjs dotenv
```

- [ ] **Step 4: Add Vitest config**

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: { environment: 'node', globals: true, include: ['**/*.test.ts'] },
})
```

Add to `package.json` scripts: `"test": "vitest run"`, `"test:watch": "vitest"`.

- [ ] **Step 5: Verify the test runner**

Create `lib/_smoke.test.ts`:
```ts
import { test, expect } from 'vitest'
test('runner works', () => { expect(1 + 1).toBe(2) })
```
Run: `npm test`
Expected: 1 passed. Then delete `lib/_smoke.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "chore: scaffold Next.js app with Tailwind, Drizzle, Auth.js, Vitest"
```

### Task 2: Apply the DESIGN.md theme

**Files:**
- Modify: `app/globals.css`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Write theme tokens into globals.css**

Replace the `@theme` block in `app/globals.css` with the Tailwind v4 tokens from `DESIGN.md` (colors, fonts, spacing, radii, shadows). Source of truth is the "Tailwind v4" block in `DESIGN.md`:

```css
@import "tailwindcss";

@theme {
  --color-canvas-white: #ffffff;
  --color-ghost-gray: #f2f2f2;
  --color-subtle-ash: #e5e5e5;
  --color-midtone-gray: #737373;
  --color-rich-black: #0a0a0a;
  --color-deep-black: #000000;
  --color-callout-red: #c22b10;
  --color-success-green: #10c22b;
  --font-geist: 'Geist', ui-sans-serif, system-ui, sans-serif;
  --font-geist-mono: 'Geist Mono', ui-monospace, monospace;
  --radius-lg: 10px;
  --radius-xl: 14px;
  --radius-3xl: 26px;
  --radius-full: 9999px;
}

:root { --background: #ffffff; --foreground: #0a0a0a; }
body { background: var(--color-canvas-white); color: var(--color-rich-black); font-family: var(--font-geist); }
```

- [ ] **Step 2: Load Geist fonts in the root layout**

```tsx
// app/layout.tsx
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import './globals.css'

export const metadata = { title: 'LD Perf' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
```

Run: `npm i geist`

- [ ] **Step 3: Init shadcn/ui**

```bash
npx shadcn@latest init
# Base color: Neutral. CSS variables: yes. Confirm globals.css + tailwind paths.
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: apply DESIGN.md theme tokens and Geist fonts"
```

---

## Phase 1 — Database & crypto

### Task 3: Drizzle client + config

**Files:**
- Create: `lib/db/client.ts`, `drizzle.config.ts`, `.env.example`

- [ ] **Step 1: Add `.env.example`**

```
DATABASE_URL=postgres://...           # Neon / Vercel Postgres pooled URL
ENCRYPTION_KEY=                       # 64 hex chars (32 bytes). Generate: openssl rand -hex 32
AUTH_SECRET=                          # openssl rand -base64 33
```

Tell the user to create `.env.local` with real values (Neon URL from Vercel dashboard).

- [ ] **Step 2: Drizzle config**

```ts
// drizzle.config.ts
import 'dotenv/config'
import { defineConfig } from 'drizzle-kit'
export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
})
```

- [ ] **Step 3: DB client**

```ts
// lib/db/client.ts
import { drizzle } from 'drizzle-orm/neon-http'
import { neon } from '@neondatabase/serverless'
import * as schema from './schema'

const sql = neon(process.env.DATABASE_URL!)
export const db = drizzle(sql, { schema })
```

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: add Drizzle client and config"
```

### Task 4: Database schema

**Files:**
- Create: `lib/db/schema.ts`

- [ ] **Step 1: Define schema**

```ts
// lib/db/schema.ts
import { pgTable, text, timestamp, integer, jsonb, uuid, pgEnum, real } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const endpointType = pgEnum('endpoint_type', ['metric_query', 'sql', 'saved_chart', 'underlying_data'])
export const runMode = pgEnum('run_mode', ['single', 'concurrent'])
export const runStatus = pgEnum('run_status', ['running', 'completed', 'failed', 'partial'])
export const execStatus = pgEnum('exec_status', ['ok', 'error', 'timeout'])

export const connections = pgTable('connections', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  baseUrl: text('base_url').notNull(),
  projectUuid: text('project_uuid').notNull(),
  encryptedToken: text('encrypted_token').notNull(),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const testRuns = pgTable('test_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  connectionId: uuid('connection_id').references(() => connections.id).notNull(),
  endpointType: endpointType('endpoint_type').notNull(),
  payload: jsonb('payload').notNull(),
  mode: runMode('mode').notNull(),
  concurrency: integer('concurrency').notNull().default(1),
  iterations: integer('iterations').notNull().default(1),
  status: runStatus('status').notNull().default('running'),
  aggregates: jsonb('aggregates'),
  createdBy: uuid('created_by').references(() => users.id),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  finishedAt: timestamp('finished_at'),
})

export const queryExecutions = pgTable('query_executions', {
  id: uuid('id').defaultRandom().primaryKey(),
  testRunId: uuid('test_run_id').references(() => testRuns.id).notNull(),
  iterationIndex: integer('iteration_index').notNull(),
  status: execStatus('status').notNull(),
  submitMs: real('submit_ms'),
  queueTimeMs: real('queue_time_ms'),
  warehouseExecMs: real('warehouse_exec_ms'),
  pollOverheadMs: real('poll_overhead_ms'),
  resultsFetchMs: real('results_fetch_ms'),
  totalWallClockMs: real('total_wall_clock_ms'),
  lightdashQueryUuid: text('lightdash_query_uuid'),
  serverPerf: jsonb('server_perf'),
  rowCount: integer('row_count'),
  errorMessage: text('error_message'),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  finishedAt: timestamp('finished_at'),
})
```

- [ ] **Step 2: Generate migration**

Run: `npx drizzle-kit generate`
Expected: a SQL file appears in `drizzle/`.

- [ ] **Step 3: Push to DB (requires DATABASE_URL in .env.local)**

Run: `npx drizzle-kit push`
Expected: tables created. (If no DB yet, defer this step until Neon is provisioned in Task 22; note it in the commit.)

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: add database schema and migration"
```

### Task 5: Token encryption util (TDD)

**Files:**
- Create: `lib/crypto/encryption.ts`, `lib/crypto/encryption.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/crypto/encryption.test.ts
import { test, expect, beforeAll } from 'vitest'
import { encrypt, decrypt } from './encryption'

beforeAll(() => { process.env.ENCRYPTION_KEY = '0'.repeat(64) })

test('round-trips a secret', () => {
  const c = encrypt('my-token')
  expect(c).not.toContain('my-token')
  expect(decrypt(c)).toBe('my-token')
})

test('two encryptions of same input differ (random IV)', () => {
  expect(encrypt('x')).not.toBe(encrypt('x'))
})

test('tampered ciphertext fails to decrypt', () => {
  const c = encrypt('secret')
  const bad = c.slice(0, -2) + (c.endsWith('aa') ? 'bb' : 'aa')
  expect(() => decrypt(bad)).toThrow()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- encryption`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement AES-256-GCM**

```ts
// lib/crypto/encryption.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

function key() {
  const k = process.env.ENCRYPTION_KEY
  if (!k || k.length !== 64) throw new Error('ENCRYPTION_KEY must be 64 hex chars')
  return Buffer.from(k, 'hex')
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv.toString('hex'), tag.toString('hex'), enc.toString('hex')].join(':')
}

export function decrypt(payload: string): string {
  const [ivHex, tagHex, dataHex] = payload.split(':')
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- encryption`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add AES-256-GCM token encryption"
```

---

## Phase 2 — Measurement engine (TDD core)

### Task 6: Engine types

**Files:**
- Create: `lib/engine/types.ts`

- [ ] **Step 1: Define types**

```ts
// lib/engine/types.ts
export type EndpointType = 'metric_query' | 'sql' | 'saved_chart' | 'underlying_data'

export interface Connection { baseUrl: string; projectUuid: string; token: string }

export interface QuerySpec {
  endpointType: EndpointType
  // metric_query / underlying_data
  query?: { exploreName: string; dimensions: string[]; metrics: string[]; filters?: unknown; sorts?: unknown[]; limit?: number; tableCalculations?: unknown[] }
  // sql
  sql?: string
  // saved_chart
  chartUuid?: string
  pageSize?: number
}

export interface ServerPerformance { queueTimeMs?: number; initialQueryExecutionMs?: number; resultsPageExecutionMs?: number }

export interface PhaseTimings {
  submitMs: number
  queueTimeMs: number | null
  warehouseExecMs: number | null
  pollOverheadMs: number
  resultsFetchMs: number
  totalWallClockMs: number
}

export interface ExecutionResult {
  status: 'ok' | 'error' | 'timeout'
  timings: PhaseTimings
  lightdashQueryUuid: string | null
  serverPerf: ServerPerformance | null
  rowCount: number | null
  errorMessage: string | null
  raw?: unknown
}
```

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "feat: add engine types"
```

### Task 7: Aggregate stats (TDD)

**Files:**
- Create: `lib/engine/aggregate.ts`, `lib/engine/aggregate.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/engine/aggregate.test.ts
import { test, expect } from 'vitest'
import { percentile, summarize } from './aggregate'

test('percentile uses nearest-rank', () => {
  const xs = [10, 20, 30, 40, 50]
  expect(percentile(xs, 50)).toBe(30)
  expect(percentile(xs, 95)).toBe(50)
  expect(percentile(xs, 0)).toBe(10)
})

test('summarize computes stats and error rate', () => {
  const s = summarize([
    { status: 'ok', totalWallClockMs: 100 },
    { status: 'ok', totalWallClockMs: 200 },
    { status: 'error', totalWallClockMs: 0 },
  ])
  expect(s.count).toBe(3)
  expect(s.errorRate).toBeCloseTo(1 / 3)
  expect(s.min).toBe(100)
  expect(s.max).toBe(200)
  expect(s.mean).toBe(150)
  expect(s.p50).toBe(200) // p50 of [100,200] nearest-rank
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- aggregate`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// lib/engine/aggregate.ts
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  if (p <= 0) return sorted[0]
  const rank = Math.ceil((p / 100) * sorted.length)
  return sorted[Math.min(rank, sorted.length) - 1]
}

export interface ExecSummaryInput { status: 'ok' | 'error' | 'timeout'; totalWallClockMs: number }
export interface Aggregates { count: number; errorRate: number; min: number; max: number; mean: number; p50: number; p95: number; p99: number }

export function summarize(execs: ExecSummaryInput[]): Aggregates {
  const ok = execs.filter(e => e.status === 'ok').map(e => e.totalWallClockMs)
  const errors = execs.filter(e => e.status !== 'ok').length
  const mean = ok.length ? ok.reduce((a, b) => a + b, 0) / ok.length : 0
  return {
    count: execs.length,
    errorRate: execs.length ? errors / execs.length : 0,
    min: ok.length ? Math.min(...ok) : 0,
    max: ok.length ? Math.max(...ok) : 0,
    mean,
    p50: percentile(ok, 50),
    p95: percentile(ok, 95),
    p99: percentile(ok, 99),
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- aggregate`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add aggregate stats helpers"
```

### Task 8: Lightdash client (TDD)

**Files:**
- Create: `lib/engine/lightdash-client.ts`, `lib/engine/lightdash-client.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/engine/lightdash-client.test.ts
import { test, expect, vi } from 'vitest'
import { LightdashClient } from './lightdash-client'

const conn = { baseUrl: 'https://ld.example.com', projectUuid: 'p1', token: 'tok' }

test('createMetricQuery posts to the v2 endpoint with auth header and returns queryUuid', async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true, status: 200,
    json: async () => ({ status: 'ok', results: { queryUuid: 'q1' } }),
  })
  const c = new LightdashClient(conn, fetchMock)
  const uuid = await c.createQuery({ endpointType: 'metric_query', query: { exploreName: 'orders', dimensions: [], metrics: [] } })
  expect(uuid).toBe('q1')
  const [url, opts] = fetchMock.mock.calls[0]
  expect(url).toBe('https://ld.example.com/api/v2/projects/p1/query/metric-query')
  expect(opts.method).toBe('POST')
  expect(opts.headers.Authorization).toBe('ApiKey tok')
})

test('getResults fetches the results endpoint with paging', async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true, status: 200,
    json: async () => ({ status: 'ready', rows: [{ a: 1 }], totalResults: 1, metadata: { performance: { queueTimeMs: 5 } } }),
  })
  const c = new LightdashClient(conn, fetchMock)
  const r = await c.getResults('q1', 1, 500)
  expect(r.status).toBe('ready')
  expect(fetchMock.mock.calls[0][0]).toContain('/api/v2/projects/p1/query/q1?page=1&pageSize=500')
})

test('throws on non-ok HTTP', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'unauthorized' })
  const c = new LightdashClient(conn, fetchMock)
  await expect(c.createQuery({ endpointType: 'sql', sql: 'select 1' })).rejects.toThrow(/401/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lightdash-client`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// lib/engine/lightdash-client.ts
import type { Connection, QuerySpec } from './types'

type FetchFn = typeof fetch
const PATHS: Record<QuerySpec['endpointType'], string> = {
  metric_query: 'metric-query',
  sql: 'sql',
  saved_chart: 'chart',
  underlying_data: 'underlying-data',
}

export class LightdashClient {
  constructor(private conn: Connection, private fetchFn: FetchFn = fetch) {}

  private headers() {
    return { Authorization: `ApiKey ${this.conn.token}`, 'Content-Type': 'application/json' }
  }
  private base() { return `${this.conn.baseUrl.replace(/\/$/, '')}/api/v2/projects/${this.conn.projectUuid}` }

  private bodyFor(spec: QuerySpec): unknown {
    switch (spec.endpointType) {
      case 'metric_query':
      case 'underlying_data':
        return { context: 'api', query: spec.query }
      case 'sql':
        return { context: 'api', sql: spec.sql }
      case 'saved_chart':
        return { context: 'api', chartUuid: spec.chartUuid }
    }
  }

  async createQuery(spec: QuerySpec): Promise<string> {
    const res = await this.fetchFn(`${this.base()}/query/${PATHS[spec.endpointType]}`, {
      method: 'POST', headers: this.headers(), body: JSON.stringify(this.bodyFor(spec)),
    })
    if (!res.ok) throw new Error(`Lightdash create query failed: ${res.status} ${await res.text()}`)
    const json = await res.json()
    return json.results.queryUuid as string
  }

  async getResults(queryUuid: string, page = 1, pageSize = 500): Promise<any> {
    const res = await this.fetchFn(`${this.base()}/query/${queryUuid}?page=${page}&pageSize=${pageSize}`, {
      method: 'GET', headers: this.headers(),
    })
    if (!res.ok) throw new Error(`Lightdash get results failed: ${res.status} ${await res.text()}`)
    return res.json()
  }

  // Discovery (used by API explorer pickers)
  async listExplores(): Promise<any> {
    const res = await this.fetchFn(`${this.conn.baseUrl.replace(/\/$/, '')}/api/v1/projects/${this.conn.projectUuid}/explores`, { headers: this.headers() })
    if (!res.ok) throw new Error(`listExplores failed: ${res.status}`)
    return res.json()
  }
  async getExplore(name: string): Promise<any> {
    const res = await this.fetchFn(`${this.conn.baseUrl.replace(/\/$/, '')}/api/v1/projects/${this.conn.projectUuid}/explores/${name}`, { headers: this.headers() })
    if (!res.ok) throw new Error(`getExplore failed: ${res.status}`)
    return res.json()
  }
  async listCharts(): Promise<any> {
    const res = await this.fetchFn(`${this.conn.baseUrl.replace(/\/$/, '')}/api/v1/projects/${this.conn.projectUuid}/charts`, { headers: this.headers() })
    if (!res.ok) throw new Error(`listCharts failed: ${res.status}`)
    return res.json()
  }
}
```

> Note for implementer: confirm the auth scheme header against the target instance during Task 22 smoke test — Lightdash personal access tokens use `Authorization: ApiKey <token>`. Adjust the one `headers()` method if the instance differs.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lightdash-client`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add Lightdash API client"
```

### Task 9: Runner — orchestration + phase timing (TDD)

**Files:**
- Create: `lib/engine/runner.ts`, `lib/engine/runner.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/engine/runner.test.ts
import { test, expect, vi } from 'vitest'
import { runSingleQuery } from './runner'

function fakeClock(seq: number[]) { let i = 0; return () => seq[Math.min(i++, seq.length - 1)] }

test('happy path: ready after one polling cycle, computes phases', async () => {
  // now() sequence (ms): start, after submit, poll1 start, poll1 end(ready)
  const now = fakeClock([0, 100, 100, 900])
  const client = {
    createQuery: vi.fn().mockResolvedValue('q1'),
    getResults: vi.fn().mockResolvedValue({
      status: 'ready', rows: [{ a: 1 }], totalResults: 1,
      metadata: { performance: { queueTimeMs: 50, initialQueryExecutionMs: 600, resultsPageExecutionMs: 120 } },
    }),
  } as any
  const r = await runSingleQuery(client, { endpointType: 'sql', sql: 'select 1' }, { now, sleep: async () => {}, timeoutMs: 45000 })
  expect(r.status).toBe('ok')
  expect(r.lightdashQueryUuid).toBe('q1')
  expect(r.rowCount).toBe(1)
  expect(r.timings.submitMs).toBe(100)
  expect(r.timings.queueTimeMs).toBe(50)
  expect(r.timings.warehouseExecMs).toBe(600)
  expect(r.timings.totalWallClockMs).toBe(900)
  // pollOverhead = wait-until-ready wall (800) - (queue 50 + warehouse 600) = 150
  expect(r.timings.pollOverheadMs).toBe(150)
})

test('error status from results yields error result', async () => {
  const now = fakeClock([0, 10, 10, 20])
  const client = {
    createQuery: vi.fn().mockResolvedValue('q1'),
    getResults: vi.fn().mockResolvedValue({ status: 'error', error: 'boom' }),
  } as any
  const r = await runSingleQuery(client, { endpointType: 'sql', sql: 'x' }, { now, sleep: async () => {}, timeoutMs: 45000 })
  expect(r.status).toBe('error')
  expect(r.errorMessage).toBe('boom')
})

test('timeout when never ready', async () => {
  const seq = [0, 10]; let i = 0
  const now = () => (i < seq.length ? seq[i++] : 999999) // jumps past timeout
  const client = {
    createQuery: vi.fn().mockResolvedValue('q1'),
    getResults: vi.fn().mockResolvedValue({ status: 'executing' }),
  } as any
  const r = await runSingleQuery(client, { endpointType: 'sql', sql: 'x' }, { now, sleep: async () => {}, timeoutMs: 1000 })
  expect(r.status).toBe('timeout')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- runner`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// lib/engine/runner.ts
import type { ExecutionResult, QuerySpec } from './types'

interface RunnerClient {
  createQuery(spec: QuerySpec): Promise<string>
  getResults(queryUuid: string, page?: number, pageSize?: number): Promise<any>
}
interface RunOpts { now?: () => number; sleep?: (ms: number) => Promise<void>; timeoutMs?: number; pageSize?: number }

const READY = 'ready', ERROR_STATES = new Set(['error', 'expired', 'cancelled'])

export async function runSingleQuery(client: RunnerClient, spec: QuerySpec, opts: RunOpts = {}): Promise<ExecutionResult> {
  const now = opts.now ?? (() => Date.now())
  const sleep = opts.sleep ?? ((ms: number) => new Promise(r => setTimeout(r, ms)))
  const timeoutMs = opts.timeoutMs ?? 45000
  const pageSize = opts.pageSize ?? spec.pageSize ?? 500

  const t0 = now()
  let queryUuid: string | null = null
  try {
    queryUuid = await client.createQuery(spec)
  } catch (e) {
    return errorResult(now() - t0, queryUuid, (e as Error).message)
  }
  const submitMs = now() - t0

  const waitStart = now()
  let delay = 250
  let result: any
  while (true) {
    const pollStart = now()
    if (pollStart - waitStart > timeoutMs) {
      return { status: 'timeout', timings: timings(submitMs, null, null, now() - waitStart - 0, 0, now() - t0), lightdashQueryUuid: queryUuid, serverPerf: null, rowCount: null, errorMessage: `Timed out after ${timeoutMs}ms` }
    }
    try {
      result = await client.getResults(queryUuid!, 1, pageSize)
    } catch (e) {
      return errorResult(now() - t0, queryUuid, (e as Error).message)
    }
    if (result.status === READY) break
    if (ERROR_STATES.has(result.status)) return errorResult(now() - t0, queryUuid, result.error ?? `status: ${result.status}`)
    await sleep(delay)
    delay = Math.min(Math.round(delay * 1.5), 2000)
  }

  const waitWall = now() - waitStart
  const perf = result?.metadata?.performance ?? null
  const queueTimeMs = perf?.queueTimeMs ?? null
  const warehouseExecMs = perf?.initialQueryExecutionMs ?? null
  const resultsFetchMs = perf?.resultsPageExecutionMs ?? 0
  const accountedServer = (queueTimeMs ?? 0) + (warehouseExecMs ?? 0)
  const pollOverheadMs = Math.max(0, waitWall - accountedServer)
  const totalWallClockMs = now() - t0

  return {
    status: 'ok',
    timings: { submitMs, queueTimeMs, warehouseExecMs, pollOverheadMs, resultsFetchMs, totalWallClockMs },
    lightdashQueryUuid: queryUuid,
    serverPerf: perf,
    rowCount: result.totalResults ?? (Array.isArray(result.rows) ? result.rows.length : null),
    errorMessage: null,
    raw: result,
  }
}

function timings(submitMs: number, q: number | null, w: number | null, pollOverheadMs: number, resultsFetchMs: number, totalWallClockMs: number) {
  return { submitMs, queueTimeMs: q, warehouseExecMs: w, pollOverheadMs, resultsFetchMs, totalWallClockMs }
}
function errorResult(totalWallClockMs: number, uuid: string | null, msg: string): ExecutionResult {
  return { status: 'error', timings: timings(0, null, null, 0, 0, totalWallClockMs), lightdashQueryUuid: uuid, serverPerf: null, rowCount: null, errorMessage: msg }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- runner`
Expected: 3 passed. If the timeout test's phase math asserts differ, align the test's clock sequence to the implementation (the behavior — status `timeout` — is what matters).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add query runner with phase timing and reconciliation"
```

---

## Phase 3 — Auth

### Task 10: Auth.js credentials + gating

**Files:**
- Create: `lib/auth/config.ts`, `app/api/auth/[...nextauth]/route.ts`, `app/api/register/route.ts`, `middleware.ts`, `app/(auth)/sign-in/page.tsx`, `app/(auth)/sign-up/page.tsx`

- [ ] **Step 1: Auth config (credentials + JWT)**

```ts
// lib/auth/config.ts
import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: 'jwt' },
  pages: { signIn: '/sign-in' },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(creds) {
        const email = String(creds?.email ?? '')
        const password = String(creds?.password ?? '')
        const [u] = await db.select().from(users).where(eq(users.email, email)).limit(1)
        if (!u) return null
        if (!(await bcrypt.compare(password, u.passwordHash))) return null
        return { id: u.id, email: u.email, name: u.name ?? undefined }
      },
    }),
  ],
})
```

- [ ] **Step 2: Route handler + middleware**

```ts
// app/api/auth/[...nextauth]/route.ts
import { handlers } from '@/lib/auth/config'
export const { GET, POST } = handlers
```

```ts
// middleware.ts
export { auth as middleware } from '@/lib/auth/config'
export const config = { matcher: ['/((?!api/auth|api/register|sign-in|sign-up|_next|favicon.ico).*)'] }
```

- [ ] **Step 3: Registration endpoint**

```ts
// app/api/register/route.ts
import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

const Body = z.object({ email: z.string().email(), password: z.string().min(8), name: z.string().optional() })

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  const { email, password, name } = parsed.data
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1)
  if (existing) return NextResponse.json({ error: 'Email already registered' }, { status: 409 })
  const passwordHash = await bcrypt.hash(password, 10)
  const [u] = await db.insert(users).values({ email, passwordHash, name }).returning({ id: users.id })
  return NextResponse.json({ id: u.id }, { status: 201 })
}
```

- [ ] **Step 4: Sign-in / sign-up pages**

Build `app/(auth)/sign-in/page.tsx` and `sign-up/page.tsx` as client components using shadcn `Card`, `Input`, `Button`, `Label`. Sign-in calls `signIn('credentials', { email, password, callbackUrl: '/explorer' })`. Sign-up POSTs to `/api/register` then calls `signIn`. Install components:

```bash
npx shadcn@latest add card input button label sonner
```

- [ ] **Step 5: Verify gating**

Run: `npm run dev`, visit `http://localhost:3000/explorer` unauthenticated → redirected to `/sign-in`. Sign up, then reach `/explorer`.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: add credentials auth, registration, and route gating"
```

---

## Phase 4 — API routes

### Task 11: Validation schemas

**Files:**
- Create: `lib/validation/schemas.ts`

- [ ] **Step 1: Define zod schemas**

```ts
// lib/validation/schemas.ts
import { z } from 'zod'

export const connectionInput = z.object({
  name: z.string().min(1),
  baseUrl: z.string().url(),
  projectUuid: z.string().min(1),
  token: z.string().min(1),
})

export const querySpecSchema = z.object({
  endpointType: z.enum(['metric_query', 'sql', 'saved_chart', 'underlying_data']),
  query: z.object({
    exploreName: z.string(),
    dimensions: z.array(z.string()),
    metrics: z.array(z.string()),
    filters: z.unknown().optional(),
    sorts: z.array(z.unknown()).optional(),
    limit: z.number().optional(),
  }).optional(),
  sql: z.string().optional(),
  chartUuid: z.string().optional(),
  pageSize: z.number().optional(),
})

export const runInput = z.object({
  connectionId: z.string().uuid(),
  testRunId: z.string().uuid().optional(),
  iterationIndex: z.number().default(0),
  spec: querySpecSchema,
})

export const testRunInput = z.object({
  connectionId: z.string().uuid(),
  spec: querySpecSchema,
  mode: z.enum(['single', 'concurrent']),
  concurrency: z.number().min(1).max(200).default(1),
  iterations: z.number().min(1).max(2000).default(1),
})
```

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "feat: add zod validation schemas"
```

### Task 12: Connections API

**Files:**
- Create: `app/api/connections/route.ts`, `app/api/connections/[id]/route.ts`, `app/api/connections/[id]/test/route.ts`
- Create: `lib/connections/service.ts`

- [ ] **Step 1: Service to load a usable Connection (decrypts token)**

```ts
// lib/connections/service.ts
import { db } from '@/lib/db/client'
import { connections } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { decrypt } from '@/lib/crypto/encryption'
import type { Connection } from '@/lib/engine/types'

export async function loadConnection(id: string): Promise<Connection | null> {
  const [c] = await db.select().from(connections).where(eq(connections.id, id)).limit(1)
  if (!c) return null
  return { baseUrl: c.baseUrl, projectUuid: c.projectUuid, token: decrypt(c.encryptedToken) }
}
```

- [ ] **Step 2: List + create (token encrypted, never returned)**

```ts
// app/api/connections/route.ts
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { db } from '@/lib/db/client'
import { connections } from '@/lib/db/schema'
import { encrypt } from '@/lib/crypto/encryption'
import { connectionInput } from '@/lib/validation/schemas'

export async function GET() {
  const session = await auth(); if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const rows = await db.select({ id: connections.id, name: connections.name, baseUrl: connections.baseUrl, projectUuid: connections.projectUuid, createdAt: connections.createdAt }).from(connections)
  return NextResponse.json(rows)
}

export async function POST(req: Request) {
  const session = await auth(); if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const parsed = connectionInput.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  const { name, baseUrl, projectUuid, token } = parsed.data
  const [row] = await db.insert(connections).values({ name, baseUrl, projectUuid, encryptedToken: encrypt(token), createdBy: (session.user as any).id }).returning({ id: connections.id })
  return NextResponse.json({ id: row.id }, { status: 201 })
}
```

- [ ] **Step 3: Patch + delete `[id]`**

Implement `PATCH` (update name/baseUrl/projectUuid; re-encrypt token only if provided) and `DELETE` in `app/api/connections/[id]/route.ts`, both guarded by `auth()`.

- [ ] **Step 4: Test connection endpoint**

```ts
// app/api/connections/[id]/test/route.ts
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { loadConnection } from '@/lib/connections/service'
import { LightdashClient } from '@/lib/engine/lightdash-client'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth(); if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  const conn = await loadConnection(id); if (!conn) return NextResponse.json({ error: 'not found' }, { status: 404 })
  try { await new LightdashClient(conn).listExplores(); return NextResponse.json({ ok: true }) }
  catch (e) { return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 200 }) }
}
```

- [ ] **Step 5: Verify**

With the dev server + a real connection, `curl -X POST .../api/connections` to create, then `.../test`. Expected `{ ok: true }`.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: add connections CRUD and test endpoint"
```

### Task 13: Lightdash discovery proxies

**Files:**
- Create: `app/api/lightdash/explores/route.ts`, `app/api/lightdash/explores/[name]/route.ts`, `app/api/lightdash/charts/route.ts`

- [ ] **Step 1: Implement the three proxies**

Each reads `connectionId` from query string, calls `auth()`, `loadConnection`, then the matching `LightdashClient` discovery method, returning the JSON. Example:

```ts
// app/api/lightdash/explores/route.ts
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { loadConnection } from '@/lib/connections/service'
import { LightdashClient } from '@/lib/engine/lightdash-client'

export async function GET(req: Request) {
  const session = await auth(); if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const id = new URL(req.url).searchParams.get('connectionId')
  if (!id) return NextResponse.json({ error: 'connectionId required' }, { status: 400 })
  const conn = await loadConnection(id); if (!conn) return NextResponse.json({ error: 'not found' }, { status: 404 })
  try { return NextResponse.json(await new LightdashClient(conn).listExplores()) }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 502 }) }
}
```

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "feat: add Lightdash discovery proxy endpoints"
```

### Task 14: Run endpoint

**Files:**
- Create: `app/api/run/route.ts`

- [ ] **Step 1: Implement `/api/run`**

```ts
// app/api/run/route.ts
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { loadConnection } from '@/lib/connections/service'
import { LightdashClient } from '@/lib/engine/lightdash-client'
import { runSingleQuery } from '@/lib/engine/runner'
import { db } from '@/lib/db/client'
import { queryExecutions } from '@/lib/db/schema'
import { runInput } from '@/lib/validation/schemas'

export const maxDuration = 300 // Vercel Pro. On Hobby this is capped at 60.

export async function POST(req: Request) {
  const session = await auth(); if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const parsed = runInput.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  const { connectionId, testRunId, iterationIndex, spec } = parsed.data
  const conn = await loadConnection(connectionId); if (!conn) return NextResponse.json({ error: 'connection not found' }, { status: 404 })

  const result = await runSingleQuery(new LightdashClient(conn), spec as any, { timeoutMs: 45000 })

  if (testRunId) {
    await db.insert(queryExecutions).values({
      testRunId, iterationIndex, status: result.status,
      submitMs: result.timings.submitMs, queueTimeMs: result.timings.queueTimeMs ?? undefined,
      warehouseExecMs: result.timings.warehouseExecMs ?? undefined, pollOverheadMs: result.timings.pollOverheadMs,
      resultsFetchMs: result.timings.resultsFetchMs, totalWallClockMs: result.timings.totalWallClockMs,
      lightdashQueryUuid: result.lightdashQueryUuid ?? undefined, serverPerf: result.serverPerf ?? undefined,
      rowCount: result.rowCount ?? undefined, errorMessage: result.errorMessage ?? undefined, finishedAt: new Date(),
    })
  }
  return NextResponse.json(result)
}
```

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "feat: add /api/run measurement endpoint"
```

### Task 15: Test-runs API

**Files:**
- Create: `app/api/test-runs/route.ts`, `app/api/test-runs/[id]/route.ts`

- [ ] **Step 1: Create + list**

`POST /api/test-runs` validates with `testRunInput`, inserts a `test_runs` row (status `running`), returns `{ id }`. `GET` lists recent runs (id, connection, endpointType, mode, status, startedAt, aggregates) ordered by `startedAt desc`, limit 100.

- [ ] **Step 2: Detail + finalize**

`GET /api/test-runs/[id]` returns the run plus its `query_executions`. `PATCH /api/test-runs/[id]` loads executions, computes aggregates via `summarize(...)` over `totalWallClockMs`, sets `status` (`completed`, or `partial` if any non-ok), `finishedAt`, and stores `aggregates`.

```ts
// excerpt for PATCH finalize
import { summarize } from '@/lib/engine/aggregate'
// ...load executions for [id]...
const agg = summarize(execs.map(e => ({ status: e.status, totalWallClockMs: e.totalWallClockMs ?? 0 })))
const status = execs.some(e => e.status !== 'ok') ? 'partial' : 'completed'
await db.update(testRuns).set({ aggregates: agg, status, finishedAt: new Date() }).where(eq(testRuns.id, id))
```

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: add test-runs create/list/detail/finalize"
```

---

## Phase 5 — UI

### Task 16: App shell + nav

**Files:**
- Create: `app/(app)/layout.tsx`, `components/nav.tsx`
- Modify: install shadcn components

- [ ] **Step 1: Install components**

```bash
npx shadcn@latest add card button input label select badge table tabs separator skeleton sonner
```

- [ ] **Step 2: Build nav + authed layout**

`components/nav.tsx`: top bar with brand "LD Perf", links Explorer/Concurrency/History/Connections (active state via `usePathname`), and a sign-out button (`signOut`). `app/(app)/layout.tsx`: `await auth()`; if no session redirect to `/sign-in`; render `<Nav/>` + `{children}` in a centered max-width container per DESIGN.md.

- [ ] **Step 3: Verify**

Run `npm run dev`; authed, the shell + nav render and links route.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: add authed app shell and navigation"
```

### Task 17: Connections page

**Files:**
- Create: `app/(app)/connections/page.tsx`, `components/connection-form.tsx`

- [ ] **Step 1: Build the page**

Client component: lists connections (`GET /api/connections`), a form (name/baseUrl/projectUuid/token) that POSTs, a "Test connection" button per row (`POST /api/connections/[id]/test`) showing a success/error toast, edit (PATCH) and delete (DELETE). Token field is write-only; never displayed.

- [ ] **Step 2: Verify** — create a connection, test it, see a success toast.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: add connections management page"
```

### Task 18: Latency waterfall component (TDD on the math)

**Files:**
- Create: `lib/engine/waterfall.ts`, `lib/engine/waterfall.test.ts`, `components/latency-waterfall.tsx`

- [ ] **Step 1: Write the failing test for bar geometry**

```ts
// lib/engine/waterfall.test.ts
import { test, expect } from 'vitest'
import { toBars } from './waterfall'

test('produces sequential bars summing across phases as % of total', () => {
  const bars = toBars({ submitMs: 100, queueTimeMs: 70, warehouseExecMs: 900, pollOverheadMs: 150, resultsFetchMs: 280, totalWallClockMs: 1500 })
  expect(bars.map(b => b.label)).toEqual(['Submit', 'Queue', 'Warehouse', 'Poll overhead', 'Results fetch'])
  expect(bars[0].leftPct).toBeCloseTo(0)
  expect(bars[0].widthPct).toBeCloseTo(100 * 100 / 1500)
  expect(bars[2].source).toBe('server')
  // bars are sequential: each left = previous left + previous width
  for (let i = 1; i < bars.length; i++) {
    expect(bars[i].leftPct).toBeCloseTo(bars[i - 1].leftPct + bars[i - 1].widthPct)
  }
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- waterfall`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// lib/engine/waterfall.ts
import type { PhaseTimings } from './types'
export interface Bar { label: string; ms: number; leftPct: number; widthPct: number; source: 'server' | 'client' }

export function toBars(t: PhaseTimings): Bar[] {
  const total = t.totalWallClockMs || 1
  const phases: Array<{ label: string; ms: number; source: 'server' | 'client' }> = [
    { label: 'Submit', ms: t.submitMs, source: 'client' },
    { label: 'Queue', ms: t.queueTimeMs ?? 0, source: 'server' },
    { label: 'Warehouse', ms: t.warehouseExecMs ?? 0, source: 'server' },
    { label: 'Poll overhead', ms: t.pollOverheadMs, source: 'client' },
    { label: 'Results fetch', ms: t.resultsFetchMs, source: 'client' },
  ]
  let cursor = 0
  return phases.map(p => {
    const leftPct = (cursor / total) * 100
    const widthPct = (p.ms / total) * 100
    cursor += p.ms
    return { ...p, leftPct, widthPct }
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- waterfall`
Expected: 1 passed.

- [ ] **Step 5: Build the component**

`components/latency-waterfall.tsx`: takes `PhaseTimings`, renders the headline stats + bars from `toBars()`. Filled bars (`bg-rich-black`) for `source === 'server'`, outlined for `client`, ms label to the right, per the approved mockup (explicit DESIGN.md colors, tabular-nums).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: add latency waterfall component"
```

### Task 19: Explorer page

**Files:**
- Create: `app/(app)/explorer/page.tsx`, `components/request-builder.tsx`

- [ ] **Step 1: Build the request builder**

Client component: connection `Select`; endpoint `Tabs`/segmented (`metric_query`/`sql`/`saved_chart`/`underlying_data`). For `metric_query`/`underlying_data`: explore Select (from `/api/lightdash/explores?connectionId=`), dimension/metric multi-select (from `/api/lightdash/explores/[name]`), limit. For `sql`: a mono textarea. For `saved_chart`: chart Select (from `/api/lightdash/charts`).

- [ ] **Step 2: Wire Run**

On Run: `POST /api/test-runs` (mode `single`) → get id → `POST /api/run` with `{ connectionId, testRunId, iterationIndex: 0, spec }` → `PATCH /api/test-runs/[id]` to finalize → render `<LatencyWaterfall>` + raw JSON (collapsible mono block).

- [ ] **Step 3: Verify** — run a real metric query; waterfall + JSON appear.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: add API explorer page"
```

### Task 20: Concurrency page + bounded pool (TDD)

**Files:**
- Create: `lib/concurrency/pool.ts`, `lib/concurrency/pool.test.ts`, `app/(app)/concurrency/page.tsx`

- [ ] **Step 1: Write the failing test for the pool**

```ts
// lib/concurrency/pool.test.ts
import { test, expect, vi } from 'vitest'
import { runPool } from './pool'

test('runs all tasks but never exceeds the concurrency limit', async () => {
  let active = 0, maxActive = 0
  const task = () => new Promise<number>(res => {
    active++; maxActive = Math.max(maxActive, active)
    setTimeout(() => { active--; res(1) }, 5)
  })
  const results = await runPool(10, 3, () => task())
  expect(results).toHaveLength(10)
  expect(maxActive).toBeLessThanOrEqual(3)
})

test('reports progress per completion', async () => {
  const onProgress = vi.fn()
  await runPool(4, 2, async () => 1, onProgress)
  expect(onProgress).toHaveBeenCalledTimes(4)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- pool`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// lib/concurrency/pool.ts
export async function runPool<T>(
  total: number, limit: number,
  task: (index: number) => Promise<T>,
  onProgress?: (done: number, result: T, index: number) => void,
): Promise<T[]> {
  const results = new Array<T>(total)
  let next = 0, done = 0
  async function worker() {
    while (next < total) {
      const i = next++
      const r = await task(i)
      results[i] = r; done++
      onProgress?.(done, r, i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, total) }, () => worker()))
  return results
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- pool`
Expected: 2 passed.

- [ ] **Step 5: Build the concurrency page**

Reuse `<RequestBuilder>`; add concurrency N + iterations inputs. On Run: `POST /api/test-runs` (mode `concurrent`) → `runPool(iterations, N, i => fetch('/api/run', {...spec, testRunId, iterationIndex: i}).then(r=>r.json()), onProgress)` → live-update aggregates (compute client-side via `summarize` for display, or refetch) and a list of per-run waterfalls → `PATCH` finalize. Show p50/p95/p99, error rate, count.

- [ ] **Step 6: Verify** — run N=5, iterations=20 against a real connection; aggregates populate live.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: add concurrency test page with bounded pool"
```

### Task 21: History list + detail

**Files:**
- Create: `app/(app)/history/page.tsx`, `app/(app)/history/[id]/page.tsx`

- [ ] **Step 1: History list**

Server component: `GET /api/test-runs` → table (started, connection, endpoint, mode, N×iters, p50/p95, error rate, status). Each row links to detail.

- [ ] **Step 2: Detail + re-run**

`history/[id]`: fetch detail (run + executions), render aggregates + a `<LatencyWaterfall>` per execution (or for the first/representative one). A "Re-run" button navigates to Explorer/Concurrency pre-filled with the run's `payload` (pass via query param or client store).

- [ ] **Step 3: Verify** — past runs list; opening one shows its breakdown; re-run pre-fills.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: add run history list and detail"
```

---

## Phase 6 — Deploy

### Task 22: Vercel deploy

**Files:**
- Create: `README.md`, `vercel.json` (if needed for region)

- [ ] **Step 1: Provision Neon via Vercel**

User action: in Vercel dashboard, create the project (link the `fiannello-por/apps` repo) and add a Postgres (Neon) store; copy `DATABASE_URL`. Set env vars `DATABASE_URL`, `ENCRYPTION_KEY` (`openssl rand -hex 32`), `AUTH_SECRET` (`openssl rand -base64 33`). Document all three in `README.md`.

- [ ] **Step 2: Run migrations against the provisioned DB**

Run: `npx drizzle-kit push` (with the production `DATABASE_URL` in `.env.local`).
Expected: tables created.

- [ ] **Step 3: Set function region near Render**

If Lightdash on Render is in a known region, pin the Vercel region (e.g. `vercel.json` → `{ "functions": { "app/api/run/route.ts": { "maxDuration": 300 } }, "regions": ["iad1"] }`). Note in README that region proximity affects measured latency.

- [ ] **Step 4: Deploy**

Use the **deploy-to-vercel** skill to deploy and get the preview/production URL.

- [ ] **Step 5: Smoke test**

Sign up, add the real Lightdash connection, "Test connection" → ok, run a metric query in Explorer → waterfall renders with real numbers. **Confirm the `Authorization: ApiKey <token>` scheme works against the live instance**; if not, fix `lightdash-client.ts` `headers()` and redeploy.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "docs: add README and Vercel deploy config"
```

---

## Self-review notes

- **Spec coverage:** auth (T10), connections + encryption (T5, T12), API explorer endpoints + UI (T8, T13, T19), latency decomposition + reconciliation (T6, T9, T18), concurrency (T20), run persistence + history (T4, T14, T15, T21), shared connections (T12), error/timeout handling (T9, T12–T15), TDD coverage on all engine logic (T5, T7, T8, T9, T18, T20). Trends intentionally absent (descoped).
- **Deferred-but-allowed:** headless batch reuses `runSingleQuery`; scheduled runs would add a worker calling the same engine — no rewrite.
- **Types consistency:** `QuerySpec`, `ExecutionResult`, `PhaseTimings` defined in T6 and used unchanged in T8/T9/T14/T18; `summarize`/`Aggregates` from T7 used in T15/T20; `runPool` from T20 used in concurrency page.
```
