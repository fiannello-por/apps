# Task 20: Concurrency Pool + Concurrency Test Page

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a bounded async concurrency pool (TDD) and a Concurrency test page that executes many parallel Lightdash queries, shows live aggregate stats, and a per-run results table with expandable waterfall.

**Architecture:** A pure `runPool` utility in `lib/concurrency/pool.ts` manages concurrency limits; the page at `app/(app)/concurrency/page.tsx` wires `RequestBuilder` + `runPool` together, calling `/api/test-runs` to create a run, `/api/run` for each iteration, and `PATCH /api/test-runs/:id` to finalize. Live `summarize()` aggregates display as the pool drains.

**Tech Stack:** Next.js 16, React 19, Vitest (node env), shadcn/ui (card, button, input, label, badge, table), `sonner` toasts, `@/lib/engine/aggregate#summarize`, `@/components/request-builder`, `@/components/latency-waterfall`.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `lib/concurrency/pool.test.ts` | Create | Vitest tests for `runPool` |
| `lib/concurrency/pool.ts` | Create | `runPool` bounded concurrency implementation |
| `app/(app)/concurrency/page.tsx` | Create | Concurrency test page (client component) |

---

### Task 1: Write failing pool tests

**Files:**
- Create: `lib/concurrency/pool.test.ts`

- [ ] **Step 1: Create the test file with both tests**

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

- [ ] **Step 2: Run `npm test -- pool` in /Users/f/Documents/GitHub/point-of-rental/apps — expect FAIL**

```bash
cd /Users/f/Documents/GitHub/point-of-rental/apps && npm test -- pool
```

Expected: 2 tests fail with "Cannot find module './pool'" or similar.

---

### Task 2: Implement `runPool` and make tests pass

**Files:**
- Create: `lib/concurrency/pool.ts`

- [ ] **Step 1: Create the implementation**

```ts
// lib/concurrency/pool.ts
export async function runPool<T>(
  total: number,
  limit: number,
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

- [ ] **Step 2: Run `npm test -- pool` — expect 2 passed**

```bash
cd /Users/f/Documents/GitHub/point-of-rental/apps && npm test -- pool
```

Expected output:
```
✓ lib/concurrency/pool.test.ts (2)
  ✓ runs all tasks but never exceeds the concurrency limit
  ✓ reports progress per completion

Test Files  1 passed (1)
Tests  2 passed (2)
```

- [ ] **Step 3: Run full test suite — expect all green**

```bash
cd /Users/f/Documents/GitHub/point-of-rental/apps && npm test
```

Expected: All previously-passing tests still pass.

- [ ] **Step 4: Commit**

```bash
cd /Users/f/Documents/GitHub/point-of-rental/apps && git add lib/concurrency/pool.test.ts lib/concurrency/pool.ts && git commit -m "feat: add bounded concurrency pool (TDD)"
```

---

### Task 3: Build the Concurrency page

**Files:**
- Create: `app/(app)/concurrency/page.tsx`

This is a large client component. It has these sections:
1. **Left column:** `RequestBuilder` + N/Iterations inputs + Run button
2. **Right column — Live Aggregates panel** (visual focus): count, p50/p95/p99, min/max/mean, errorRate — updates after each completed iteration
3. **Results Table** (below): iteration #, status badge, wall-clock ms, warehouse ms. Capped to 200 rows with a "Showing 200 of N" note. Click row → show its waterfall below table.

Error isolation: each per-iteration fetch is wrapped in try/catch, returning a synthetic `ExecutionResult` with `status:'error'` on fetch failure — it never crashes the pool.

- [ ] **Step 1: Create the page**

```tsx
// app/(app)/concurrency/page.tsx
'use client'

import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Separator } from '@/components/ui/separator'
import { RequestBuilder, type RequestBuilderValue } from '@/components/request-builder'
import { LatencyWaterfall } from '@/components/latency-waterfall'
import { runPool } from '@/lib/concurrency/pool'
import { summarize, type Aggregates } from '@/lib/engine/aggregate'
import type { ExecutionResult } from '@/lib/engine/types'

// ── Constants ─────────────────────────────────────────────────────────────────

