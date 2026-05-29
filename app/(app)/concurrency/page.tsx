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
      {/* Progress bar */}
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
        throw new Error(
          (err as Record<string, unknown>)?.error
            ? JSON.stringify((err as Record<string, unknown>).error)
            : 'Failed to create test run.',
        )
      }
      const { id: testRunId } = (await createRes.json()) as { id: string }

      // 2. Run pool — per-iteration errors are isolated, never crash the pool
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
              return makeSyntheticError(
                (errBody as Record<string, unknown>)?.error
                  ? String((errBody as Record<string, unknown>).error)
                  : `HTTP ${res.status}`,
              )
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
          // Snapshot the array so React sees a new reference
          setResults([...completed])
          setAgg(newAgg)
          setDone(doneCount)
        },
      )

      // 3. Finalize test run (non-critical)
      await fetch(`/api/test-runs/${testRunId}`, { method: 'PATCH' }).catch(() => {
        // intentionally swallowed
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setRunning(false)
    }
  }

  // Table rows: sorted by iteration index, capped to TABLE_CAP
  const sortedResults = [...results].sort((a, b) => a.index - b.index)
  const visibleRows = sortedResults.slice(0, TABLE_CAP)
  const truncated = sortedResults.length > TABLE_CAP

  // Selected result for waterfall
  const selectedResult =
    selectedIndex !== null
      ? (results.find((r) => r.index === selectedIndex) ?? null)
      : null

  return (
    <div className="flex flex-col gap-6">
      {/* Page heading */}
      <div>
        <h1 className="text-[18px] font-semibold tracking-[-0.45px] text-deep-black leading-[1.33]">
          Concurrency Test
        </h1>
        <p className="mt-1 text-[14px] text-midtone-gray">
          Run many parallel queries against your Lightdash instance and observe live latency
          distributions.
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

            {/* Concurrency N + Iterations */}
            <div className="flex flex-wrap gap-5">
              <div className="flex flex-col gap-1.5">
                <Label className="text-[13px] font-medium text-rich-black">
                  Concurrency (N)
                </Label>
                <p className="text-[12px] text-midtone-gray leading-none">
                  Parallel queries in flight
                </p>
                <Input
                  type="number"
                  min={1}
                  max={200}
                  value={concurrency}
                  onChange={(e) => setConcurrency(e.target.value)}
                  disabled={running}
                  className="rounded-[10px] border-subtle-ash text-[13px] h-8 w-24 mt-1"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-[13px] font-medium text-rich-black">Iterations</Label>
                <p className="text-[12px] text-midtone-gray leading-none">Total queries to run</p>
                <Input
                  type="number"
                  min={1}
                  max={2000}
                  value={iterations}
                  onChange={(e) => setIterations(e.target.value)}
                  disabled={running}
                  className="rounded-[10px] border-subtle-ash text-[13px] h-8 w-24 mt-1"
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

        {/* Right: Live aggregates — visual focus */}
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

      {/* Per-run results table — only rendered once we have data */}
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
            <p className="text-[12px] text-midtone-gray">
              Click a row to inspect its latency waterfall.
            </p>

            <div className="overflow-auto max-h-[400px] rounded-[10px] border border-subtle-ash">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-subtle-ash hover:bg-transparent">
                    <TableHead className="text-[12px] text-midtone-gray font-medium w-16">
                      #
                    </TableHead>
                    <TableHead className="text-[12px] text-midtone-gray font-medium w-24">
                      Status
                    </TableHead>
                    <TableHead className="text-[12px] text-midtone-gray font-medium">
                      Wall-clock
                    </TableHead>
                    <TableHead className="text-[12px] text-midtone-gray font-medium">
                      Warehouse
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleRows.map((row) => (
                    <TableRow
                      key={row.index}
                      className={[
                        'border-b border-subtle-ash cursor-pointer transition-colors',
                        selectedIndex === row.index ? 'bg-ghost-gray' : 'hover:bg-ghost-gray',
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

            {/* Truncation note — explicit, not silent */}
            {truncated && (
              <p className="text-[12px] text-midtone-gray">
                Table capped at {TABLE_CAP} rows for performance. Showing iterations 1–{TABLE_CAP}{' '}
                of {sortedResults.length}.
              </p>
            )}

            {/* Expandable waterfall for selected row */}
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
