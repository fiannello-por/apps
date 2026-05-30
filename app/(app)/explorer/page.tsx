'use client'

import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { Gauge, Play, Code2, ChevronRight } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { ScrollArea } from '@/components/ui/scroll-area'
import { PageHeader } from '@/components/page-header'
import { StatTiles, type Stat } from '@/components/stat-tiles'
import { RequestBuilder, type RequestBuilderValue } from '@/components/request-builder'
import { LatencyWaterfall } from '@/components/latency-waterfall'
import type { ExecutionResult } from '@/lib/engine/types'
import { cn } from '@/lib/utils'

function fmt(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`
  return `${Math.round(ms)}ms`
}

export default function ExplorerPage() {
  const [builderValue, setBuilderValue] = useState<RequestBuilderValue | null>(null)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<ExecutionResult | null>(null)
  const [showRaw, setShowRaw] = useState(false)

  const handleBuilderChange = useCallback((v: RequestBuilderValue) => setBuilderValue(v), [])
  const canRun = !running && !!builderValue?.connectionId && isSpecComplete(builderValue)

  async function handleRun() {
    if (!builderValue) return
    setRunning(true)
    setResult(null)
    setShowRaw(false)
    const { connectionId, spec } = builderValue
    try {
      const createRes = await fetch('/api/test-runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId, spec, mode: 'single', concurrency: 1, iterations: 1 }),
      })
      if (!createRes.ok) {
        const err = await createRes.json().catch(() => ({}))
        throw new Error(err?.error ? JSON.stringify(err.error) : 'Failed to create test run.')
      }
      const { id: testRunId } = await createRes.json()

      const runRes = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId, testRunId, iterationIndex: 0, spec, includeRaw: true }),
      })
      if (!runRes.ok) {
        const err = await runRes.json().catch(() => ({}))
        throw new Error(err?.error ? JSON.stringify(err.error) : 'Run request failed.')
      }
      const execResult: ExecutionResult = await runRes.json()
      await fetch(`/api/test-runs/${testRunId}`, { method: 'PATCH' }).catch(() => {})
      setResult(execResult)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        title="API Explorer"
        description="Run a single query against your Lightdash instance and inspect exactly where the latency goes."
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Request */}
        <Card>
          <CardHeader>
            <CardTitle>Request</CardTitle>
            <CardDescription>Compose a query and send it through the v2 async API.</CardDescription>
          </CardHeader>
          <CardContent>
            <RequestBuilder onChange={handleBuilderChange} />
          </CardContent>
          <CardFooter>
            <Button onClick={handleRun} disabled={!canRun}>
              {running ? <Spinner data-icon="inline-start" /> : <Play data-icon="inline-start" />}
              {running ? 'Running…' : 'Run query'}
            </Button>
          </CardFooter>
        </Card>

        {/* Result */}
        <Card>
          <CardHeader>
            <CardTitle>Result</CardTitle>
            <CardDescription>Latency breakdown and raw response.</CardDescription>
          </CardHeader>
          <CardContent>
            {running ? (
              <LoadingState />
            ) : result ? (
              <ResultPanel result={result} showRaw={showRaw} onToggleRaw={() => setShowRaw((v) => !v)} />
            ) : (
              <Empty className="border-0 py-12">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Gauge />
                  </EmptyMedia>
                  <EmptyTitle>No result yet</EmptyTitle>
                  <EmptyDescription>Configure a request and click Run query.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function isSpecComplete(v: RequestBuilderValue): boolean {
  const { endpointType, spec } = v
  if (endpointType === 'sql') return !!spec.sql?.trim()
  if (endpointType === 'saved_chart') return !!spec.chartUuid
  return !!spec.query?.exploreName
}

function LoadingState() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-[68px] w-full rounded-xl" />
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-3.5 w-[104px] shrink-0 rounded" />
          <Skeleton className="h-[18px] flex-1 rounded" />
          <Skeleton className="h-3.5 w-[58px] shrink-0 rounded" />
        </div>
      ))}
    </div>
  )
}

function ResultPanel({
  result,
  showRaw,
  onToggleRaw,
}: {
  result: ExecutionResult
  showRaw: boolean
  onToggleRaw: () => void
}) {
  const isError = result.status === 'error' || result.status === 'timeout'

  const stats: Stat[] = [
    { label: 'Wall-clock', value: fmt(result.timings.totalWallClockMs), emphasis: true },
    ...(result.timings.warehouseExecMs !== null ? [{ label: 'Warehouse', value: fmt(result.timings.warehouseExecMs) }] : []),
    ...(result.timings.queueTimeMs !== null ? [{ label: 'Queue', value: fmt(result.timings.queueTimeMs) }] : []),
    ...(result.rowCount !== null ? [{ label: 'Rows', value: result.rowCount.toLocaleString() }] : []),
  ]

  return (
    <div className="flex flex-col gap-5">
      {isError && (
        <Alert variant="destructive">
          <AlertTitle>{result.status === 'timeout' ? 'Query timed out' : 'Query failed'}</AlertTitle>
          <AlertDescription className="break-words">
            {result.errorMessage ?? 'An unknown error occurred.'}
          </AlertDescription>
        </Alert>
      )}

      {!isError && <StatTiles stats={stats} />}

      <LatencyWaterfall timings={result.timings} />

      {/* Raw JSON */}
      <div className="border-t border-border pt-4">
        <button
          type="button"
          onClick={onToggleRaw}
          className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronRight className={cn('size-3.5 transition-transform', showRaw && 'rotate-90')} />
          <Code2 className="size-3.5" />
          {showRaw ? 'Hide' : 'Show'} raw response
        </button>
        {showRaw && (
          <ScrollArea className="mt-3 max-h-[360px] w-full rounded-lg border border-border bg-muted/50">
            <pre className="p-3.5 font-mono text-[12px] leading-relaxed whitespace-pre-wrap break-words text-foreground">
              {JSON.stringify(result.raw ?? result, null, 2)}
            </pre>
          </ScrollArea>
        )}
      </div>
    </div>
  )
}