const TABLE_CAP = 200

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`
  return `${Math.round(ms)}ms`
}

function isSpecComplete(v: RequestBuilderValue): boolean {
  const { endpointType, spec } = v
  if (endpointType === 'sql') return !!(spec.sql && spec.sql.trim().length > 0)
  if (endpointType === 'saved_chart') return !!(spec.chartUuid && spec.chartUuid.length > 0)
  return !!(spec.query?.exploreName)
}

function makeSyntheticError(errorMessage: string): ExecutionResult {
  return {
    status: 'error',
    timings: {
      submitMs: 0,
      queueTimeMs: null,
      warehouseExecMs: null,
      pollOverheadMs: 0,
      resultsFetchMs: 0,
      totalWallClockMs: 0,
    },
    lightdashQueryUuid: null,
    serverPerf: null,
    rowCount: null,
    errorMessage,
  }
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatCell({
  label,
  value,
  emphasis,
}: {
  label: string
  value: string
  emphasis?: boolean
}) {
  return (
    <div className="flex flex-col gap-0.5 min-w-[80px]">
      <span className="text-[11px] font-medium uppercase tracking-wider text-midtone-gray">
        {label}
      </span>
      <span
        className={[
          'text-[20px] font-semibold leading-none tabular-nums',
          emphasis ? 'text-callout-red' : 'text-rich-black',
        ].join(' ')}
      >
        {value}
      </span>
    </div>
  )
}

function AggregatePanel({
  agg,
  done,
  total,
}: {
  agg: Aggregates | null
  done: number
  total: number
}) {
  if (!agg || done === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-[14px] font-medium text-rich-black">No data yet</p>
        <p className="mt-1 text-[13px] text-midtone-gray">
          Configure a request and click Run test.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Progress */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-1.5 bg-ghost-gray rounded-full overflow-hidden">
          <div
            className="h-full bg-rich-black rounded-full transition-all duration-200"
            style={{ width: `${(done / total) * 100}%` }}
          />
        </div>
        <span className="text-[12px] tabular-nums text-midtone-gray shrink-0">
          {done} / {total}
        </span>
      </div>

      {/* Primary stats */}
      <div className="grid grid-cols-3 gap-4">
        <StatCell label="p50" value={formatMs(agg.p50)} />
        <StatCell label="p95" value={formatMs(agg.p95)} emphasis />
        <StatCell label="p99" value={formatMs(agg.p99)} emphasis />
      </div>

      <Separator className="bg-subtle-ash" />

      {/* Secondary stats */}
      <div className="grid grid-cols-3 gap-4">
        <StatCell label="Min" value={formatMs(agg.min)} />
        <StatCell label="Mean" value={formatMs(agg.mean)} />
        <StatCell label="Max" value={formatMs(agg.max)} emphasis />
      </div>

      <Separator className="bg-subtle-ash" />

      {/* Count + error rate */}
      <div className="grid grid-cols-2 gap-4">
        <StatCell label="Count" value={agg.count.toString()} />
        <StatCell
          label="Error rate"
          value={`${(agg.errorRate * 100).toFixed(1)}%`}
          emphasis={agg.errorRate > 0}
        />
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: 'ok' | 'error' | 'timeout' }) {
  if (status === 'ok') {
    return (
      <Badge className="rounded-[26px] px-2 py-0.5 text-[11px] font-medium bg-ghost-gray text-rich-black border-0">
        ok
      </Badge>
    )
  }
  if (status === 'timeout') {
    return (
      <Badge className="rounded-[26px] px-2 py-0.5 text-[11px] font-medium bg-[#c22b10]/10 text-callout-red border-0">
        timeout
      </Badge>
    )
  }
  return (
    <Badge className="rounded-[26px] px-2 py-0.5 text-[11px] font-medium bg-[#c22b10]/10 text-callout-red border-0">
      error
    </Badge>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function ConcurrencyPage() {
  const [builderValue, setBuilderValue] = useState<RequestBuilderValue | null>(null)
  const [concurrency, setConcurrency] = useState('5')
  const [iterations, setIterations] = useState('20')
  const [running, setRunning] = useState(false)

  // Results state
  const [results, setResults] = useState<Array<ExecutionResult & { index: number }>>([])
  const [agg, setAgg] = useState<Aggregates | null>(null)
  const [done, setDone] = useState(0)
  const [total, setTotal] = useState(0)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)

  const handleBuilderChange = useCallback((value: RequestBuilderValue) => {
    setBuilderValue(value)
  }, [])

  const N = Math.max(1, Math.min(200, parseInt(concurrency, 10) || 5))
  const iters = Math.max(1, Math.min(2000, parseInt(iterations, 10) || 20))
  const canRun = !running && !!builderValue?.connectionId && isSpecComplete(builderValue)

  async function handleRun() {
    if (!builderValue) return
    const { connectionId, spec } = builderValue

    setRunning(true)
    setResults([])
    setAgg(null)
    setDone(0)
    setTotal(iters)
    setSelectedIndex(null)

    // Accumulate completed results for live aggregation
    const completed: Array<ExecutionResult & { index: number }> = []

    try {
      // 1. Create test run
      const createRes = await fetch('/api/test-runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionId,
          spec,
          mode: 'concurrent',
          concurrency: N,
          iterations: iters,
        }),
      })
      if (!createRes.ok) {
        const err = await createRes.json().catch(() => ({}))
        throw new Error(err?.error ? JSON.stringify(err.error) : 'Failed to create test run.')
      }
      const { id: testRunId } = await createRes.json()

      // 2. Run pool
      await runPool(
        iters,
        N,
        async (i) => {
          try {
            const res = await fetch('/api/run', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ connectionId, testRunId, iterationIndex: i, spec }),
            })
            if (!res.ok) {
              const errBody = await res.json().catch(() => ({}))
              return makeSyntheticError(errBody?.error ?? `HTTP ${res.status}`)
            }
            return (await res.json()) as ExecutionResult
          } catch (err) {
            return makeSyntheticError(err instanceof Error ? err.message : 'Fetch failed')
          }
        },
        (doneCount, result, i) => {
          const entry = { ...result, index: i }
          completed.push(entry)
          const newAgg = summarize(
            completed.map((r) => ({
              status: r.status,
              totalWallClockMs: r.timings.totalWallClockMs,
            })),
          )
          setResults([...completed])
          setAgg(newAgg)
          setDone(doneCount)
        },
      )

      // 3. Finalize
      await fetch(`/api/test-runs/${testRunId}`, { method: 'PATCH' }).catch(() => {
        // non-critical
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setRunning(false)
    }
  }

  // Table rows: cap to TABLE_CAP, sorted by iteration index
  const sortedResults = [...results].sort((a, b) => a.index - b.index)
  const visibleRows = sortedResults.slice(0, TABLE_CAP)
  const truncated = sortedResults.length > TABLE_CAP

  // Selected result for waterfall
  const selectedResult =
    selectedIndex !== null ? results.find((r) => r.index === selectedIndex) ?? null : null

  return (
    <div className="flex flex-col gap-6">
      {/* Page heading */}
      <div>
        <h1 className="text-[18px] font-semibold tracking-[-0.45px] text-deep-black leading-[1.33]">
          Concurrency Test
        </h1>
        <p className="mt-1 text-[14px] text-midtone-gray">
          Run many parallel queries against your Lightdash instance and observe live latency distributions.
        </p>
      </div>

      {/* Top row: config (left) + live aggregates (right) */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* Left: Request config */}
        <Card className="rounded-[14px] border border-subtle-ash bg-canvas-white shadow-[oklab(0.145_-0.00000143796_0.00000340492_/_0.1)_0px_0px_0px_1px]">
          <CardHeader className="px-4 pt-4 pb-0">
            <CardTitle className="text-[14px] font-semibold text-rich-black tracking-tight">
              Request
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pt-3 pb-4 flex flex-col gap-5">
            <RequestBuilder onChange={handleBuilderChange} />

            <Separator className="bg-subtle-ash" />

            {/* N + Iterations */}
            <div className="flex flex-wrap gap-4">
              <div className="flex flex-col gap-1.5">
                <Label className="text-[13px] font-medium text-rich-black">
                  Concurrency (N)
                </Label>
                <p className="text-[12px] text-midtone-gray">Parallel queries in flight</p>
                <Input
                  type="number"
                  min={1}
                  max={200}
                  value={concurrency}
                  onChange={(e) => setConcurrency(e.target.value)}
                  disabled={running}
                  className="rounded-[10px] border-subtle-ash text-[13px] h-8 w-24"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-[13px] font-medium text-rich-black">Iterations</Label>
                <p className="text-[12px] text-midtone-gray">Total queries to run</p>
                <Input
                  type="number"
                  min={1}
                  max={2000}
                  value={iterations}
                  onChange={(e) => setIterations(e.target.value)}
                  disabled={running}
                  className="rounded-[10px] border-subtle-ash text-[13px] h-8 w-24"
                />
              </div>
            </div>

            {/* Run button */}
            <Button
              disabled={!canRun}
              onClick={handleRun}
              className="self-start rounded-[10px] bg-deep-black text-canvas-white text-[13px] font-medium px-6 h-8 hover:bg-[#222] disabled:opacity-40"
            >
              {running ? `Running… (${done}/${total})` : 'Run test'}
            </Button>
          </CardContent>
        </Card>

        {/* Right: Live aggregates */}
        <Card className="rounded-[14px] border border-subtle-ash bg-canvas-white shadow-[oklab(0.145_-0.00000143796_0.00000340492_/_0.1)_0px_0px_0px_1px]">
          <CardHeader className="px-4 pt-4 pb-0">
            <CardTitle className="text-[14px] font-semibold text-rich-black tracking-tight">
              Live Aggregates
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pt-3 pb-4">
            <AggregatePanel agg={agg} done={done} total={total > 0 ? total : iters} />
          </CardContent>
        </Card>
      </div>

      {/* Results table (only when we have results) */}
      {results.length > 0 && (
        <Card className="rounded-[14px] border border-subtle-ash bg-canvas-white shadow-[oklab(0.145_-0.00000143796_0.00000340492_/_0.1)_0px_0px_0px_1px]">
          <CardHeader className="px-4 pt-4 pb-0 flex flex-row items-center justify-between">
            <CardTitle className="text-[14px] font-semibold text-rich-black tracking-tight">
              Per-Run Results
            </CardTitle>
            {truncated && (
              <span className="text-[12px] text-midtone-gray">
                Showing {TABLE_CAP} of {sortedResults.length}
              </span>
            )}
          </CardHeader>
          <CardContent className="px-4 pt-3 pb-4 flex flex-col gap-4">
            <div className="overflow-auto max-h-[400px] rounded-[10px] border border-subtle-ash">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-subtle-ash hover:bg-transparent">
                    <TableHead className="text-[12px] text-midtone-gray font-medium w-16">#</TableHead>
                    <TableHead className="text-[12px] text-midtone-gray font-medium w-20">Status</TableHead>
                    <TableHead className="text-[12px] text-midtone-gray font-medium">Wall-clock</TableHead>
                    <TableHead className="text-[12px] text-midtone-gray font-medium">Warehouse</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleRows.map((row) => (
                    <TableRow
                      key={row.index}
                      className={[
                        'border-b border-subtle-ash cursor-pointer transition-colors',
                        selectedIndex === row.index
                          ? 'bg-ghost-gray'
                          : 'hover:bg-ghost-gray',
                      ].join(' ')}
                      onClick={() =>
                        setSelectedIndex(selectedIndex === row.index ? null : row.index)
                      }
                    >
                      <TableCell className="text-[13px] tabular-nums text-midtone-gray py-2">
                        {row.index + 1}
                      </TableCell>
                      <TableCell className="py-2">
                        <StatusBadge status={row.status} />
                      </TableCell>
                      <TableCell className="text-[13px] tabular-nums text-rich-black py-2">
                        {row.timings.totalWallClockMs > 0
                          ? formatMs(row.timings.totalWallClockMs)
                          : '—'}
                      </TableCell>
                      <TableCell className="text-[13px] tabular-nums text-rich-black py-2">
                        {row.timings.warehouseExecMs !== null
                          ? formatMs(row.timings.warehouseExecMs)
                          : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {truncated && (
              <p className="text-[12px] text-midtone-gray">
                Table capped at {TABLE_CAP} rows for performance. Showing iterations 1–{TABLE_CAP} of {sortedResults.length}.
              </p>
            )}

            {/* Waterfall for selected row */}
            {selectedResult && (
              <div className="rounded-[14px] border border-subtle-ash bg-ghost-gray p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-semibold text-rich-black">
                    Iteration #{selectedResult.index + 1} — Latency breakdown
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedIndex(null)}
                    className="text-[12px] text-midtone-gray hover:text-rich-black transition-colors"
                  >
                    Close
                  </button>
                </div>
                {selectedResult.status !== 'ok' && selectedResult.errorMessage && (
                  <div className="rounded-[10px] border border-[#c22b10]/30 bg-[#c22b10]/5 px-3 py-2">
                    <p className="text-[12px] text-callout-red break-words">
                      {selectedResult.errorMessage}
                    </p>
                  </div>
                )}
                <LatencyWaterfall timings={selectedResult.timings} />
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript is clean**

```bash
cd /Users/f/Documents/GitHub/point-of-rental/apps && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Run full test suite — expect all green**

```bash
cd /Users/f/Documents/GitHub/point-of-rental/apps && npm test
```

Expected: all tests pass (pool + all previously-passing tests).

- [ ] **Step 4: Build check**

```bash
cd /Users/f/Documents/GitHub/point-of-rental/apps && AUTH_SECRET=x DATABASE_URL=postgres://u:p@localhost:5432/db npm run build
```

Expected: build succeeds, `/concurrency` route appears in output.

- [ ] **Step 5: Commit everything**

```bash
cd /Users/f/Documents/GitHub/point-of-rental/apps && git add lib/concurrency/pool.test.ts lib/concurrency/pool.ts app/\(app\)/concurrency/page.tsx && git commit -m "feat: add concurrency test page with bounded pool"
```
