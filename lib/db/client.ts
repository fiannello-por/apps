import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http'
import { neon } from '@neondatabase/serverless'
import * as schema from './schema'

type DB = NeonHttpDatabase<typeof schema>

let _db: DB | null = null

/**
 * Lazily create the Drizzle client. The connection is established on first use
 * (not at module import) so that `next build` and other tooling don't require a
 * live DATABASE_URL just to bundle the code.
 */
export function getDb(): DB {
  if (!_db) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL is not set')
    _db = drizzle(neon(url), { schema })
  }
  return _db
}
