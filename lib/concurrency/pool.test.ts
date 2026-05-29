import { test, expect, vi } from 'vitest'
import { runPool } from './pool'

test('runs all tasks but never exceeds the concurrency limit', async () => {
  let active = 0, maxActive = 0
  const task = () => new Promise<number>(res => {
    active++; maxActive = Math.max(maxActive, active)
    setTimeout(() => { active--; res(1) }, 5)
  })
  const results = await runPool(10, 3, () => task())
  expect(results).toHaveLength(10)
  expect(maxActive).toBeLessThanOrEqual(3)
})

test('reports progress per completion', async () => {
  const onProgress = vi.fn()
  await runPool(4, 2, async () => 1, onProgress)
  expect(onProgress).toHaveBeenCalledTimes(4)
})
