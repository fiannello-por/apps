'use client'

import { Suspense, useState } from 'react'
import { signIn } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AuthError, GoogleButton } from '@/components/auth-card'

function SignInInner() {
  const params = useSearchParams()
  const error = params.get('error')
  const [loading, setLoading] = useState(false)

  return (
    <Card className="w-full max-w-[400px] animate-in fade-in-0 zoom-in-95 duration-300">
      <CardHeader>
        <CardTitle className="text-[20px] font-semibold tracking-[-0.4px]">Sign in</CardTitle>
        <CardDescription className="text-[14px]">
          Use your Google account to access the control plane.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error && <AuthError message="Sign-in failed or was cancelled. Please try again." />}
        <GoogleButton
          loading={loading}
          onClick={() => {
            setLoading(true)
            signIn('google', { callbackUrl: '/explorer' })
          }}
        />
      </CardContent>
    </Card>
  )
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInInner />
    </Suspense>
  )
}
