import type { Connection, QuerySpec } from './types'

type FetchFn = typeof fetch
const PATHS: Record<QuerySpec['endpointType'], string> = {
  metric_query: 'metric-query',
  sql: 'sql',
  saved_chart: 'chart',
  underlying_data: 'underlying-data',
}

export class LightdashClient {
  constructor(private conn: Connection, private fetchFn: FetchFn = fetch) {}

  private headers() {
    return { Authorization: `ApiKey ${this.conn.token}`, 'Content-Type': 'application/json' }
  }
  private base() { return `${this.conn.baseUrl.replace(/\/$/, '')}/api/v2/projects/${this.conn.projectUuid}` }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private bodyFor(spec: QuerySpec): any {
    switch (spec.endpointType) {
      case 'metric_query':
      case 'underlying_data': {
        const q = spec.query
        // Lightdash's MetricQuery schema requires filters/sorts/tableCalculations
        // to be present (even when empty), so always supply defaults.
        return {
          context: 'api',
          query: {
            exploreName: q?.exploreName,
            dimensions: q?.dimensions ?? [],
            metrics: q?.metrics ?? [],
            filters: q?.filters ?? {},
            sorts: q?.sorts ?? [],
            limit: q?.limit ?? 500,
            tableCalculations: q?.tableCalculations ?? [],
          },
        }
      }
      case 'sql':
        return { context: 'api', sql: spec.sql }
      case 'saved_chart':
        return { context: 'api', chartUuid: spec.chartUuid }
    }
  }

  async createQuery(spec: QuerySpec): Promise<string> {
    const res = await this.fetchFn(`${this.base()}/query/${PATHS[spec.endpointType]}`, {
      method: 'POST', headers: this.headers(), body: JSON.stringify(this.bodyFor(spec)),
    })
    if (!res.ok) throw new Error(`Lightdash create query failed: ${res.status} ${await res.text()}`)
    const json = await res.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (json as any).results.queryUuid as string
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async getResults(queryUuid: string, page = 1, pageSize = 500): Promise<any> {
    const res = await this.fetchFn(`${this.base()}/query/${queryUuid}?page=${page}&pageSize=${pageSize}`, {
      method: 'GET', headers: this.headers(),
    })
    if (!res.ok) throw new Error(`Lightdash get results failed: ${res.status} ${await res.text()}`)
    return res.json()
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async listExplores(): Promise<any> {
    const res = await this.fetchFn(`${this.conn.baseUrl.replace(/\/$/, '')}/api/v1/projects/${this.conn.projectUuid}/explores`, { headers: this.headers() })
    if (!res.ok) throw new Error(`listExplores failed: ${res.status}`)
    return res.json()
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async getExplore(name: string): Promise<any> {
    const res = await this.fetchFn(`${this.conn.baseUrl.replace(/\/$/, '')}/api/v1/projects/${this.conn.projectUuid}/explores/${name}`, { headers: this.headers() })
    if (!res.ok) throw new Error(`getExplore failed: ${res.status}`)
    return res.json()
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async listCharts(): Promise<any> {
    const res = await this.fetchFn(`${this.conn.baseUrl.replace(/\/$/, '')}/api/v1/projects/${this.conn.projectUuid}/charts`, { headers: this.headers() })
    if (!res.ok) throw new Error(`listCharts failed: ${res.status}`)
    return res.json()
  }
}
