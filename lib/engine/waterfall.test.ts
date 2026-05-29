import { test, expect } from 'vitest'
import { toBars } from './waterfall'

test('produces sequential bars summing across phases as % of total', () => {
  const bars = toBars({ submitMs: 100, queueTimeMs: 70, warehouseExecMs: 900, pollOverheadMs: 150, resultsFetchMs: 280, totalWallClockMs: 1500 })
  expect(bars.map(b => b.label)).toEqual(['Submit', 'Queue', 'Warehouse', 'Poll overhead', 'Results fetch'])
  expect(bars[0].leftPct).toBeCloseTo(0)
  expect(bars[0].widthPct).toBeCloseTo(100 * 100 / 1500)
  expect(bars[2].source).toBe('server')
  for (let i = 1; i < bars.length; i++) {
    expect(bars[i].leftPct).toBeCloseTo(bars[i - 1].leftPct + bars[i - 1].widthPct)
  }
})
