import * as React from 'react'

export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <div className="w-full max-w-[400px] animate-in fade-in-0 slide-in-from-bottom-3 duration-500 ease-out">
      {/* Brand */}
      <div className="mb-8 flex flex-col items-center gap-3.5">
        <div className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-deep-black shadow-[0_2px_10px_-2px_rgba(10,10,10,0.45)]">
          <span className="font-mono text-[14px] font-semibold tracking-tight text-white">LD</span>
        </div>
        <div className="text-center">
          <h1 className="text-[15px] font-semibold tracking-[-0.3px] text-deep-black">LD Perf</h1>
          <p className="mt-1 font-mono text-[10.5px] uppercase tracking-[0.14em] text-midtone-gray">
            Performance Control Plane
          </p>
        </div>
      </div>

      {/* Card */}
      <div className="rounded-[14px] border border-subtle-ash bg-canvas-white p-6 shadow-[0_1px_2px_rgba(10,10,10,0.04),0_12px_32px_-16px_rgba(10,10,10,0.16)]">
        <div className="mb-6">
          <h2 className="text-[17px] font-semibold tracking-[-0.3px] text-deep-black">{title}</h2>
          <p className="mt-1 text-[13px] leading-[1.5] text-midtone-gray">{subtitle}</p>
        </div>
        {children}
      </div>

      {footer && <div className="mt-6 text-center text-[13px] text-midtone-gray">{footer}</div>}
    </div>
  )
}

export function AuthError({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="mb-4 rounded-[9px] border border-callout-red/20 bg-callout-red/[0.04] px-3 py-2.5 text-[13px] leading-snug text-callout-red"
    >
      {message}
    </div>
  )
}

export function GoogleButton({
  onClick,
  loading,
  label = 'Continue with Google',
}: {
  onClick: () => void
  loading?: boolean
  label?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="inline-flex h-11 w-full items-center justify-center gap-2.5 rounded-[10px] border border-subtle-ash bg-canvas-white text-[14px] font-medium text-rich-black transition-colors hover:bg-ghost-gray active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
    >
      <GoogleIcon />
      {loading ? 'Redirecting…' : label}
    </button>
  )
}

function GoogleIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 18 18" aria-hidden focusable="false">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  )
}
