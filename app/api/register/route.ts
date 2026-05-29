import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import { users } from '@/lib/db/schema'

export const runtime = 'nodejs'

const Body = z.object({ email: z.string().email(), password: z.string().min(8), name: z.string().optional() })

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  const { email, password, name } = parsed.data
  const db = getDb()
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1)
  if (existing) return NextResponse.json({ error: 'Email already registered' }, { status: 409 })
  const passwordHash = await bcrypt.hash(password, 10)
  const [u] = await db.insert(users).values({ email, passwordHash, name }).returning({ id: users.id })
  return NextResponse.json({ id: u.id }, { status: 201 })
}
