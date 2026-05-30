'use client'

import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { PlayIcon, XIcon, ActivityIcon } from 'lucide-react'
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { Spinner } from '@/components/ui/spinner'
import { Field, FieldLabel, FieldGroup } from '@/components/ui/field'
import { PageHeader } from '@/components/page-header'
import { StatTiles, type Stat } from '@/components/stat-tiles'
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

function StatusBadge({ status }: { status: 'ok' | 'error' | 'timeout' }) {
  if (status === 'ok') return <Badge variant="secondary">ok</Badge>
  if (status === 'timeout') return <Badge variant="outline">timeout</Badge>
  return <Badge variant="destructive">error</Badge>
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
      <Empty className="border-0 py-10">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ActivityIcon />
          </EmptyMedia>
          <EmptyTitle>No data yet</EmptyTitle>
          <EmptyDescription>Configure a request and click Run test.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  const primaryStats: Stat[] = [
    { label: 'p50', value: formatMs(agg.p50) },
    { label: 'p95', value: formatMs(agg.p95), emphasis: true },
    { label: 'p99', value: formatMs(agg.p99), emphasis: true },
  ]

  const secondaryStats: Stat[] = [
    { label: 'Min', value: formatMs(agg.min) },
    { label: 'Mean', value: formatMs(agg.mean) },
    { label: 'Max', value: formatMs(agg.max), emphasis: true },
    { label: 'Error rate', value: `${(agg.errorRate * 100).toFixed(1)}%`, emphasis: agg.errorRate > 0 },
  ]

  const progressPct = total > 0 ? (done / total) * 100 : 0

  return (
    <div className="flex flex-col gap-5">
      {/* Progress */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-foreground rounded-full transition-all duration-200"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <span className="text-xs tabular-nums text-muted-foreground shrink-0">
          {done} / {total}
        </span>
      </div>

      {/* Primary latency row */}
      <StatTiles stats={primaryStats} />

      {/* Secondary stats row */}
      <StatTiles stats={secondaryStats} />
    </div>
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
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Concurrency Test"
        description="Fire N queries in parallel and measure latency under load."
      />

      {/* Top row: config (left) + live aggregates (right) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Configure card */}
        <Card>
          <CardHeader>
            <CardTitle>Configure</CardTitle>
            <CardDescription>Define the request and concurrency parameters.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <RequestBuilder onChange={handleBuilderChange} />

            <Separator />

            <FieldGroup className="gap-4">
              <div className="flex flex-wrap gap-6">
                <Field className="w-28">
                  <FieldLabel htmlFor="concurrency">Concurrency (N)</FieldLabel>
                  <p className="text-xs text-muted-foreground -mt-1 mb-1">Parallel queries</p>
                  <Input
                    id="concurrency"
                    type="number"
                    min={1}
                    max={200}
                    value={concurrency}
                    onChange={(e) => setConcurrency(e.target.value)}
                    disabled={running}
                  />
                </Field>
                <Field className="w-28">
                  <FieldLabel htmlFor="iterations">Iterations</FieldLabel>
                  <p className="text-xs text-muted-foreground -mt-1 mb-1">Total queries</p>
                  <Input
                    id="iterations"
                    type="number"
                    min={1}
                    max={2000}
                    value={iterations}
                    onChange={(e) => setIterations(e.target.value)}
                    disabled={running}
                  />
                </Field>
              </div>
            </FieldGroup>
          </CardContent>
          <CardFooter>
            <Button disabled={!canRun} onClick={handleRun}>
              {running ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <PlayIcon data-icon="inline-start" />
              )}
              {running ? `Running… (${done}/${total})` : 'Run test'}
            </Button>
          </CardFooter>
        </Card>

        {/* Live aggregates card */}
        <Card>
          <CardHeader>
            <CardTitle>Live Aggregates</CardTitle>
            <CardDescription>Latency percentiles update as results stream in.</CardDescription>
          </CardHeader>
          <CardContent>
            <AggregatePanel agg={agg} done={done} total={total > 0 ? total : iters} />
          </CardContent>
        </Card>
      </div>

      {/* Per-run results table — only rendered once we have data */}
      {results.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex flex-col gap-1">
              <CardTitle>Per-Run Results</CardTitle>
              <CardDescription>Click a row to inspect its latency waterfall.</CardDescription>
            </div>
            {truncated && (
              <Badge variant="secondary">
                Showing {TABLE_CAP} of {sortedResults.length}
              </Badge>
            )}
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="overflow-auto max-h-[400px] rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-16">#</TableHead>
                    <TableHead className="w-24">Status</TableHead>
                    <TableHead>Wall-clock</TableHead>
                    <TableHead>Warehouse</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleRows.map((row) => (
                    <TableRow
                      key={row.index}
                      className={[
                        'cursor-pointer',
                        selectedIndex === row.index ? 'bg-muted' : '',
                      ].join(' ')}
                      onClick={() =>
                        setSelectedIndex(selectedIndex === row.index ? null : row.index)
                      }
                    >
                      <TableCell className="tabular-nums text-muted-foreground py-2">
                        {row.index + 1}
                      </TableCell>
                      <TableCell className="py-2">
                        <StatusBadge status={row.status} />
                      </TableCell>
                      <TableCell className="tabular-nums py-2">
                        {row.timings.totalWallClockMs > 0
                          ? formatMs(row.timings.totalWallClockMs)
                          : '—'}
                      </TableCell>
                      <TableCell className="tabular-nums py-2">
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
              <p className="text-xs text-muted-foreground">
                Table capped at {TABLE_CAP} rows for performance. Showing iterations 1–{TABLE_CAP}{' '}
                of {sortedResults.length}.
              </p>
            )}

            {/* Expandable waterfall for selected row */}
            {selectedResult && (
              <div className="rounded-xl border border-border bg-muted p-4 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">
                    Iteration #{selectedResult.index + 1} — Latency breakdown
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedIndex(null)}
                  >
                    <XIcon data-icon="inline-start" />
                    Close
                  </Button>
                </div>
                {selectedResult.status !== 'ok' && selectedResult.errorMessage && (
                  <Alert variant="destructive">
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription className="break-words">
                      {selectedResult.errorMessage}
                    </AlertDescription>
                  </Alert>
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
