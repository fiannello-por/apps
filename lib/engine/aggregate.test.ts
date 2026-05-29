import { test, expect } from 'vitest'
import { percentile, summarize } from './aggregate'

test('percentile uses nearest-rank', () => {
  const xs = [10, 20, 30, 40, 50]
  expect(percentile(xs, 50)).toBe(30)
  expect(percentile(xs, 95)).toBe(50)
  expect(percentile(xs, 0)).toBe(10)
})

test('summarize computes stats and error rate', () => {
  const s = summarize([
    { status: 'ok', totalWallClockMs: 100 },
    { status: 'ok', totalWallClockMs: 200 },
    { status: 'error', totalWallClockMs: 0 },
  ])
  expect(s.count).toBe(3)
  expect(s.errorRate).toBeCloseTo(1 / 3)
  expect(s.min).toBe(100)
  expect(s.max).toBe(200)
  expect(s.mean).toBe(150)
  expect(s.p50).toBe(200) // p50 of [100,200] nearest-rank
})
