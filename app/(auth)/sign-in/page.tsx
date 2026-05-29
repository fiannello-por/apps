'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

export default function SignInPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      })
      if (result?.error) {
        setError('Invalid email or password.')
      } else {
        router.push('/explorer')
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-[18px] font-semibold tracking-[-0.45px] text-black leading-[1.33]">
            LD Perf
          </h1>
          <p className="mt-1 text-[14px] text-[#737373]">
            Lightdash Performance Control Plane
          </p>
        </div>

        <Card className="border border-[#e5e5e5] rounded-[14px] shadow-[oklab(0.145_-0.00000143796_0.00000340492_/_0.1)_0px_0px_0px_1px] bg-white">
          <CardHeader className="px-4 pt-4 pb-2">
            <CardTitle className="text-[18px] font-semibold tracking-[-0.45px] text-black leading-[1.33]">
              Sign in
            </CardTitle>
            <CardDescription className="text-[14px] text-[#737373]">
              Enter your credentials to access your account
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="email" className="text-[14px] font-medium text-[#0a0a0a]">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="border-[#e5e5e5] rounded-[10px] text-[14px] text-[#0a0a0a] placeholder:text-[#737373] px-[10px] py-[4px]"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="password" className="text-[14px] font-medium text-[#0a0a0a]">
                  Password
                </Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="border-[#e5e5e5] rounded-[10px] text-[14px] text-[#0a0a0a] placeholder:text-[#737373] px-[10px] py-[4px]"
                />
              </div>

              {error && (
                <p className="text-[13px] text-[#c22b10]" role="alert">
                  {error}
                </p>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-black text-white rounded-[10px] text-[14px] font-medium py-2 hover:bg-[#383838] transition-colors disabled:opacity-50"
              >
                {loading ? 'Signing in…' : 'Sign in'}
              </Button>

              <p className="text-center text-[13px] text-[#737373]">
                Don&apos;t have an account?{' '}
                <Link href="/sign-up" className="text-[#0a0a0a] font-medium hover:underline">
                  Sign up
                </Link>
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
