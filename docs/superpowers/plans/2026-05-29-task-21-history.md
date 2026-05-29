# Task 21: Run History List + Detail (with Re-run) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/history` list page and `/history/[id]` detail page so users can browse past test runs, inspect per-execution latency waterfalls, and re-run any historical run with one click.

**Architecture:** Two new client components under `app/(app)/history/`. The list page fetches `GET /api/test-runs` on mount and renders a `Table` with a row per run. The detail page reads `useParams()`, fetches `GET /api/test-runs/[id]`, shows a header + aggregate panel + executions table (capped at 200) + `LatencyWaterfall` for the selected row, and a Re-run button that POSTs a new test run, fans out the executions via `runPool`, PATCHes to finalize, then navigates to the new run's detail page.

**Tech Stack:** Next.js 16 App Router, React 19, shadcn/ui (card, button, badge, table, skeleton, separator), sonner, `runPool` from `@/lib/concurrency/pool`, `LatencyWaterfall` from `@/components/latency-waterfall`, Tailwind v4 with design tokens.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `app/(app)/history/page.tsx` | **Create** | History list page — fetches `GET /api/test-runs`, renders Table with loading/empty states, rows link to detail |
| `app/(app)/history/[id]/page.tsx` | **Create** | History detail page — fetches `GET /api/test-runs/[id]`, shows header, aggregates, executions table, LatencyWaterfall, Re-run button |

Nothing else changes. Both pages are self-contained client components; no API routes, no shared components, no modified files.

---

## Key types we rely on (already in the codebase, no changes needed)

From `GET /api/test-runs` response:
```ts
interface RunSummary {
  id: string
  connectionId: string
  connectionName: string | null
  endpointType: 'metric_query' | 'sql' | 'saved_chart' | 'underlying_data'
  mode: 'single' | 'concurrent'
  concurrency: number
  iterations: number
  status: 'running' | 'completed' | 'failed' | 'partial'
  aggregates: {
    count: number; errorRate: number; min: number; max: number
    mean: number; p50: number; p95: number; p99: number
  } | null
  startedAt: string | null
  finishedAt: string | null
}
```

From `GET /api/test-runs/[id]` response:
```ts
interface RunDetail {
  run: RunSummary & { payload: QuerySpec }  // payload is stored as jsonb, arrives as parsed object
  executions: Array<{
    id: string
    iterationIndex: number
    status: 'ok' | 'error' | 'timeout'
    submitMs: number | null
    queueTimeMs: number | null
    warehouseExecMs: number | null
    pollOverheadMs: number | null
    resultsFetchMs: number | null
    totalWallClockMs: number | null
    rowCount: number | null
    errorMessage: string | null
    lightdashQueryUuid: string | null
    serverPerf: unknown
  }>
}
```

`PhaseTimings` (from `@/lib/engine/types`):
```ts
interface PhaseTimings {
  submitMs: number
  queueTimeMs: number | null
  warehouseExecMs: number | null
  pollOverheadMs: number
  resultsFetchMs: number
  totalWallClockMs: number
}
```

---

## Task 1: History list page (`app/(app)/history/page.tsx`)

**Files:**
- Create: `app/(app)/history/page.tsx`

- [ ] **Step 1: Create the file with imports, types, and skeleton**

```tsx
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

// ── Types ──────────────────────────────────────────────────────────────────

interface RunSummary {
  id: string
  connectionId: string
  connectionName: string | null
  endpointType: 'metric_query' | 'sql' | 'saved_chart' | 'underlying_data'
  mode: 'single' | 'concurrent'
  concurrency: number
  iterations: number
  status: 'running' | 'completed' | 'failed' | 'partial'
  aggregates: {
    count: number
    errorRate: number
    min: number
    max: number
    mean: number
    p50: number
    p95: number
    p99: number
  } | null
  startedAt: string | null
  finishedAt: string | null
}
```

- [ ] **Step 2: Add helper functions**

