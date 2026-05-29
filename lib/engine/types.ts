export type EndpointType = 'metric_query' | 'sql' | 'saved_chart' | 'underlying_data'

export interface Connection { baseUrl: string; projectUuid: string; token: string }

export interface QuerySpec {
  endpointType: EndpointType
  // metric_query / underlying_data
  query?: {
    exploreName: string
    dimensions: string[]
    metrics: string[]
    filters?: unknown
    sorts?: unknown[]
    limit?: number
    tableCalculations?: unknown[]
  }
  // sql
  sql?: string
  // saved_chart
  chartUuid?: string
  pageSize?: number
}

export interface ServerPerformance {
  queueTimeMs?: number
  initialQueryExecutionMs?: number
  resultsPageExecutionMs?: number
}

export interface PhaseTimings {
  submitMs: number
  queueTimeMs: number | null
  warehouseExecMs: number | null
  pollOverheadMs: number
  resultsFetchMs: number
  totalWallClockMs: number
}

export interface ExecutionResult {
  status: 'ok' | 'error' | 'timeout'
  timings: PhaseTimings
  lightdashQueryUuid: string | null
  serverPerf: ServerPerformance | null
  rowCount: number | null
  errorMessage: string | null
  raw?: unknown
}
