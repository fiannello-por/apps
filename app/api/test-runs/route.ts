import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getDb } from '@/lib/db/client'
import { testRuns, connections } from '@/lib/db/schema'
import { testRunInput } from '@/lib/validation/schemas'
import { desc, eq } from 'drizzle-orm'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = testRunInput.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { connectionId, spec, mode, concurrency, iterations } = parsed.data
  const db = getDb()

  const [row] = await db
    .insert(testRuns)
    .values({
      connectionId,
      endpointType: spec.endpointType,
      payload: spec,
      mode,
      concurrency,
      iterations,
      status: 'running',
      createdBy: session.user.id,
    })
    .returning({ id: testRuns.id })

  return NextResponse.json({ id: row.id }, { status: 201 })
}

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const db = getDb()
  const rows = await db
    .select({
      id: testRuns.id,
      connectionId: testRuns.connectionId,
      connectionName: connections.name,
      endpointType: testRuns.endpointType,
      mode: testRuns.mode,
      concurrency: testRuns.concurrency,
      iterations: testRuns.iterations,
      status: testRuns.status,
      aggregates: testRuns.aggregates,
      startedAt: testRuns.startedAt,
      finishedAt: testRuns.finishedAt,
    })
    .from(testRuns)
    .leftJoin(connections, eq(connections.id, testRuns.connectionId))
    .orderBy(desc(testRuns.startedAt))
    .limit(100)

  return NextResponse.json(rows)
}
