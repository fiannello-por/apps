import type { ExecutionResult, QuerySpec, ServerPerformance } from './types'

/** The subset of a Lightdash async-results response that the runner reads. */
export interface RawQueryResult {
  status?: string
  error?: string | { message?: string }
  totalResults?: number
  rows?: unknown[]
  metadata?: { performance?: ServerPerformance }
  // Lightdash wraps payloads as { status: 'ok', results: { ...query payload... } }.
  results?: RawQueryResult
  [key: string]: unknown
}

interface RunnerClient {
  createQuery(spec: QuerySpec): Promise<string>
  getResults(queryUuid: string, page?: number, pageSize?: number): Promise<RawQueryResult>
}
interface RunOpts { now?: () => number; sleep?: (ms: number) => Promise<void>; timeoutMs?: number; pageSize?: number }

const READY = 'ready'
const ERROR_STATES = new Set(['error', 'expired', 'cancelled', 'failed'])

/**
 * Lightdash wraps API payloads as `{ status: 'ok', results: {...} }`. The real
 * query status (pending/ready/error) lives on the inner object. Unwrap it when
 * present; otherwise treat the response as already flat (used by unit tests and
 * any non-enveloped shape).
 */
function unwrap(raw: RawQueryResult): RawQueryResult {
  if (raw && typeof raw === 'object' && raw.results && typeof raw.results === 'object' && !Array.isArray(raw.results)) {
    return raw.results
  }
  return raw
}

function errorMessage(p: RawQueryResult): string {
  if (typeof p.error === 'string') return p.error
  if (p.error && typeof p.error === 'object' && typeof p.error.message === 'string') return p.error.message
  return `status: ${p.status}`
}

export async function runSingleQuery(client: RunnerClient, spec: QuerySpec, opts: RunOpts = {}): Promise<ExecutionResult> {
  const now = opts.now ?? (() => Date.now())
  const sleep = opts.sleep ?? ((ms: number) => new Promise(r => setTimeout(r, ms)))
  const timeoutMs = opts.timeoutMs ?? 45000
  const pageSize = opts.pageSize ?? spec.pageSize ?? 500

  const t0 = now()
  let queryUuid: string | null = null
  try {
    queryUuid = await client.createQuery(spec)
  } catch (e) {
    const failMs = now() - t0
    return errorResult(failMs, failMs, queryUuid, (e as Error).message)
  }
  const submitMs = now() - t0

  const waitStart = now()
  let delay = 250
  let raw: RawQueryResult
  let payload: RawQueryResult
  while (true) {
    const pollStart = now()
    if (pollStart - waitStart > timeoutMs) {
      return { status: 'timeout', timings: timings(submitMs, null, null, pollStart - waitStart, 0, pollStart - t0), lightdashQueryUuid: queryUuid, serverPerf: null, rowCount: null, errorMessage: `Timed out after ${timeoutMs}ms` }
    }
    try {
      raw = await client.getResults(queryUuid!, 1, pageSize)
    } catch (e) {
      return errorResult(submitMs, now() - t0, queryUuid, (e as Error).message)
    }
    payload = unwrap(raw)
    if (payload.status === READY) break
    if (payload.status && ERROR_STATES.has(payload.status)) {
      return errorResult(submitMs, now() - t0, queryUuid, errorMessage(payload))
    }
    await sleep(delay)
    delay = Math.min(Math.round(delay * 1.5), 2000)
  }

  const waitWall = now() - waitStart
  const perf = payload.metadata?.performance ?? null
  const queueTimeMs = perf?.queueTimeMs ?? null
  const warehouseExecMs = perf?.initialQueryExecutionMs ?? null
  const resultsFetchMs = perf?.resultsPageExecutionMs ?? 0
  const accountedServer = (queueTimeMs ?? 0) + (warehouseExecMs ?? 0)
  const pollOverheadMs = Math.max(0, waitWall - accountedServer)
  const totalWallClockMs = now() - t0

  return {
    status: 'ok',
    timings: { submitMs, queueTimeMs, warehouseExecMs, pollOverheadMs, resultsFetchMs, totalWallClockMs },
    lightdashQueryUuid: queryUuid,
    serverPerf: perf,
    rowCount: payload.totalResults ?? (Array.isArray(payload.rows) ? payload.rows.length : null),
    errorMessage: null,
    raw,
  }
}

function timings(submitMs: number, q: number | null, w: number | null, pollOverheadMs: number, resultsFetchMs: number, totalWallClockMs: number) {
  return { submitMs, queueTimeMs: q, warehouseExecMs: w, pollOverheadMs, resultsFetchMs, totalWallClockMs }
}
function errorResult(submitMs: number, totalWallClockMs: number, uuid: string | null, msg: string): ExecutionResult {
  return { status: 'error', timings: timings(submitMs, null, null, 0, 0, totalWallClockMs), lightdashQueryUuid: uuid, serverPerf: null, rowCount: null, errorMessage: msg }
}
