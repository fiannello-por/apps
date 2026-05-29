import type { NextAuthConfig } from 'next-auth'

export const authConfig = {
  session: { strategy: 'jwt' },
  pages: { signIn: '/sign-in' },
  providers: [],
  callbacks: {
    authorized({ auth }) {
      return !!auth?.user
    },
    session({ session, token }) {
      // token.id is our internal users.id, set by the jwt callback in lib/auth/index.ts
      // on sign-in; token.sub is Google's id as a fallback.
      if (session.user) session.user.id = (token.id ?? token.sub) as string
      return session
    },
  },
} satisfies NextAuthConfig
