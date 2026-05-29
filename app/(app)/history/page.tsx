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

// ── Sub-components ─────────────────────────────────────────────────────────

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

// ── Page ───────────────────────────────────────────────────────────────────

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
