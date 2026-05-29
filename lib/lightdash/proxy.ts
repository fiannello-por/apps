import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { loadConnection } from '@/lib/connections/service'
import { LightdashClient } from '@/lib/engine/lightdash-client'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ClientCallback = (client: LightdashClient) => Promise<any>

export async function lightdashProxy(req: Request, callback: ClientCallback): Promise<NextResponse> {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const id = new URL(req.url).searchParams.get('connectionId')
  if (!id) return NextResponse.json({ error: 'connectionId required' }, { status: 400 })

  const conn = await loadConnection(id)
  if (!conn) return NextResponse.json({ error: 'not found' }, { status: 404 })

  try {
    return NextResponse.json(await callback(new LightdashClient(conn)))
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }
}
