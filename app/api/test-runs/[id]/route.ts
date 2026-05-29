import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getDb } from '@/lib/db/client'
import { testRuns, queryExecutions } from '@/lib/db/schema'
import { summarize } from '@/lib/engine/aggregate'
import { eq, asc } from 'drizzle-orm'

export const runtime = 'nodejs'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await params
  const db = getDb()

  const [run] = await db.select().from(testRuns).where(eq(testRuns.id, id)).limit(1)
  if (!run) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const executions = await db
    .select()
    .from(queryExecutions)
    .where(eq(queryExecutions.testRunId, id))
    .orderBy(asc(queryExecutions.iterationIndex))

  return NextResponse.json({ run, executions })
}

export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await params
  const db = getDb()

  const execs = await db
    .select()
    .from(queryExecutions)
    .where(eq(queryExecutions.testRunId, id))

  const agg = summarize(
    execs.map(e => ({ status: e.status, totalWallClockMs: e.totalWallClockMs ?? 0 })),
  )

  const status =
    execs.length === 0
      ? 'failed'
      : execs.some(e => e.status !== 'ok')
        ? 'partial'
        : 'completed'

  await db
    .update(testRuns)
    .set({ aggregates: agg, status, finishedAt: new Date() })
    .where(eq(testRuns.id, id))

  return NextResponse.json({ ok: true, aggregates: agg, status })
}
