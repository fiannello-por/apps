'use client'

import { Suspense, useState } from 'react'
import { signIn } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import { AuthError, GoogleButton } from '@/components/auth-card'

function SignInInner() {
  const params = useSearchParams()
  const error = params.get('error')
  const [loading, setLoading] = useState(false)

  return (
    <div className="w-full max-w-[400px] animate-in fade-in-0 zoom-in-[0.98] duration-300 ease-out">
      <div className="rounded-[16px] border border-subtle-ash bg-canvas-white p-8 shadow-[0_1px_3px_rgba(10,10,10,0.05),0_16px_48px_-20px_rgba(10,10,10,0.22)]">
        {/* Heading */}
        <div className="flex flex-col items-center text-center">
          <h1 className="text-[20px] font-semibold tracking-[-0.4px] text-deep-black">
            Sign in
          </h1>
          <p className="mt-2 max-w-[280px] text-[13.5px] leading-[1.5] text-midtone-gray">
            Use your Google account to access the control plane.
          </p>
        </div>

        {/* Action */}
        <div className="mt-7 flex flex-col gap-3">
          {error && <AuthError message="Sign-in failed or was cancelled. Please try again." />}
          <GoogleButton
            loading={loading}
            onClick={() => {
              setLoading(true)
              signIn('google', { callbackUrl: '/explorer' })
            }}
          />
        </div>

        {/* Fine print */}
        <p className="mt-6 text-center text-[11.5px] leading-[1.5] text-midtone-gray">
          Access is restricted to authorized accounts.
        </p>
      </div>
    </div>
  )
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInInner />
    </Suspense>
  )
}
