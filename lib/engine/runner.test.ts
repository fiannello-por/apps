import { test, expect, vi } from 'vitest'
import { runSingleQuery } from './runner'

function fakeClock(seq: number[]) { let i = 0; return () => seq[Math.min(i++, seq.length - 1)] }

test('happy path: ready after one polling cycle, computes phases', async () => {
  // now() sequence (ms): t0, after-submit, waitStart, poll1(ready), waitWall, total
  const now = fakeClock([0, 100, 100, 900])
  const client = {
    createQuery: vi.fn().mockResolvedValue('q1'),
    getResults: vi.fn().mockResolvedValue({
      status: 'ready', rows: [{ a: 1 }], totalResults: 1,
      metadata: { performance: { queueTimeMs: 50, initialQueryExecutionMs: 600, resultsPageExecutionMs: 120 } },
    }),
  } as any
  const r = await runSingleQuery(client, { endpointType: 'sql', sql: 'select 1' }, { now, sleep: async () => {}, timeoutMs: 45000 })
  expect(r.status).toBe('ok')
  expect(r.lightdashQueryUuid).toBe('q1')
  expect(r.rowCount).toBe(1)
  expect(r.timings.submitMs).toBe(100)
  expect(r.timings.queueTimeMs).toBe(50)
  expect(r.timings.warehouseExecMs).toBe(600)
  expect(r.timings.totalWallClockMs).toBe(900)
  // pollOverhead = wait-until-ready wall (800) - (queue 50 + warehouse 600) = 150
  expect(r.timings.pollOverheadMs).toBe(150)
})

test('error status from results yields error result', async () => {
  const now = fakeClock([0, 10, 10, 20])
  const client = {
    createQuery: vi.fn().mockResolvedValue('q1'),
    getResults: vi.fn().mockResolvedValue({ status: 'error', error: 'boom' }),
  } as any
  const r = await runSingleQuery(client, { endpointType: 'sql', sql: 'x' }, { now, sleep: async () => {}, timeoutMs: 45000 })
  expect(r.status).toBe('error')
  expect(r.errorMessage).toBe('boom')
  // submitMs measured before the error must be preserved, not zeroed
  expect(r.timings.submitMs).toBe(10)
})

test('timeout when never ready', async () => {
  // t0=0, submit=5, waitStart=10, firstPoll=20000 (>timeout) -> timeout, no hang
  const now = fakeClock([0, 5, 10, 20000])
  const client = {
    createQuery: vi.fn().mockResolvedValue('q1'),
    getResults: vi.fn().mockResolvedValue({ status: 'executing' }),
  } as any
  const r = await runSingleQuery(client, { endpointType: 'sql', sql: 'x' }, { now, sleep: async () => {}, timeoutMs: 1000 })
  expect(r.status).toBe('timeout')
})

test('unwraps Lightdash { status: ok, results } envelope on ready', async () => {
  const now = fakeClock([0, 100, 100, 900])
  const client = {
    createQuery: vi.fn().mockResolvedValue('q1'),
    getResults: vi.fn().mockResolvedValue({
      status: 'ok',
      results: {
        status: 'ready',
        rows: [{ a: 1 }],
        totalResults: 1,
        metadata: { performance: { queueTimeMs: 50, initialQueryExecutionMs: 600, resultsPageExecutionMs: 120 } },
      },
    }),
  } as any
  const r = await runSingleQuery(client, { endpointType: 'sql', sql: 'x' }, { now, sleep: async () => {}, timeoutMs: 45000 })
  expect(r.status).toBe('ok')
  expect(r.rowCount).toBe(1)
  expect(r.timings.warehouseExecMs).toBe(600)
})

test('surfaces a warehouse error from the enveloped results status', async () => {
  const now = fakeClock([0, 10, 10, 20])
  const client = {
    createQuery: vi.fn().mockResolvedValue('q1'),
    getResults: vi.fn().mockResolvedValue({
      status: 'ok',
      results: { status: 'error', error: 'Access Denied: Table sfdc.OpportunityViewTable' },
    }),
  } as any
  const r = await runSingleQuery(client, { endpointType: 'sql', sql: 'x' }, { now, sleep: async () => {}, timeoutMs: 45000 })
  expect(r.status).toBe('error')
  expect(r.errorMessage).toContain('Access Denied')
})
