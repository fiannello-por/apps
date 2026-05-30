'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ClockIcon } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Card } from '@/components/ui/card'
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '@/components/ui/empty'
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
  if (status === 'completed') return <Badge variant="secondary">completed</Badge>
  if (status === 'running') return <Badge variant="default">running</Badge>
  if (status === 'partial') return <Badge variant="outline">partial</Badge>
  return <Badge variant="destructive">{status}</Badge>
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
      <PageHeader
        title="History"
        description="Every run is saved. Reopen any run's latency breakdown or re-run it."
      />

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="px-4">Started</TableHead>
              <TableHead>Connection</TableHead>
              <TableHead>Endpoint</TableHead>
              <TableHead>Mode</TableHead>
              <TableHead>N × iters</TableHead>
              <TableHead className="tabular-nums">p50</TableHead>
              <TableHead className="tabular-nums">p95</TableHead>
              <TableHead>Error rate</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i} className="hover:bg-transparent">
                  {Array.from({ length: 9 }).map((__, j) => (
                    <TableCell key={j} className="py-3 px-4">
                      <Skeleton className="h-4 w-full rounded" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : runs.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={9} className="py-0">
                  <Empty className="border-0 py-16">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <ClockIcon />
                      </EmptyMedia>
                      <EmptyTitle>No runs yet</EmptyTitle>
                      <EmptyDescription>
                        Run a query in the{' '}
                        <Link href="/explorer">Explorer</Link>{' '}
                        or{' '}
                        <Link href="/concurrency">Concurrency</Link>{' '}
                        page to see results here.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </TableCell>
              </TableRow>
            ) : (
              runs.map((run) => (
                <TableRow
                  key={run.id}
                  className="cursor-pointer transition-colors"
                >
                  <TableCell className="py-2.5 px-4 whitespace-nowrap">
                    <Link href={`/history/${run.id}`} className="block w-full h-full text-foreground">
                      {formatDateTime(run.startedAt)}
                    </Link>
                  </TableCell>
                  <TableCell className="py-2.5 max-w-[160px] truncate">
                    <Link href={`/history/${run.id}`} className="block w-full h-full text-foreground">
                      {run.connectionName ?? run.connectionId.slice(0, 8) + '…'}
                    </Link>
                  </TableCell>
                  <TableCell className="py-2.5">
                    <Link href={`/history/${run.id}`} className="block w-full h-full text-foreground">
                      {endpointLabel(run.endpointType)}
                    </Link>
                  </TableCell>
                  <TableCell className="py-2.5 capitalize">
                    <Link href={`/history/${run.id}`} className="block w-full h-full text-foreground">
                      {run.mode}
                    </Link>
                  </TableCell>
                  <TableCell className="py-2.5 tabular-nums">
                    <Link href={`/history/${run.id}`} className="block w-full h-full text-foreground">
                      {run.concurrency} × {run.iterations}
                    </Link>
                  </TableCell>
                  <TableCell className="py-2.5 tabular-nums">
                    <Link href={`/history/${run.id}`} className="block w-full h-full text-foreground">
                      {run.aggregates ? formatMs(run.aggregates.p50) : '—'}
                    </Link>
                  </TableCell>
                  <TableCell className="py-2.5 tabular-nums">
                    <Link href={`/history/${run.id}`} className="block w-full h-full text-foreground">
                      {run.aggregates ? formatMs(run.aggregates.p95) : '—'}
                    </Link>
                  </TableCell>
                  <TableCell className={[
                    'py-2.5 tabular-nums',
                    run.aggregates && run.aggregates.errorRate > 0 ? 'text-destructive' : 'text-foreground',
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
      </Card>
    </div>
  )
}
