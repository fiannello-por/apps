'use client'

import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { RequestBuilder, type RequestBuilderValue } from '@/components/request-builder'
import { LatencyWaterfall } from '@/components/latency-waterfall'
import type { ExecutionResult } from '@/lib/engine/types'

function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`
  return `${Math.round(ms)}ms`
}

export default function ExplorerPage() {
  const [builderValue, setBuilderValue] = useState<RequestBuilderValue | null>(null)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<ExecutionResult | null>(null)
  const [showRaw, setShowRaw] = useState(false)

  const handleBuilderChange = useCallback((value: RequestBuilderValue) => {
    setBuilderValue(value)
  }, [])

  const canRun = !running && !!builderValue?.connectionId && isSpecComplete(builderValue)

  async function handleRun() {
    if (!builderValue) return
    setRunning(true)
    setResult(null)
    setShowRaw(false)

    const { connectionId, spec } = builderValue

    try {
      // 1. Create test run
      const createRes = await fetch('/api/test-runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionId,
          spec,
          mode: 'single',
          concurrency: 1,
          iterations: 1,
        }),
      })
      if (!createRes.ok) {
        const err = await createRes.json().catch(() => ({}))
        throw new Error(err?.error ? JSON.stringify(err.error) : 'Failed to create test run.')
      }
      const { id: testRunId } = await createRes.json()

      // 2. Execute run
      const runRes = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionId,
          testRunId,
          iterationIndex: 0,
          spec,
        }),
      })
      if (!runRes.ok) {
        const err = await runRes.json().catch(() => ({}))
        throw new Error(err?.error ? JSON.stringify(err.error) : 'Run request failed.')
      }
      const execResult: ExecutionResult = await runRes.json()

      // 3. Finalize
      await fetch(`/api/test-runs/${testRunId}`, { method: 'PATCH' }).catch(() => {
        // non-critical – don't throw
      })

      setResult(execResult)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Page heading */}
      <div>
        <h1 className="text-[18px] font-semibold tracking-[-0.45px] text-deep-black leading-[1.33]">
          API Explorer
        </h1>
        <p className="mt-1 text-[14px] text-midtone-gray">
          Run a single query against your Lightdash instance and inspect the latency breakdown.
        </p>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* Left panel: Request builder */}
        <Card className="rounded-[14px] border border-subtle-ash bg-canvas-white shadow-[oklab(0.145_-0.00000143796_0.00000340492_/_0.1)_0px_0px_0px_1px]">
          <CardHeader className="px-4 pt-4 pb-0">
            <CardTitle className="text-[14px] font-semibold text-rich-black tracking-tight">
              Request
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pt-3 pb-4">
            <RequestBuilder onChange={handleBuilderChange} />

            {/* Run button */}
            <div className="mt-5 flex items-center gap-3">
              <Button
                disabled={!canRun}
                onClick={handleRun}
                className="rounded-[10px] bg-deep-black text-canvas-white text-[13px] font-medium px-6 h-8 hover:bg-[#222] disabled:opacity-40"
              >
                {running ? 'Running…' : 'Run query'}
              </Button>
              {running && (
                <span className="text-[13px] text-midtone-gray animate-pulse">
                  Waiting for response…
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Right panel: Result */}
        <Card className="rounded-[14px] border border-subtle-ash bg-canvas-white shadow-[oklab(0.145_-0.00000143796_0.00000340492_/_0.1)_0px_0px_0px_1px]">
          <CardHeader className="px-4 pt-4 pb-0">
            <CardTitle className="text-[14px] font-semibold text-rich-black tracking-tight">
              Result
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pt-3 pb-4">
            {running ? (
              <LoadingSkeleton />
            ) : result ? (
              <ResultPanel result={result} showRaw={showRaw} onToggleRaw={() => setShowRaw((v) => !v)} />
            ) : (
              <EmptyResult />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────

function isSpecComplete(v: RequestBuilderValue): boolean {
  const { endpointType, spec } = v
  if (endpointType === 'sql') return !!(spec.sql && spec.sql.trim().length > 0)
  if (endpointType === 'saved_chart') return !!(spec.chartUuid && spec.chartUuid.length > 0)
  // metric_query / underlying_data: need exploreName
  return !!(spec.query?.exploreName)
}

// ── Sub-components ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline gap-6 pb-3 border-b border-subtle-ash">
        <Skeleton className="h-8 w-24 rounded" />
        <Skeleton className="h-6 w-16 rounded" />
        <Skeleton className="h-6 w-16 rounded" />
      </div>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-4 w-[130px] rounded shrink-0" />
          <Skeleton className="h-5 flex-1 rounded" />
          <Skeleton className="h-4 w-[68px] rounded shrink-0" />
        </div>
      ))}
    </div>
  )
}

function EmptyResult() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div
        className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-ghost-gray text-midtone-gray"
        aria-hidden
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <p className="text-[14px] font-medium text-rich-black">No result yet</p>
      <p className="mt-1 text-[13px] text-midtone-gray">
        Configure a request on the left and click Run query.
      </p>
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
  if (result.status === 'error' || result.status === 'timeout') {
    return (
      <div className="flex flex-col gap-4">
        {/* Error callout */}
        <div className="rounded-[10px] border border-[#c22b10]/30 bg-[#c22b10]/5 px-4 py-3">
          <p className="text-[13px] font-medium text-callout-red mb-1">
            {result.status === 'timeout' ? 'Timeout' : 'Error'}
          </p>
          <p className="text-[13px] text-callout-red/80 break-words">
            {result.errorMessage ?? 'An unknown error occurred.'}
          </p>
        </div>

        {/* Timings (still show even on error) */}
        {result.timings && (
          <div className="pt-2">
            <LatencyWaterfall timings={result.timings} />
          </div>
        )}

        {/* Raw JSON toggle */}
        <RawJsonSection result={result} showRaw={showRaw} onToggle={onToggleRaw} />
      </div>
    )
  }

  // status === 'ok'
  return (
    <div className="flex flex-col gap-5">
      {/* Headline stats */}
      <div className="flex flex-wrap items-center gap-4">
        <StatChip label="Wall-clock" value={formatMs(result.timings.totalWallClockMs)} emphasis />
        {result.timings.warehouseExecMs !== null && (
          <StatChip label="Warehouse" value={formatMs(result.timings.warehouseExecMs)} />
        )}
        {result.timings.queueTimeMs !== null && (
          <StatChip label="Queue" value={formatMs(result.timings.queueTimeMs)} />
        )}
        {result.rowCount !== null && (
          <StatChip label="Rows" value={result.rowCount.toLocaleString()} />
        )}
      </div>

      {/* Waterfall */}
      <LatencyWaterfall timings={result.timings} />

      {/* Raw JSON toggle */}
      <RawJsonSection result={result} showRaw={showRaw} onToggle={onToggleRaw} />
    </div>
  )
}

function StatChip({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-medium uppercase tracking-wider text-midtone-gray">{label}</span>
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

function RawJsonSection({
  result,
  showRaw,
  onToggle,
}: {
  result: ExecutionResult
  showRaw: boolean
  onToggle: () => void
}) {
  return (
    <div className="border-t border-subtle-ash pt-3">
      <button
        type="button"
        onClick={onToggle}
        className="text-[13px] text-midtone-gray hover:text-rich-black flex items-center gap-1 transition-colors"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={['transition-transform', showRaw ? 'rotate-90' : ''].join(' ')}
        >
          <polyline points="3 2 9 6 3 10" />
        </svg>
        {showRaw ? 'Hide' : 'Show'} raw JSON
      </button>
      {showRaw && (
        <pre className="mt-3 font-mono text-[12px] text-rich-black bg-ghost-gray rounded-[10px] p-3 overflow-auto max-h-[400px] whitespace-pre-wrap break-words">
          {JSON.stringify(result.raw ?? result, null, 2)}
        </pre>
      )}
    </div>
  )
}
