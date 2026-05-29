import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { authConfig } from './config'
import { getDb } from '@/lib/db/client'
import { users } from '@/lib/db/schema'

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(creds) {
        const email = String(creds?.email ?? '')
        const password = String(creds?.password ?? '')
        if (!email || !password) return null
        const db = getDb()
        const [u] = await db.select().from(users).where(eq(users.email, email)).limit(1)
        if (!u) return null
        if (!(await bcrypt.compare(password, u.passwordHash))) return null
        return { id: u.id, email: u.email, name: u.name ?? undefined }
      },
    }),
  ],
})