```tsx
function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`
  return `${Math.round(ms)}ms`
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function endpointLabel(t: string): string {
  switch (t) {
    case 'metric_query': return 'Metric'
    case 'sql': return 'SQL'
    case 'saved_chart': return 'Chart'
    case 'underlying_data': return 'Underlying'
    default: return t
  }
}
```

- [ ] **Step 3: Add StatusBadge sub-component**

```tsx
function StatusBadge({ status }: { status: RunSummary['status'] }) {
  const base = 'rounded-[26px] px-2 py-0.5 text-[11px] font-medium border-0'
  if (status === 'completed') {
    return <Badge className={`${base} bg-ghost-gray text-rich-black`}>{status}</Badge>
  }
  if (status === 'running') {
    return <Badge className={`${base} bg-ghost-gray text-midtone-gray`}>{status}</Badge>
  }
  // failed | partial
  return <Badge className={`${base} bg-[#c22b10]/10 text-callout-red`}>{status}</Badge>
}
```

- [ ] **Step 4: Add the main page component with fetch on mount**

```tsx
export default function HistoryPage() {
  const [runs, setRuns] = useState<RunSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/test-runs')
        if (!res.ok) throw new Error('Failed to load history')
        const data: RunSummary[] = await res.json()
        setRuns(data)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return (
    <div className="flex flex-col gap-6">
      {/* Page heading */}
      <div>
        <h1 className="text-[18px] font-semibold tracking-[-0.45px] text-deep-black leading-[1.33]">
          Run History
        </h1>
        <p className="mt-1 text-[14px] text-midtone-gray">
          All past test runs, newest first. Click a row to inspect.
        </p>
      </div>

      <div className="rounded-[14px] border border-subtle-ash bg-canvas-white shadow-[oklab(0.145_-0.00000143796_0.00000340492_/_0.1)_0px_0px_0px_1px] overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-subtle-ash hover:bg-transparent">
              <TableHead className="text-[12px] text-midtone-gray font-medium px-4">Started</TableHead>
              <TableHead className="text-[12px] text-midtone-gray font-medium">Connection</TableHead>
              <TableHead className="text-[12px] text-midtone-gray font-medium">Endpoint</TableHead>
              <TableHead className="text-[12px] text-midtone-gray font-medium">Mode</TableHead>
              <TableHead className="text-[12px] text-midtone-gray font-medium">N × iters</TableHead>
              <TableHead className="text-[12px] text-midtone-gray font-medium tabular-nums">p50</TableHead>
              <TableHead className="text-[12px] text-midtone-gray font-medium tabular-nums">p95</TableHead>
              <TableHead className="text-[12px] text-midtone-gray font-medium">Error rate</TableHead>
              <TableHead className="text-[12px] text-midtone-gray font-medium">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              // 5 skeleton rows
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i} className="border-b border-subtle-ash hover:bg-transparent">
                  {Array.from({ length: 9 }).map((__, j) => (
                    <TableCell key={j} className="py-3 px-4">
                      <Skeleton className="h-4 w-full rounded" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : runs.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="py-16 text-center text-[14px] text-midtone-gray"
                >
                  No runs yet — run a query in the{' '}
                  <Link href="/explorer" className="underline text-rich-black">
                    Explorer
                  </Link>{' '}
                  or{' '}
                  <Link href="/concurrency" className="underline text-rich-black">
                    Concurrency
                  </Link>{' '}
                  page.
                </TableCell>
              </TableRow>
            ) : (
              runs.map((run) => (
                <TableRow
                  key={run.id}
                  className="border-b border-subtle-ash hover:bg-ghost-gray cursor-pointer transition-colors"
                >
                  <TableCell className="py-2.5 px-4 text-[13px] text-rich-black whitespace-nowrap">
                    <Link href={`/history/${run.id}`} className="block w-full h-full">
                      {formatDateTime(run.startedAt)}
                    </Link>
                  </TableCell>
                  <TableCell className="py-2.5 text-[13px] text-rich-black max-w-[160px] truncate">
                    <Link href={`/history/${run.id}`} className="block w-full h-full">
                      {run.connectionName ?? run.connectionId.slice(0, 8) + '…'}
                    </Link>
                  </TableCell>
                  <TableCell className="py-2.5 text-[13px] text-rich-black">
                    <Link href={`/history/${run.id}`} className="block w-full h-full">
                      {endpointLabel(run.endpointType)}
                    </Link>
                  </TableCell>
                  <TableCell className="py-2.5 text-[13px] text-rich-black capitalize">
                    <Link href={`/history/${run.id}`} className="block w-full h-full">
                      {run.mode}
                    </Link>
                  </TableCell>
                  <TableCell className="py-2.5 text-[13px] tabular-nums text-rich-black">
                    <Link href={`/history/${run.id}`} className="block w-full h-full">
                      {run.concurrency} × {run.iterations}
                    </Link>
                  </TableCell>
                  <TableCell className="py-2.5 text-[13px] tabular-nums text-rich-black">
                    <Link href={`/history/${run.id}`} className="block w-full h-full">
                      {run.aggregates ? formatMs(run.aggregates.p50) : '—'}
                    </Link>
                  </TableCell>
                  <TableCell className="py-2.5 text-[13px] tabular-nums text-rich-black">
                    <Link href={`/history/${run.id}`} className="block w-full h-full">
                      {run.aggregates ? formatMs(run.aggregates.p95) : '—'}
                    </Link>
                  </TableCell>
                  <TableCell className={[
                    'py-2.5 text-[13px] tabular-nums',
                    run.aggregates && run.aggregates.errorRate > 0 ? 'text-callout-red' : 'text-rich-black',
                  ].join(' ')}>
                    <Link href={`/history/${run.id}`} className="block w-full h-full">
                      {run.aggregates ? `${(run.aggregates.errorRate * 100).toFixed(1)}%` : '—'}
                    </Link>
                  </TableCell>
                  <TableCell className="py-2.5">
                    <Link href={`/history/${run.id}`} className="block w-full h-full">
                      <StatusBadge status={run.status} />
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Verify the file compiles**

Run: `cd /Users/f/Documents/GitHub/point-of-rental/apps && npx tsc --noEmit 2>&1 | head -40`

Expected: No errors related to `app/(app)/history/page.tsx`.

---

## Task 2: History detail page (`app/(app)/history/[id]/page.tsx`)

**Files:**
- Create: `app/(app)/history/[id]/page.tsx`

- [ ] **Step 1: Create the file with imports and types**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { LatencyWaterfall } from '@/components/latency-waterfall'
import { runPool } from '@/lib/concurrency/pool'
import type { PhaseTimings, QuerySpec } from '@/lib/engine/types'

// ── Types ──────────────────────────────────────────────────────────────────

interface Aggregates {
  count: number
  errorRate: number
  min: number
  max: number
  mean: number
  p50: number
  p95: number
  p99: number
}

interface RunRow {
  id: string
  connectionId: string
  connectionName?: string | null
  endpointType: string
  mode: 'single' | 'concurrent'
  concurrency: number
  iterations: number
  status: 'running' | 'completed' | 'failed' | 'partial'
  aggregates: Aggregates | null
  startedAt: string | null
  finishedAt: string | null
  payload: QuerySpec
}

interface ExecutionRow {
  id: string
  iterationIndex: number
  status: 'ok' | 'error' | 'timeout'
  submitMs: number | null
  queueTimeMs: number | null
  warehouseExecMs: number | null
  pollOverheadMs: number | null
  resultsFetchMs: number | null
  totalWallClockMs: number | null
  rowCount: number | null
  errorMessage: string | null
  lightdashQueryUuid: string | null
  serverPerf: unknown
}

const TABLE_CAP = 200
```

- [ ] **Step 2: Add helper functions**

```tsx
function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`
  return `${Math.round(ms)}ms`
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function endpointLabel(t: string): string {
  switch (t) {
    case 'metric_query': return 'Metric query'
    case 'sql': return 'SQL'
    case 'saved_chart': return 'Saved chart'
    case 'underlying_data': return 'Underlying data'
    default: return t
  }
}

/** Build a PhaseTimings from a DB execution row, using safe fallbacks for nulls */
function toPhaseTimings(exec: ExecutionRow): PhaseTimings {
  return {
    submitMs: exec.submitMs ?? 0,
    queueTimeMs: exec.queueTimeMs ?? null,
    warehouseExecMs: exec.warehouseExecMs ?? null,
    pollOverheadMs: exec.pollOverheadMs ?? 0,
    resultsFetchMs: exec.resultsFetchMs ?? 0,
    totalWallClockMs: exec.totalWallClockMs ?? 0,
  }
}
```

- [ ] **Step 3: Add sub-components — StatCell and StatusBadge**

```tsx
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

function RunStatusBadge({ status }: { status: RunRow['status'] }) {
  const base = 'rounded-[26px] px-2 py-0.5 text-[11px] font-medium border-0'
  if (status === 'completed') {
    return <Badge className={`${base} bg-ghost-gray text-rich-black`}>{status}</Badge>
  }
  if (status === 'running') {
    return <Badge className={`${base} bg-ghost-gray text-midtone-gray`}>{status}</Badge>
  }
  return <Badge className={`${base} bg-[#c22b10]/10 text-callout-red`}>{status}</Badge>
}

function ExecStatusBadge({ status }: { status: 'ok' | 'error' | 'timeout' }) {
  const base = 'rounded-[26px] px-2 py-0.5 text-[11px] font-medium border-0'
  if (status === 'ok') {
    return <Badge className={`${base} bg-ghost-gray text-rich-black`}>ok</Badge>
  }
  return <Badge className={`${base} bg-[#c22b10]/10 text-callout-red`}>{status}</Badge>
}
```

- [ ] **Step 4: Add AggregatePanel sub-component**

```tsx
function AggregatePanel({ agg }: { agg: Aggregates }) {
  return (
    <div className="flex flex-col gap-5">
      {/* Primary latency stats */}
      <div className="grid grid-cols-3 gap-4">
        <StatCell label="p50" value={formatMs(agg.p50)} />
        <StatCell label="p95" value={formatMs(agg.p95)} emphasis />
        <StatCell label="p99" value={formatMs(agg.p99)} emphasis />
      </div>

      <Separator className="bg-subtle-ash" />

      {/* Secondary latency stats */}
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
```

- [ ] **Step 5: Add the main page component with fetch on mount and re-run logic**

```tsx
export default function HistoryDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : ''

  const [run, setRun] = useState<RunRow | null>(null)
  const [executions, setExecutions] = useState<ExecutionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedExecId, setSelectedExecId] = useState<string | null>(null)
  const [rerunning, setRerunning] = useState(false)
  const [rerunProgress, setRerunProgress] = useState<{ done: number; total: number } | null>(null)

  useEffect(() => {
    if (!id) return
    async function load() {
      try {
        const res = await fetch(`/api/test-runs/${id}`)
        if (!res.ok) throw new Error('Failed to load run')
        const data: { run: RunRow; executions: ExecutionRow[] } = await res.json()
        setRun(data.run)
        setExecutions(data.executions)
        // For single-mode with exactly one execution, auto-select it
        if (data.executions.length === 1) {
          setSelectedExecId(data.executions[0].id)
        }
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  async function handleRerun() {
    if (!run) return
    setRerunning(true)
    setRerunProgress(null)

    try {
      // 1. Create a new test run with the same params
      const createRes = await fetch('/api/test-runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionId: run.connectionId,
          spec: run.payload,
          mode: run.mode,
          concurrency: run.concurrency,
          iterations: run.iterations,
        }),
      })
      if (!createRes.ok) {
        const err = await createRes.json().catch(() => ({}))
        throw new Error(
          (err as Record<string, unknown>)?.error
            ? JSON.stringify((err as Record<string, unknown>).error)
            : 'Failed to create re-run.',
        )
      }
      const { id: newId } = (await createRes.json()) as { id: string }

      const total = run.iterations
      setRerunProgress({ done: 0, total })

      if (run.mode === 'single') {
        // 2a. Single mode: one call
        const runRes = await fetch('/api/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            connectionId: run.connectionId,
            testRunId: newId,
            iterationIndex: 0,
            spec: run.payload,
          }),
        })
        if (!runRes.ok) {
          const err = await runRes.json().catch(() => ({}))
          throw new Error(
            (err as Record<string, unknown>)?.error
              ? String((err as Record<string, unknown>).error)
              : `Run failed with HTTP ${runRes.status}`,
          )
        }
        setRerunProgress({ done: 1, total: 1 })
      } else {
        // 2b. Concurrent mode: fan out via pool
        await runPool(
          total,
          run.concurrency,
          async (i) => {
            try {
              const res = await fetch('/api/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  connectionId: run.connectionId,
                  testRunId: newId,
                  iterationIndex: i,
                  spec: run.payload,
                }),
              })
              if (!res.ok) {
                // swallow per-iteration HTTP errors — pool continues
                return null
              }
              return await res.json()
            } catch {
              return null
            }
          },
          (done) => {
            setRerunProgress({ done, total })
          },
        )
      }

      // 3. Finalize (PATCH aggregates)
      await fetch(`/api/test-runs/${newId}`, { method: 'PATCH' }).catch(() => {
        // non-critical
      })

      // 4. Navigate to the new run
      router.push(`/history/${newId}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Re-run failed')
    } finally {
      setRerunning(false)
      setRerunProgress(null)
    }
  }

  // Derived
  const visibleExecs = executions.slice(0, TABLE_CAP)
  const truncated = executions.length > TABLE_CAP
  const selectedExec = selectedExecId
    ? (executions.find((e) => e.id === selectedExecId) ?? null)
    : null

  // ── Loading state ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <Skeleton className="h-6 w-48 rounded" />
          <Skeleton className="mt-2 h-4 w-72 rounded" />
        </div>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Skeleton className="h-48 rounded-[14px]" />
          <Skeleton className="h-48 rounded-[14px]" />
        </div>
        <Skeleton className="h-64 rounded-[14px]" />
      </div>
    )
  }

  if (!run) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-[14px] font-medium text-rich-black">Run not found</p>
        <p className="mt-1 text-[13px] text-midtone-gray">
          This run may have been deleted or the ID is invalid.
        </p>
      </div>
    )
  }

  // ── Main render ────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6">
      {/* Page heading / header */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-[18px] font-semibold tracking-[-0.45px] text-deep-black leading-[1.33]">
            Run Detail
          </h1>
          <RunStatusBadge status={run.status} />
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1 mt-1 text-[13px] text-midtone-gray">
          <span>
            <span className="text-rich-black font-medium">Connection:</span>{' '}
            {run.connectionName ?? run.connectionId.slice(0, 8) + '…'}
          </span>
          <span>
            <span className="text-rich-black font-medium">Endpoint:</span>{' '}
            {endpointLabel(run.endpointType)}
          </span>
          <span>
            <span className="text-rich-black font-medium">Mode:</span>{' '}
            <span className="capitalize">{run.mode}</span>
          </span>
          <span>
            <span className="text-rich-black font-medium">N × iterations:</span>{' '}
            {run.concurrency} × {run.iterations}
          </span>
          {run.startedAt && (
            <span>
              <span className="text-rich-black font-medium">Started:</span>{' '}
              {formatDateTime(run.startedAt)}
            </span>
          )}
          {run.finishedAt && (
            <span>
              <span className="text-rich-black font-medium">Finished:</span>{' '}
              {formatDateTime(run.finishedAt)}
            </span>
          )}
        </div>
      </div>

      {/* Top row: Aggregates (left) + Re-run (right) */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,auto)]">
        {/* Aggregates card */}
        <Card className="rounded-[14px] border border-subtle-ash bg-canvas-white shadow-[oklab(0.145_-0.00000143796_0.00000340492_/_0.1)_0px_0px_0px_1px]">
          <CardHeader className="px-4 pt-4 pb-0">
            <CardTitle className="text-[14px] font-semibold text-rich-black tracking-tight">
              Aggregates
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pt-3 pb-4">
            {run.aggregates ? (
              <AggregatePanel agg={run.aggregates} />
            ) : (
              <p className="text-[13px] text-midtone-gray">
                No aggregate data yet — run may still be in progress.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Re-run card */}
        <Card className="rounded-[14px] border border-subtle-ash bg-canvas-white shadow-[oklab(0.145_-0.00000143796_0.00000340492_/_0.1)_0px_0px_0px_1px] self-start">
          <CardHeader className="px-4 pt-4 pb-0">
            <CardTitle className="text-[14px] font-semibold text-rich-black tracking-tight">
              Re-run
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pt-3 pb-4 flex flex-col gap-3">
            <p className="text-[13px] text-midtone-gray">
              Clone this run's payload and execute it again. You'll be redirected to the new run when done.
            </p>
            <Button
              disabled={rerunning}
              onClick={handleRerun}
              className="self-start rounded-[10px] bg-deep-black text-canvas-white text-[13px] font-medium px-6 h-8 hover:bg-[#222] disabled:opacity-40"
            >
              {rerunning
                ? rerunProgress
                  ? `Re-running… (${rerunProgress.done}/${rerunProgress.total})`
                  : 'Re-running…'
                : 'Re-run'}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Executions table */}
      <Card className="rounded-[14px] border border-subtle-ash bg-canvas-white shadow-[oklab(0.145_-0.00000143796_0.00000340492_/_0.1)_0px_0px_0px_1px]">
        <CardHeader className="px-4 pt-4 pb-0 flex flex-row items-center justify-between">
          <CardTitle className="text-[14px] font-semibold text-rich-black tracking-tight">
            Executions
          </CardTitle>
          {truncated && (
            <span className="text-[12px] text-midtone-gray">
              Showing {TABLE_CAP} of {executions.length}
            </span>
          )}
        </CardHeader>
        <CardContent className="px-4 pt-3 pb-4 flex flex-col gap-4">
          {executions.length > 1 && (
            <p className="text-[12px] text-midtone-gray">
              Click a row to inspect its latency waterfall.
            </p>
          )}

          <div className="overflow-auto max-h-[400px] rounded-[10px] border border-subtle-ash">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-subtle-ash hover:bg-transparent">
                  <TableHead className="text-[12px] text-midtone-gray font-medium w-12">#</TableHead>
                  <TableHead className="text-[12px] text-midtone-gray font-medium w-24">Status</TableHead>
                  <TableHead className="text-[12px] text-midtone-gray font-medium">Wall-clock</TableHead>
                  <TableHead className="text-[12px] text-midtone-gray font-medium">Warehouse</TableHead>
                  <TableHead className="text-[12px] text-midtone-gray font-medium">Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleExecs.map((exec) => (
                  <TableRow
                    key={exec.id}
                    className={[
                      'border-b border-subtle-ash transition-colors',
                      executions.length > 1 ? 'cursor-pointer' : '',
                      selectedExecId === exec.id ? 'bg-ghost-gray' : executions.length > 1 ? 'hover:bg-ghost-gray' : '',
                    ].join(' ')}
                    onClick={() => {
                      if (executions.length > 1) {
                        setSelectedExecId(selectedExecId === exec.id ? null : exec.id)
                      }
                    }}
                  >
                    <TableCell className="text-[13px] tabular-nums text-midtone-gray py-2">
                      {exec.iterationIndex + 1}
                    </TableCell>
                    <TableCell className="py-2">
                      <ExecStatusBadge status={exec.status} />
                    </TableCell>
                    <TableCell className="text-[13px] tabular-nums text-rich-black py-2">
                      {exec.totalWallClockMs != null && exec.totalWallClockMs > 0
                        ? formatMs(exec.totalWallClockMs)
                        : '—'}
                    </TableCell>
                    <TableCell className="text-[13px] tabular-nums text-rich-black py-2">
                      {exec.warehouseExecMs != null ? formatMs(exec.warehouseExecMs) : '—'}
                    </TableCell>
                    <TableCell className="text-[12px] text-callout-red py-2 max-w-[240px] truncate">
                      {exec.errorMessage ?? ''}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Truncation note — not silent */}
          {truncated && (
            <p className="text-[12px] text-midtone-gray">
              Table capped at {TABLE_CAP} rows. Showing iterations 1–{TABLE_CAP} of {executions.length}.
            </p>
          )}

          {/* Waterfall for single-run (auto-selected) or user-selected row */}
          {selectedExec && (
            <div className="rounded-[14px] border border-subtle-ash bg-ghost-gray p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-semibold text-rich-black">
                  Iteration #{selectedExec.iterationIndex + 1} — Latency breakdown
                </span>
                {executions.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setSelectedExecId(null)}
                    className="text-[12px] text-midtone-gray hover:text-rich-black transition-colors"
                  >
                    Close
                  </button>
                )}
              </div>
              {selectedExec.status !== 'ok' && selectedExec.errorMessage && (
                <div className="rounded-[10px] border border-[#c22b10]/30 bg-[#c22b10]/5 px-3 py-2">
                  <p className="text-[12px] text-callout-red break-words">
                    {selectedExec.errorMessage}
                  </p>
                </div>
              )}
              <LatencyWaterfall timings={toPhaseTimings(selectedExec)} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 6: TypeScript check**

Run: `cd /Users/f/Documents/GitHub/point-of-rental/apps && npx tsc --noEmit 2>&1 | head -40`

Expected: No type errors.

---

## Task 3: Build + test verification

- [ ] **Step 1: Run the test suite**

Run: `cd /Users/f/Documents/GitHub/point-of-rental/apps && npm test 2>&1 | tail -20`

Expected: All existing tests pass (no new tests needed — these are UI pages with no pure logic; the business logic being exercised is already tested in `aggregate.test.ts`, `pool.test.ts`, etc.).

- [ ] **Step 2: Build the app**

Run: `cd /Users/f/Documents/GitHub/point-of-rental/apps && AUTH_SECRET=x DATABASE_URL=postgres://u:p@localhost:5432/db npm run build 2>&1 | tail -40`

Expected: Build succeeds. Routes `/history` and `/history/[id]` appear in the output. No build errors.

- [ ] **Step 3: Final tsc check**

Run: `cd /Users/f/Documents/GitHub/point-of-rental/apps && npx tsc --noEmit 2>&1`

Expected: Clean output (no errors).

---

## Task 4: Commit

- [ ] **Step 1: Stage and commit**

```bash
cd /Users/f/Documents/GitHub/point-of-rental/apps
git add app/(app)/history/page.tsx app/(app)/history/[id]/page.tsx
git commit -m "feat: add run history list and detail"
```

Expected: Commit succeeds on `main` branch.

---

## Self-Review Against Spec

**Spec coverage checklist:**

| Requirement | Task |
|-------------|------|
| List page: client component, fetch `/api/test-runs` | Task 1 Step 4 |
| Table: Started, Connection, Endpoint, Mode, N×iters, p50, p95, Error rate, Status | Task 1 Step 4 |
| "—" when aggregates null | Task 1 Step 4 (formatMs only called with aggregates present) |
| Error rate callout-red when > 0 | Task 1 Step 4 |
| Loading: Skeleton rows | Task 1 Step 4 |
| Empty: friendly message with links | Task 1 Step 4 |
| Rows link to `/history/[id]` | Task 1 Step 4 |
| Detail: client component, `useParams()` | Task 2 Step 5 |
| Header: connection, endpoint, mode, N×iterations, status, started/finished | Task 2 Step 5 |
| Aggregate panel (p50/p95/p99, min/mean/max, error rate, count) | Task 2 Steps 4 + 5 |
| Executions table (iteration #, status, wall-clock, warehouse, error) | Task 2 Step 5 |
| Table cap 200 with "showing 200 of N" note | Task 2 Step 5 |
| Waterfall for single-mode auto-selected | Task 2 Step 5 (auto-select when `executions.length === 1`) |
| Waterfall for selected row (multi-mode) | Task 2 Step 5 |
| `LatencyWaterfall` with `toPhaseTimings()` | Task 2 Steps 2 + 5 |
| Re-run button disabled in flight | Task 2 Step 5 |
| Re-run: POST `/api/test-runs` | Task 2 Step 5 |
| Re-run single: one POST `/api/run` | Task 2 Step 5 |
| Re-run concurrent: `runPool` fan-out | Task 2 Step 5 |
| Re-run: PATCH to finalize | Task 2 Step 5 |
| Re-run: navigate to new run | Task 2 Step 5 |
| `toast.error` on failure | Task 2 Step 5 |
| Progress state shown during re-run | Task 2 Step 5 |
| RequestBuilder NOT modified | N/A (only reading it for reference) |
| Build/tsc/tests green | Task 3 |
| Committed to main | Task 4 |
| Trends/filtering NOT built (out of scope) | ✓ — not in any task |

**No placeholders detected.**

**Type consistency:**
- `PhaseTimings` from `@/lib/engine/types` — used in `toPhaseTimings()` return type — matches the type definition exactly.
- `RunPool` signature: `runPool(total, limit, task, onProgress)` — matches `lib/concurrency/pool.ts`.
- `LatencyWaterfall` props: `{ timings: PhaseTimings }` — matches `components/latency-waterfall.tsx`.
- `POST /api/test-runs` body shape: `{ connectionId, spec, mode, concurrency, iterations }` — matches `testRunInput` zod schema in `lib/validation/schemas.ts`.
- `POST /api/run` body shape: `{ connectionId, testRunId, iterationIndex, spec }` — matches `runInput` zod schema.
