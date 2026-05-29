import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getDb } from '@/lib/db/client'
import { connections } from '@/lib/db/schema'
import { encrypt } from '@/lib/crypto/encryption'
import { connectionInput } from '@/lib/validation/schemas'

export const runtime = 'nodejs'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const db = getDb()
  const rows = await db
    .select({
      id: connections.id,
      name: connections.name,
      baseUrl: connections.baseUrl,
      projectUuid: connections.projectUuid,
      createdAt: connections.createdAt,
    })
    .from(connections)

  return NextResponse.json(rows)
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = connectionInput.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { name, baseUrl, projectUuid, token } = parsed.data
  const db = getDb()
  const [row] = await db
    .insert(connections)
    .values({
      name,
      baseUrl,
      projectUuid,
      encryptedToken: encrypt(token),
      createdBy: session.user.id,
    })
    .returning({ id: connections.id })

  return NextResponse.json({ id: row.id }, { status: 201 })
}
