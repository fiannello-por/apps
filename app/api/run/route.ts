import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { loadConnection } from '@/lib/connections/service'
import { LightdashClient } from '@/lib/engine/lightdash-client'
import { runSingleQuery } from '@/lib/engine/runner'
import { getDb } from '@/lib/db/client'
import { queryExecutions } from '@/lib/db/schema'
import { runInput } from '@/lib/validation/schemas'
import type { QuerySpec } from '@/lib/engine/types'

export const runtime = 'nodejs'
export const maxDuration = 300 // Vercel Pro. On Hobby this is capped at 60.

export async function POST(req: Request) {
  const session = await auth(); if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const parsed = runInput.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  const { connectionId, testRunId, iterationIndex, spec, includeRaw } = parsed.data
  const conn = await loadConnection(connectionId); if (!conn) return NextResponse.json({ error: 'connection not found' }, { status: 404 })

  const startedAt = new Date()
  const result = await runSingleQuery(new LightdashClient(conn), spec as QuerySpec, { timeoutMs: 45000 })

  if (testRunId) {
    const db = getDb()
    await db.insert(queryExecutions).values({
      testRunId,
      iterationIndex,
      status: result.status,
      submitMs: result.timings.submitMs,
      queueTimeMs: result.timings.queueTimeMs ?? undefined,
      warehouseExecMs: result.timings.warehouseExecMs ?? undefined,
      pollOverheadMs: result.timings.pollOverheadMs,
      resultsFetchMs: result.timings.resultsFetchMs,
      totalWallClockMs: result.timings.totalWallClockMs,
      lightdashQueryUuid: result.lightdashQueryUuid ?? undefined,
      serverPerf: result.serverPerf ?? undefined,
      rowCount: result.rowCount ?? undefined,
      errorMessage: result.errorMessage ?? undefined,
      startedAt,
      finishedAt: new Date(),
    })
  }

  // Only the single-query Explorer needs the raw payload (to show the JSON view).
  // Concurrency fan-out discards it, so omit it there to avoid shipping up to
  // thousands of full row pages to the browser.
  return NextResponse.json(includeRaw ? result : { ...result, raw: undefined })
}
