import NextAuth from 'next-auth'
import { authConfig } from '@/lib/auth/config'

const { auth } = NextAuth(authConfig)

export const middleware = auth

export const config = {
  matcher: ['/((?!api/auth|sign-in|_next/static|_next/image|favicon.ico).*)'],
}
