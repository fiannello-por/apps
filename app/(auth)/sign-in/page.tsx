'use client'

import { Suspense, useState } from 'react'
import { signIn } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import { AuthCard, AuthError, GoogleButton } from '@/components/auth-card'

function SignInInner() {
  const params = useSearchParams()
  const error = params.get('error')
  const [loading, setLoading] = useState(false)

  return (
    <AuthCard
      title="Sign in"
      subtitle="Use your Google account to access the control plane."
      footer={<span className="font-mono text-[11px] uppercase tracking-[0.12em]">Access via Google</span>}
    >
      {error && <AuthError message="Sign-in failed or was cancelled. Please try again." />}
      <GoogleButton
        loading={loading}
        onClick={() => {
          setLoading(true)
          signIn('google', { callbackUrl: '/explorer' })
        }}
      />
    </AuthCard>
  )
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInInner />
    </Suspense>
  )
}
