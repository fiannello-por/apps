import type { NextAuthConfig } from 'next-auth'

export const authConfig = {
  session: { strategy: 'jwt' },
  pages: { signIn: '/sign-in' },
  providers: [],
  callbacks: {
    authorized({ auth }) {
      return !!auth?.user
    },
    jwt({ token, user }) {
      if (user) token.id = user.id
      return token
    },
    session({ session, token }) {
      // token.sub is always set by Auth.js to the user id; token.id is our explicit copy.
      if (session.user) session.user.id = (token.id ?? token.sub) as string
      return session
    },
  },
} satisfies NextAuthConfig
