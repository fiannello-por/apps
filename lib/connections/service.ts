import { eq } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import { connections } from '@/lib/db/schema'
import { decrypt } from '@/lib/crypto/encryption'
import type { Connection } from '@/lib/engine/types'

export async function loadConnection(id: string): Promise<Connection | null> {
  const db = getDb()
  const [c] = await db.select().from(connections).where(eq(connections.id, id)).limit(1)
  if (!c) return null
  return { baseUrl: c.baseUrl, projectUuid: c.projectUuid, token: decrypt(c.encryptedToken) }
}
