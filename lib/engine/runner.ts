import type { ExecutionResult, QuerySpec } from './types'

interface RunnerClient {
  createQuery(spec: QuerySpec): Promise<string>
  getResults(queryUuid: string, page?: number, pageSize?: number): Promise<any>
}
interface RunOpts { now?: () => number; sleep?: (ms: number) => Promise<void>; timeoutMs?: number; pageSize?: number }

const READY = 'ready'
const ERROR_STATES = new Set(['error', 'expired', 'cancelled'])

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
    return errorResult(now() - t0, queryUuid, (e as Error).message)
  }
  const submitMs = now() - t0

  const waitStart = now()
  let delay = 250
  let result: any
  while (true) {
    const pollStart = now()
    if (pollStart - waitStart > timeoutMs) {
      return { status: 'timeout', timings: timings(submitMs, null, null, now() - waitStart, 0, now() - t0), lightdashQueryUuid: queryUuid, serverPerf: null, rowCount: null, errorMessage: `Timed out after ${timeoutMs}ms` }
    }
    try {
      result = await client.getResults(queryUuid!, 1, pageSize)
    } catch (e) {
      return errorResult(now() - t0, queryUuid, (e as Error).message)
    }
    if (result.status === READY) break
    if (ERROR_STATES.has(result.status)) return errorResult(now() - t0, queryUuid, result.error ?? `status: ${result.status}`)
    await sleep(delay)
    delay = Math.min(Math.round(delay * 1.5), 2000)
  }

  const waitWall = now() - waitStart
  const perf = result?.metadata?.performance ?? null
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
    rowCount: result.totalResults ?? (Array.isArray(result.rows) ? result.rows.length : null),
    errorMessage: null,
    raw: result,
  }
}

function timings(submitMs: number, q: number | null, w: number | null, pollOverheadMs: number, resultsFetchMs: number, totalWallClockMs: number) {
  return { submitMs, queueTimeMs: q, warehouseExecMs: w, pollOverheadMs, resultsFetchMs, totalWallClockMs }
}
function errorResult(totalWallClockMs: number, uuid: string | null, msg: string): ExecutionResult {
  return { status: 'error', timings: timings(0, null, null, 0, 0, totalWallClockMs), lightdashQueryUuid: uuid, serverPerf: null, rowCount: null, errorMessage: msg }
}
