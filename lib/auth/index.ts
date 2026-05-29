import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { authConfig } from './config'
import { getDb } from '@/lib/db/client'
import { users } from '@/lib/db/schema'

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [Google],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, account, profile }) {
      // On initial Google sign-in, upsert the user into our own users table and
      // stamp our internal id onto the token so the rest of the app (e.g.
      // connections.createdBy) can reference a stable users.id.
      if (account && profile?.email) {
        const db = getDb()
        const name = (profile.name as string | undefined) ?? null
        const image = (profile as { picture?: string }).picture ?? null
        const [row] = await db
          .insert(users)
          .values({ email: profile.email, name, image })
          .onConflictDoUpdate({ target: users.email, set: { name, image } })
          .returning({ id: users.id })
        if (row) token.id = row.id
      }
      return token
    },
  },
})
