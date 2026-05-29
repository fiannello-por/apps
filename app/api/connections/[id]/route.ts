import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { getDb } from '@/lib/db/client'
import { connections } from '@/lib/db/schema'
import { encrypt } from '@/lib/crypto/encryption'
import { connectionInput } from '@/lib/validation/schemas'

export const runtime = 'nodejs'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const parsed = connectionInput.partial().safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const db = getDb()
  const [existing] = await db
    .select({ id: connections.id })
    .from(connections)
    .where(eq(connections.id, id))
    .limit(1)

  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const { name, baseUrl, projectUuid, token } = parsed.data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: Record<string, any> = { updatedAt: new Date() }
  if (name !== undefined) updates.name = name
  if (baseUrl !== undefined) updates.baseUrl = baseUrl
  if (projectUuid !== undefined) updates.projectUuid = projectUuid
  if (token !== undefined) updates.encryptedToken = encrypt(token)

  await db.update(connections).set(updates).where(eq(connections.id, id))

  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await params
  const db = getDb()

  try {
    await db.delete(connections).where(eq(connections.id, id))
  } catch (e) {
    const msg = (e as Error).message ?? ''
    if (msg.includes('foreign key') || msg.includes('violates') || msg.includes('constraint')) {
      return NextResponse.json(
        { error: 'Cannot delete connection: it is referenced by existing test runs.' },
        { status: 409 }
      )
    }
    throw e
  }

  return NextResponse.json({ ok: true })
}
