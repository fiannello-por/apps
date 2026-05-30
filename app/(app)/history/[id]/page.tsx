'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { RotateCcwIcon, AlertCircleIcon } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { StatTiles, type Stat } from '@/components/stat-tiles'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { Spinner } from '@/components/ui/spinner'
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

// ── Helpers ────────────────────────────────────────────────────────────────

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

// ── Sub-components ─────────────────────────────────────────────────────────

function RunStatusBadge({ status }: { status: RunRow['status'] }) {
  if (status === 'completed') return <Badge variant="secondary">completed</Badge>
  if (status === 'running') return <Badge variant="default">running</Badge>
  if (status === 'partial') return <Badge variant="outline">partial</Badge>
  return <Badge variant="destructive">{status}</Badge>
}

function ExecStatusBadge({ status }: { status: 'ok' | 'error' | 'timeout' }) {
  if (status === 'ok') return <Badge variant="secondary">ok</Badge>
  if (status === 'timeout') return <Badge variant="outline">timeout</Badge>
  return <Badge variant="destructive">{status}</Badge>
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function HistoryDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : ''

  const [run, setRun] = useState<RunRow | null>(null)
  const [executions, setExecutions] = useState<ExecutionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
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
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'Failed to load run')
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
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-48 rounded" />
          <Skeleton className="h-4 w-72 rounded" />
        </div>
        <Skeleton className="h-16 rounded-xl" />
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    )
  }

  if (loadError || !run) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Run not found" />
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>Could not load run</AlertTitle>
          <AlertDescription>
            {loadError ?? 'This run may have been deleted or the ID is invalid.'}
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  // ── Aggregate stats tiles ──────────────────────────────────────────────

  const stats: Stat[] = run.aggregates
    ? [
        { label: 'p50', value: formatMs(run.aggregates.p50) },
        { label: 'p95', value: formatMs(run.aggregates.p95), emphasis: run.aggregates.p95 > run.aggregates.p50 * 2 },
        { label: 'p99', value: formatMs(run.aggregates.p99), emphasis: true },
        { label: 'Error rate', value: `${(run.aggregates.errorRate * 100).toFixed(1)}%`, emphasis: run.aggregates.errorRate > 0 },
        { label: 'Count', value: run.aggregates.count.toString() },
        { label: 'Min', value: formatMs(run.aggregates.min) },
        { label: 'Mean', value: formatMs(run.aggregates.mean) },
        { label: 'Max', value: formatMs(run.aggregates.max), emphasis: true },
      ]
    : []

  // ── Main render ────────────────────────────────────────────────────────

  const runTitle = `${endpointLabel(run.endpointType)} · ${run.mode === 'single' ? 'Single' : 'Concurrent'}`
  const runDescription = [
    run.connectionName ?? run.connectionId.slice(0, 8) + '…',
    `${run.concurrency} × ${run.iterations} iterations`,
    run.startedAt ? `Started ${formatDateTime(run.startedAt)}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="flex flex-col gap-6">
      {/* Page heading */}
      <PageHeader
        title={runTitle}
        description={runDescription}
        actions={
          <div className="flex items-center gap-3">
            <RunStatusBadge status={run.status} />
            <Button
              disabled={rerunning}
              onClick={handleRerun}
            >
              {rerunning ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <RotateCcwIcon data-icon="inline-start" />
              )}
              {rerunning
                ? rerunProgress
                  ? `Re-running… (${rerunProgress.done}/${rerunProgress.total})`
                  : 'Re-running…'
                : 'Re-run'}
            </Button>
          </div>
        }
      />

      {/* Aggregate stat tiles */}
      {run.aggregates ? (
        <StatTiles stats={stats} />
      ) : (
        <Alert>
          <AlertTitle>No aggregates yet</AlertTitle>
          <AlertDescription>
            Run may still be in progress. Refresh when complete to see stats.
          </AlertDescription>
        </Alert>
      )}

      <Separator />

      {/* Executions table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between px-4 pt-4 pb-0">
          <CardTitle className="text-sm font-semibold">Executions</CardTitle>
          {truncated && (
            <span className="text-xs text-muted-foreground tabular-nums">
              Showing {TABLE_CAP} of {executions.length}
            </span>
          )}
        </CardHeader>
        <CardContent className="px-4 pt-3 pb-4 flex flex-col gap-4">
          {executions.length > 1 && (
            <p className="text-xs text-muted-foreground">
              Click a row to inspect its latency waterfall.
            </p>
          )}

          <div className="overflow-auto max-h-[400px] rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-12">#</TableHead>
                  <TableHead className="w-24">Status</TableHead>
                  <TableHead>Wall-clock</TableHead>
                  <TableHead>Warehouse</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleExecs.map((exec) => (
                  <TableRow
                    key={exec.id}
                    className={[
                      'transition-colors',
                      executions.length > 1 ? 'cursor-pointer' : '',
                      selectedExecId === exec.id ? 'bg-muted' : '',
                    ].join(' ')}
                    onClick={() => {
                      if (executions.length > 1) {
                        setSelectedExecId(selectedExecId === exec.id ? null : exec.id)
                      }
                    }}
                  >
                    <TableCell className="tabular-nums text-muted-foreground py-2">
                      {exec.iterationIndex + 1}
                    </TableCell>
                    <TableCell className="py-2">
                      <ExecStatusBadge status={exec.status} />
                    </TableCell>
                    <TableCell className="tabular-nums py-2">
                      {exec.totalWallClockMs != null && exec.totalWallClockMs > 0
                        ? formatMs(exec.totalWallClockMs)
                        : '—'}
                    </TableCell>
                    <TableCell className="tabular-nums py-2">
                      {exec.warehouseExecMs != null ? formatMs(exec.warehouseExecMs) : '—'}
                    </TableCell>
                    <TableCell className="py-2 max-w-[240px] truncate text-xs text-muted-foreground">
                      {exec.errorMessage ?? ''}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Truncation note */}
          {truncated && (
            <p className="text-xs text-muted-foreground">
              Table capped at {TABLE_CAP} rows. Showing iterations 1–{TABLE_CAP} of {executions.length}.
            </p>
          )}

          {/* Waterfall for single-run (auto-selected) or user-selected row */}
          {selectedExec && (
            <Card className="bg-muted">
              <CardHeader className="px-4 pt-4 pb-0 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-semibold">
                  Iteration #{selectedExec.iterationIndex + 1} — Latency breakdown
                </CardTitle>
                {executions.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedExecId(null)}
                  >
                    Close
                  </Button>
                )}
              </CardHeader>
              <CardContent className="px-4 pt-3 pb-4 flex flex-col gap-3">
                {selectedExec.status !== 'ok' && selectedExec.errorMessage && (
                  <Alert variant="destructive">
                    <AlertCircleIcon />
                    <AlertDescription className="break-words">
                      {selectedExec.errorMessage}
                    </AlertDescription>
                  </Alert>
                )}
                <LatencyWaterfall timings={toPhaseTimings(selectedExec)} />
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
