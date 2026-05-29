import type { PhaseTimings } from './types'

export interface Bar {
  label: string
  ms: number
  leftPct: number
  widthPct: number
  source: 'server' | 'client'
}

export function toBars(t: PhaseTimings): Bar[] {
  const total = t.totalWallClockMs || 1
  const phases: Array<{ label: string; ms: number; source: 'server' | 'client' }> = [
    { label: 'Submit', ms: t.submitMs, source: 'client' },
    { label: 'Queue', ms: t.queueTimeMs ?? 0, source: 'server' },
    { label: 'Warehouse', ms: t.warehouseExecMs ?? 0, source: 'server' },
    { label: 'Poll overhead', ms: t.pollOverheadMs, source: 'client' },
    { label: 'Results fetch', ms: t.resultsFetchMs, source: 'client' },
  ]
  let cursor = 0
  return phases.map(p => {
    const leftPct = (cursor / total) * 100
    const widthPct = (p.ms / total) * 100
    cursor += p.ms
    return { ...p, leftPct, widthPct }
  })
}
