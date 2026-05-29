import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { loadConnection } from '@/lib/connections/service'
import { LightdashClient } from '@/lib/engine/lightdash-client'

export const runtime = 'nodejs'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth(); if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  const conn = await loadConnection(id); if (!conn) return NextResponse.json({ error: 'not found' }, { status: 404 })
  try { await new LightdashClient(conn).listExplores(); return NextResponse.json({ ok: true }) }
  catch (e) { return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 200 }) }
}
