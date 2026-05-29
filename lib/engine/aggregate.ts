export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  if (p <= 0) return sorted[0]
  const idx = Math.floor((p / 100) * sorted.length)
  return sorted[Math.min(idx, sorted.length - 1)]
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
