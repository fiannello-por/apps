import { test, expect, vi } from 'vitest'
import { LightdashClient } from './lightdash-client'

const conn = { baseUrl: 'https://ld.example.com', projectUuid: 'p1', token: 'tok' }

test('createQuery posts to the v2 metric-query endpoint with auth header and returns queryUuid', async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true, status: 200,
    json: async () => ({ status: 'ok', results: { queryUuid: 'q1' } }),
  })
  const c = new LightdashClient(conn, fetchMock as any)
  const uuid = await c.createQuery({ endpointType: 'metric_query', query: { exploreName: 'orders', dimensions: [], metrics: [] } })
  expect(uuid).toBe('q1')
  const [url, opts] = fetchMock.mock.calls[0]
  expect(url).toBe('https://ld.example.com/api/v2/projects/p1/query/metric-query')
  expect(opts.method).toBe('POST')
  expect(opts.headers.Authorization).toBe('ApiKey tok')
  // Lightdash requires filters/sorts/tableCalculations to be present in the body.
  const body = JSON.parse(opts.body)
  expect(body.query.filters).toEqual({})
  expect(body.query.sorts).toEqual([])
  expect(body.query.tableCalculations).toEqual([])
  expect(body.query.limit).toBe(500)
})

test('getResults fetches the results endpoint with paging', async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true, status: 200,
    json: async () => ({ status: 'ready', rows: [{ a: 1 }], totalResults: 1, metadata: { performance: { queueTimeMs: 5 } } }),
  })
  const c = new LightdashClient(conn, fetchMock as any)
  const r = await c.getResults('q1', 1, 500)
  expect(r.status).toBe('ready')
  expect(fetchMock.mock.calls[0][0]).toContain('/api/v2/projects/p1/query/q1?page=1&pageSize=500')
})

test('throws on non-ok HTTP', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'unauthorized' })
  const c = new LightdashClient(conn, fetchMock as any)
  await expect(c.createQuery({ endpointType: 'sql', sql: 'select 1' })).rejects.toThrow(/401/)
})
